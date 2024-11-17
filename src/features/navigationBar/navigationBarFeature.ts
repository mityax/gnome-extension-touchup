import ExtensionFeature from "$src/utils/extensionFeature";
import BaseNavigationBar from "./widgets/baseNavigationBar";
import GestureNavigationBar from "./widgets/gestureNavigationBar";
import ButtonsNavigationBar from "./widgets/buttonsNavigationBar";
import {settings} from "$src/features/preferences/settings";
import Clutter from "gi://Clutter";
import Signal from "$src/utils/signal";
import {log} from "$src/utils/logging";
import * as Main from "resource:///org/gnome/shell/ui/main.js";


export  type NavbarMode = 'gestures' | 'buttons';

export default class NavigationBarFeature extends ExtensionFeature {
    declare private currentNavBar: BaseNavigationBar<any>;
    private oskAction: Clutter.Action | null = null;
    private declare _mode: NavbarMode;

    readonly onVisibilityChanged = new Signal<boolean>();

    constructor() {
        super();

        this.setMode(settings.navigationBar.mode.get());  // builds the appropriate navigation bar

        // Connect to monitor changes:
        this.connectTo(global.backend.get_monitor_manager(), 'monitors-changed', () => {
            this.currentNavBar.reallocate();
        });

        // Connect to settings:
        this.connectTo(settings.navigationBar.mode, 'changed', (mode) => {
            log(`Mode changed: ${mode}`);
            this.setMode(mode);
        });
        this.connectTo(settings.navigationBar.gesturesReserveSpace, 'changed', (value) => {
            if (this._mode === 'gestures') {
                this.currentNavBar.setReserveSpace(value);
            }
        });

        this.onCleanup(() => this.currentNavBar.destroy());
        this.onCleanup(() => this.setOSKActionEnabled(true));
        this.onCleanup(() => this.setGlobalStyleClassesEnabled(false))
    }

    setMode(mode: NavbarMode) {
        if (mode === this._mode) {
            return;
        }

        this._mode = mode;
        const visible = this.isVisible;
        this.currentNavBar?.destroy();

        switch (mode) {
            case 'gestures':
                this.currentNavBar = new GestureNavigationBar({reserveSpace: settings.navigationBar.gesturesReserveSpace.get()});
                break;
            case 'buttons':
                this.currentNavBar = new ButtonsNavigationBar();
                break;
            default:
                log(`NavigationBarFeature.setMode() called with an unknown mode: ${mode}`);
                this.currentNavBar = new GestureNavigationBar({reserveSpace: settings.navigationBar.gesturesReserveSpace.get()});
        }

        if (visible) {
            this.currentNavBar.show();
        }
        this.setOSKActionEnabled(this._mode !== 'gestures');
    }

    get mode(): NavbarMode {
        return this._mode;
    }

    show() {
        this.currentNavBar.show();
        this.onVisibilityChanged.emit(true);
        this.setGlobalStyleClassesEnabled(true);
    }

    hide() {
        this.currentNavBar.hide();
        this.onVisibilityChanged.emit(false);
        this.setGlobalStyleClassesEnabled(false);
    }

    get isVisible(): boolean {
        return this.currentNavBar?.isVisible ?? false;
    }

    /**
     * Adds/removes style classes to allow the CSS-side of this extension to style different elements
     * across the desktop in accordance with the current navigation bar mode and visibility.
     * @param enabled Whether to set or unset the global style classes
     */
    private setGlobalStyleClassesEnabled(enabled: boolean) {
        if (enabled) {
            Main.uiGroup.add_style_class_name(`gnometouch-navbar-visible--${this.mode}`);
            Main.uiGroup.add_style_class_name(`gnometouch-navbar-visible`);
        } else {
            Main.uiGroup.style_class = Main.uiGroup.style_class.replace(/\s*gnometouch-navbar-visible(-\w+)?/g, '');
        }
    }

    private setOSKActionEnabled(enabled: boolean) {
        if (enabled && this.oskAction) {  // `this.oskAction` is only set if the action has been removed earlier
            global.stage.add_action_full('osk', Clutter.EventPhase.CAPTURE, this.oskAction);
            this.oskAction = null;
        } else if (!enabled) {
            this.oskAction = global.stage.get_action('osk')!;
            global.stage.remove_action(this.oskAction);
        }
    }
}
