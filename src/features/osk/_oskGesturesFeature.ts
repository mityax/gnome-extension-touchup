//@ts-ignore
import * as Keyboard from 'resource:///org/gnome/shell/ui/keyboard.js';

import ExtensionFeature from "../../utils/extensionFeature";
import {PatchManager} from "$src/utils/patchManager";
import {EventType, GestureRecognizer, GestureRecognizerEvent} from "$src/utils/ui/gestureRecognizer";
import St from "gi://St";
import Clutter from "@girs/clutter-16";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import {settings} from "$src/settings";
import {findAllActorsBy} from "$src/utils/utils";
import {debugLog} from "$src/utils/logging";


export default class OSKGesturesFeature extends ExtensionFeature {
    declare private _enableSwipeToClose: boolean;
    declare private _enableExtendKeys: boolean;

    constructor(pm: PatchManager) {
        super(pm);

        this._setupSwipeToClose();
        this._setupExtendKeys();

        // Sync relevant settings to class attributes for performance during the gesture and code
        // readability below:
        this.pm.bindSetting(settings.osk.gestures.swipeToClose.enabled,
            (v) => this._enableSwipeToClose = v);
        this.pm.bindSetting(settings.osk.gestures.extendKeys.enabled,
            (v) => this._enableExtendKeys = v);
    }

    private _setupSwipeToClose() {
        const recognizer = new GestureRecognizer({
            scaleFactor: St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scaleFactor,
            onGestureProgress: state => {
                if (state.firstMotionDirection?.direction === 'down') {
                    Main.keyboard._keyboard.gestureProgress(Main.keyboard._keyboard.height - state.totalMotionDelta.y);
                }
            },
            onGestureCompleted: state => {
                if (state.lastMotionDirection?.direction === 'down') {
                    Main.keyboard._keyboard.gestureCancel();
                } else {
                    // The following line is a required hack to make the keyboard animate back up; since the
                    // keyboard's gesture functionality is only intended for opening the keyboard, not for closing,
                    // let alone canceling closing it. Thus, when the swipe-to-close gesture is cancelled, we tell the
                    // keyboard it's not open yet, which perfectly imitates the state it'd be in had we opened it
                    // using the gesture as normal instead of swipe-closing and then cancelling.
                    Main.keyboard._keyboard._keyboardVisible = false;

                    Main.keyboard._keyboard.gestureActivate();
                }
            },
        });

        const self = this;
        let patchedKeyboard: Keyboard.Keyboard | null = null;

        this.pm.appendToMethod(Keyboard.Keyboard.prototype, 'open', function (this: Keyboard.Keyboard & St.BoxLayout) {
            debugLog("open finished, now ", patchedKeyboard === this ? 'not patching' : 'patching');

            if (patchedKeyboard !== this) {
                patchedKeyboard = this;
                self.pm.connectTo(this, 'touch-event', (_, e) => {
                    if (self._enableSwipeToClose) {
                        recognizer.push(GestureRecognizerEvent.fromClutterEvent(e));
                    }
                });
            }
        });

        this.pm.appendToMethod(Keyboard.Keyboard.prototype, '_animateShow', () => {
            debugLog("_animateShow finished");
        });
        this.pm.appendToMethod(Keyboard.Keyboard.prototype, '_open', () => {
            debugLog("_open finished");
        });
    }

    private _setupExtendKeys() {
        const self = this;
        const patched = new Set();  // keep track of all already patched keys

        this.pm.appendToMethod(Keyboard.Keyboard.prototype, 'open', function (this: Keyboard.Keyboard & St.BoxLayout) {
            const patch = self.pm.patch(() => {
                const keys = findAllActorsBy(this, (a) => (
                    a.constructor.name === 'Key' && !patched.has(a)
                ));
                const disconnects: (() => void)[] = [];

                for (let key of keys) {
                    patched.add(key);

                    key.reactive = true;
                    const signalId = key.connect('touch-event', (_, e) => {
                        const evt = GestureRecognizerEvent.fromClutterEvent(e);

                        if (evt.type === EventType.start) {
                            // @ts-ignore
                            key.keyButton.emit("touch-event", e);
                        } else if (evt.type === EventType.end) {
                            // @ts-ignore
                            key.keyButton.emit("touch-event", e);
                        }
                    });

                    disconnects.push(() => key.disconnect(signalId));
                }

                return () => {
                    keys.forEach(k => k.reactive = false);
                    disconnects.forEach(d => d());
                };
            });

            // When the keyboard is destroyed, there's no use anymore in unpatching the keys (in fact,
            // it would lead to errors – disconnecting from an already destroyed actor). Thus, we drop
            // the patch when they keyboard is destroyed:
            this.connect('destroy', () => self.pm.drop(patch));
        });
    }
}