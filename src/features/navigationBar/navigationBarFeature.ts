import ExtensionFeature from "$src/utils/extensionFeature";
import BaseNavigationBar from "./widgets/baseNavigationBar";
import GestureNavigationBar from "./widgets/gestureNavigationBar";
import ButtonsNavigationBar from "./widgets/buttonsNavigationBar";
import {settings} from "$src/settings";
import Clutter from "gi://Clutter";
import Signal from "$src/utils/signal";
import {log} from "$src/utils/logging";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import {Patch, PatchManager} from "$src/utils/patchManager";


export  type NavbarMode = 'gestures' | 'buttons';

export default class NavigationBarFeature extends ExtensionFeature {
    declare private currentNavBar: BaseNavigationBar<any>;
    private declare _mode: NavbarMode;

    readonly onVisibilityChanged = new Signal<boolean>();
    private removeOskActionPatch: Patch;

    constructor(pm: PatchManager) {
        super(pm);

        // Connect to monitor changes:
        this.pm.connectTo(global.backend.get_monitor_manager(), 'monitors-changed', () => {
            this.currentNavBar.reallocate();
        });

        // Connect to settings:
        this.pm.connectTo(settings.navigationBar.mode, 'changed', (mode) => {
            this.setMode(mode);
        });
        this.pm.connectTo(settings.navigationBar.gesturesReserveSpace, 'changed', (value) => {
            if (this._mode === 'gestures') {
                this.currentNavBar.setReserveSpace(value);
            }
        });

        this.removeOskActionPatch = this.pm.patch(() => {
            let oskAction = global.stage.get_action('osk')!;
            if (oskAction) global.stage.remove_action(oskAction);

            return () => {
                if (oskAction) global.stage.add_action_full('osk', Clutter.EventPhase.CAPTURE, oskAction)
            };
        });

        this.setMode(settings.navigationBar.mode.get());  // builds the appropriate navigation bar
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
                this._mode = 'gestures';
                this.currentNavBar = new GestureNavigationBar({reserveSpace: settings.navigationBar.gesturesReserveSpace.get()});
        }

        if (visible) {
            this.currentNavBar.show();
            this.updateGlobalStyleClasses();
        }

        this._mode == 'gestures'
            ? this.removeOskActionPatch.enable()
            : this.removeOskActionPatch.disable();
    }

    get mode(): NavbarMode {
        return this._mode;
    }

    show() {
        if (this.isVisible) return;
        this.currentNavBar.show();
        this.onVisibilityChanged.emit(true);
        this.updateGlobalStyleClasses();
    }

    hide() {
        if (!this.isVisible) return;
        this.currentNavBar.hide();
        this.onVisibilityChanged.emit(false);
        this.removeGlobalStyleClasses();
    }

    get isVisible(): boolean {
        return this.currentNavBar?.isVisible ?? false;
    }

    /**
     * Adds/updates style classes to Main.uiGroup to allow the CSS-side of this extension to style
     * different elements across the desktop in accordance with the current navigation bar mode and
     * visibility. This is for example used to move up the dash to make place for the navigation bar
     * below it.
     */
    private updateGlobalStyleClasses() {
        this.removeGlobalStyleClasses();
        Main.uiGroup.add_style_class_name(`touchup-navbar--${this.mode}`);
        Main.uiGroup.add_style_class_name(`touchup-navbar--visible`);
    }

    /**
     * Remove any style class from Main.uiGroup that was added by [updateGlobalStyleClasses]
     */
    private removeGlobalStyleClasses() {
        Main.uiGroup.styleClass = (Main.uiGroup.styleClass as string)
            .split(/\s+/)
            .filter(c => !c.startsWith('touchup-navbar--'))
            .join(' ')
    }

    destroy() {
        this.removeGlobalStyleClasses()
        this.currentNavBar?.destroy();
        super.destroy();
    }
}
