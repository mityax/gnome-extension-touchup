// @ts-ignore
import * as Keyboard from 'resource:///org/gnome/shell/ui/keyboard.js';
// @ts-ignore
import {getInputSourceManager, InputSource} from 'resource:///org/gnome/shell/ui/status/keyboard.js';

import ExtensionFeature from "$src/core/extensionFeature";
import TouchUpExtension from "../../extension";
import {NavigationBarFeature} from "../navigationBar/navigationBarFeature";
import GestureNavigationBar from "$src/features/navigationBar/widgets/gestureNavigationBar";
import {PatchManager} from "$src/core/patchManager";
import {findAllActorsBy, SHELL_VERSION} from "$src/utils/shellUtils";
import {assertExhaustive} from "$src/utils/utils";
import {extractKeyPrototype} from "$src/features/osk/_oskUtils";
import St from "gi://St";
import {GestureRecognizer} from "$src/utils/gestures/gestureRecognizer";
import Clutter from "gi://Clutter";
import * as Widgets from "$src/utils/ui/widgets";
import {Ref} from "$src/utils/ui/widgets";
import {settings} from "$src/settings";


type KeyboardKey = Keyboard.Key & St.BoxLayout;  // the `Key` class is not exported by the Shell


export class OskSpaceBarIMESwitchingFeature extends ExtensionFeature {
    private recognizer: GestureRecognizer;
    private subpm: PatchManager | null = null;
    private keyboard: Keyboard.Keyboard | null;

    constructor(pm: PatchManager, keyboard: Keyboard.Keyboard | null) {
        super(pm);

        // We can use one shared gesture recognizer since only one space bar will only ever be
        // visible at a time:
        this.recognizer = new GestureRecognizer({
            onGestureEnded: state => {
                if (state.finalMotionDirection?.axis === 'horizontal') {
                    const d = state.finalMotionDirection.direction === 'left'
                        ? 'backward'
                        : 'forward';
                    const nextSource = this._getNextInputSource(d);
                    if (nextSource) {
                        this._activateInputSource(nextSource);
                    }
                }
            }
        });

        if (keyboard != null) {
            this.onNewKeyboard(keyboard);
        }

        this.pm.connectTo(settings.osk.spaceBarIMESwitching.indicatorMode, 'changed', () => {
            this.onNewKeyboard(this.keyboard);
        });

        // Recreate our patches whenever the keyboard is rebuilt:
        const self = this;
        this.pm.appendToMethod(Keyboard.Keyboard.prototype, '_updateKeys', function (this: Keyboard.Keyboard) {
            self.onNewKeyboard(this);
        });
    }

    onNewKeyboard(keyboard: Keyboard.Keyboard) {
        this.keyboard = keyboard;
        this._patchKeyboard();
    }

    private _patchKeyboard() {
        // We use a separate [PatchManager] for each new keyboard, that we destroy here, to ensure to never
        // patch a keyboard twice:
        this.subpm?.destroy();
        this.subpm = this.pm.fork();

        const keyProto = extractKeyPrototype(this.keyboard);

        // There are multiple space bars, one for each `KeyContainer`:
        const spaceBars = findAllActorsBy(
            this.keyboard,
            a => keyProto.isPrototypeOf(a) && (a as KeyboardKey).keyButton.label === ' ',
        ) as KeyboardKey[];

        spaceBars.forEach(b => this._patchSpaceBar(b));
    }

    private _patchSpaceBar(key: KeyboardKey) {
        const keyButton: St.Button = key.keyButton;

        // Create and add our gesture:
        const gesture = this.recognizer.createPanGesture({
            panAxis: Clutter.PanAxis.X,
        });
        this.subpm!.patch(() => {
            keyButton.add_action_full('touchup-quick-ime-switching', Clutter.EventPhase.BUBBLE, gesture);
            const ref = new Ref(keyButton);
            return () => ref.take()?.remove_action(gesture);
        });

        if (SHELL_VERSION < [51]) {
            // OSK keys use raw touch events by default until GNOME Shell v51, which conflicts with our gesture
            // handling. Thus, we'll disable the raw touch event listener, and instead make functional the built-in
            // [Clutter.ClickGesture] that [St.Button]s have anyway (this is consistent with the default behavior
            // in v51 and later):
            const clickGesture = keyButton.get_actions()[0] as Clutter.ClickGesture;
            this.subpm!.patchSignalHandler(keyButton, 'touch-event', () => null);
            this.subpm!.connectTo(clickGesture, 'may-recognize', () => {
                key._press(keyButton, ' ');
                keyButton.add_style_pseudo_class('active');
                return true;
            });
            this.subpm!.connectTo(clickGesture, 'recognize', () => {
                key._release(keyButton, ' ');
                keyButton.remove_style_pseudo_class('active');
            });
        }

        // Ensure the space bar IME switching gesture takes precedence over a possibly overlayed, invisible navigation
        // bar's gesture:
        function onNewNavBar() {
            const navBar = TouchUpExtension.instance!.getFeature(NavigationBarFeature)?.currentNavBar;
            if (navBar instanceof GestureNavigationBar) {
                navBar.gestureManager.gesture.can_not_cancel(gesture);  // can_not_cancel cannot be undone; no need to use PatchManager here
            }
        }
        this.subpm!.connectTo(TouchUpExtension.instance!, 'feature-enabled', (f) => {
            if (f instanceof NavigationBarFeature) {
                this.subpm!.connectTo(f, 'navigation-bar-changed', () => onNewNavBar());
                onNewNavBar();
            }
        });
        onNewNavBar();

        // Add the IME indicator widget to the space bar:
        this.subpm!.patch(() => {
            const indicator = new Ref(this._buildIMEIndicator());
            keyButton.add_child(indicator.current!)
            return () => indicator.take()?.destroy();
        })
    }

    private _buildIMEIndicator() {
        const {sources, currentSource} = this._getInputSources();

        if (!currentSource) return;

        const mode = settings.osk.spaceBarIMESwitching.indicatorMode.get();
        let markup = ''

        if (mode === 'all') {
            markup = sources
                .map(s => s === currentSource ? `<b>${s.shortName}</b>` : s.shortName)
                .join(" · ");
        } else if (mode === 'current') {
            markup = currentSource.displayName;
        } else if (mode === 'none') {
            markup = "";
        } else {
            assertExhaustive(mode);
        }

        return new Widgets.Label({
            styleClass: "touchup-osk-ime-indicator",
            text: markup,
            onCreated: widget => widget.clutterText.useMarkup = true,
        });
    }

    private _getNextInputSource(direction: 'forward' | 'backward' = 'forward') {
        const {sources, currentSource} = this._getInputSources();

        if (!currentSource || sources.length < 2) return null;

        const currIdx = sources.indexOf(currentSource);
        const d = direction === 'forward' ? 1 : -1;
        const newIdx = (sources.length + currIdx + d) % sources.length;

        return sources[newIdx];
    }

    private _getInputSources() {
        const manager = getInputSourceManager();

        // InputManager.inputSources is an object with int keys, for convenience we'll convert it to an array:
        const sourcesObj = manager.inputSources
        const sources = Object.keys(sourcesObj)
            .sort()
            .map(k => sourcesObj[k as keyof typeof sourcesObj]) as InputSource[];

        const currentSource: InputSource | null = manager.currentSource;
        return {sources, currentSource};
    }

    private _activateInputSource(source: InputSource) {
        source.activate(true);
    }
}
