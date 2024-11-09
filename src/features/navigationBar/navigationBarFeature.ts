import ExtensionFeature from "../../utils/extensionFeature";
import BaseNavigationBar from "./widgets/baseNavigationBar";
import GestureNavigationBar from "./widgets/gestureNavigationBar";
import ButtonsNavigationBar from "./widgets/buttonsNavigationBar";
import {settings} from "../preferences/settings";
import Clutter from "@girs/clutter-15";
import Signal from "$src/utils/signal";
import {log} from "$src/utils/logging";

export type NavbarMode = 'gestures' | 'buttons';

export default class NavigationBarFeature extends ExtensionFeature {
    declare private currentNavBar: BaseNavigationBar<any>;
    private oskAction: Clutter.Action | null = null;
    declare private mode: NavbarMode;

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
            if (this.mode === 'gestures') {
                this.currentNavBar.setReserveSpace(value);
            }
        });

        this.onCleanup(() => this.currentNavBar.destroy());
        this.onCleanup(() => this.setOSKActionEnabled(true));
    }

    setMode(mode: NavbarMode) {
        if (mode === this.mode) {
            return;
        }

        this.mode = mode;
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
        this.setOSKActionEnabled(this.mode !== 'gestures');
    }

    show() {
        this.currentNavBar.show();
        this.onVisibilityChanged.emit(true);
    }

    hide() {
        this.currentNavBar.hide();
        this.onVisibilityChanged.emit(false);
    }

    get isVisible(): boolean {
        return this.currentNavBar?.isVisible ?? false;
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
