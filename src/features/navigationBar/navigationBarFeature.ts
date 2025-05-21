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
import TouchUpExtension from "$src/extension";
import {TouchModeService} from "$src/services/touchModeService";
import {DisplayConfigState} from "$src/utils/monitorDBusUtils";


export  type NavbarMode = 'gestures' | 'buttons';

export default class NavigationBarFeature extends ExtensionFeature {
    declare private currentNavBar: BaseNavigationBar<any>;
    private declare _mode: NavbarMode;

    readonly onVisibilityChanged = new Signal<boolean>();
    private removeOskActionPatch: Patch;

    constructor(pm: PatchManager) {
        super(pm);

        // Connect to touch mode changes:
        this.pm.connectTo(TouchUpExtension.instance!.getFeature(TouchModeService)!.onChanged, 'changed', () => {
            this._updateVisibility().then(() => {});
        });

        // Connect to monitor changes:
        this.pm.connectTo(global.backend.get_monitor_manager(), 'monitors-changed', () => {
            this._updateVisibility().then(() => {});
        });

        // Connect to settings:
        this.pm.connectTo(settings.navigationBar.mode, 'changed', (mode) =>
            this.setMode(mode));
        this.pm.connectTo(settings.navigationBar.alwaysShowOnMonitor, 'changed', () =>
            this._updateVisibility());
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

        this.setMode(settings.navigationBar.mode.get()).then(() => {});  // builds the appropriate navigation bar
    }

    async setMode(mode: NavbarMode) {
        if (mode === this._mode) {
            return;
        }

        this._mode = mode;
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

        await this._updateVisibility();

        this._mode == 'gestures'
            ? this.removeOskActionPatch.enable()
            : this.removeOskActionPatch.disable();
    }

    get mode(): NavbarMode {
        return this._mode;
    }

    private async _updateVisibility() {
        const touchMode = TouchUpExtension.instance!.getFeature(TouchModeService)!.isTouchModeActive;
        const alwaysShowOnMonitor = settings.navigationBar.alwaysShowOnMonitor.get();

        const state = await DisplayConfigState.getCurrent();
        let monitorIndex: number = -1;  // `-1` is also used by `global.backend.get_monitor_manager().get_monitor_for_connector()`, which is used below, as null-value

        if (alwaysShowOnMonitor && state.monitors.some(m => m.constructMonitorId() === alwaysShowOnMonitor.id)) {
            const monitor = state.monitors.find(m => m.constructMonitorId() === alwaysShowOnMonitor.id)!;
            monitorIndex =  global.backend.get_monitor_manager().get_monitor_for_connector(monitor.connector);
        } else if (touchMode) {
            monitorIndex = global.backend.get_monitor_manager().get_monitor_for_connector(state.builtinMonitor.connector);
        }

        if (monitorIndex != -1) {
            this.currentNavBar.setMonitor(monitorIndex);
            if (!this.isVisible) {
                this.currentNavBar.show();
                this.onVisibilityChanged.emit(true);
            }
            this.updateGlobalStyleClasses();
        } else {
            if (this.isVisible) {
                this.currentNavBar.hide();
                this.onVisibilityChanged.emit(false);
            }
            this.removeGlobalStyleClasses();
        }
    }


    get isVisible(): boolean {
        return this.currentNavBar?.isVisible ?? false;
    }

    /**
     * Adds/updates style classes to [Main.layoutManager.uiGroup] to allow the CSS-side of this extension
     * to style different elements across the desktop in accordance with the current navigation bar mode
     * and visibility. This is for example used to move up the dash to make place for the navigation bar
     * below it.
     */
    private updateGlobalStyleClasses() {
        this.removeGlobalStyleClasses();
        Main.layoutManager.uiGroup.add_style_class_name(`touchup-navbar--${this.mode}`);
        Main.layoutManager.uiGroup.add_style_class_name(`touchup-navbar--visible`);
    }

    /**
     * Remove any style class from [Main.layoutManager.uiGroup] that was added by [updateGlobalStyleClasses]
     */
    private removeGlobalStyleClasses() {
        if (Main.layoutManager.uiGroup) {
            Main.layoutManager.uiGroup.styleClass = (Main.layoutManager.uiGroup.styleClass as string)
                .split(/\s+/)
                .filter(c => !c.startsWith('touchup-navbar--'))
                .join(' ')
        }
    }

    destroy() {
        this.removeGlobalStyleClasses()
        this.currentNavBar?.destroy();
        super.destroy();
    }
}

