import ExtensionFeature from "$src/utils/extensionFeature";
import BaseNavigationBar from "./widgets/baseNavigationBar";
import GestureNavigationBar from "./widgets/gestureNavigationBar";
import ButtonsNavigationBar from "./widgets/buttonsNavigationBar";
import {settings} from "$src/settings";
import Clutter from "gi://Clutter";
import {log} from "$src/utils/logging";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import {Patch, PatchManager} from "$src/utils/patchManager";
import TouchUpExtension from "$src/extension";
import {TouchModeService} from "$src/services/touchModeService";
import {DisplayConfigState} from "$src/utils/monitorDBusUtils";
import Mtk from "gi://Mtk";
import {Monitor} from "resource:///org/gnome/shell/ui/layout.js";
import {debounce} from "$src/utils/debounce";

export type NavbarMode = 'gestures' | 'buttons';


export class NavigationBarFeature extends ExtensionFeature {
    declare private _currentNavBar: BaseNavigationBar<any>;
    declare private _mode: NavbarMode;
    private _removeOskActionPatch: Patch;
    private _updatePrimaryMonitorPatch: Patch;
    private readonly _debouncedPrimaryMonitorPatchSetActive: (props: {active: boolean, force?: boolean}) => void;


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
        this.pm.connectTo(settings.navigationBar.alwaysVisible, 'changed', () =>
            this._updateVisibility());
        this.pm.connectTo(settings.navigationBar.monitor, 'changed', () =>
            this._updateVisibility());
        this.pm.connectTo(settings.navigationBar.primaryMonitorFollowsNavbar, 'changed', (enabled) => {
            if (!enabled) {
                this._debouncedPrimaryMonitorPatchSetActive({active: false});
            }
            this._updateVisibility();
        });
        this.pm.connectTo(settings.navigationBar.gesturesReserveSpace, 'changed', (value) => {
            if (this._mode === 'gestures') {
                this._currentNavBar.setReserveSpace(value);
            }
        });
        this.pm.connectTo(settings.navigationBar.gesturesInvisibleMode, 'changed', (value) => {
            if (this._mode === 'gestures') {
                (this._currentNavBar as GestureNavigationBar).setInvisibleMode(value);
            }
        });

        // Remove the OSK bottom drag action from the shell:
        this._removeOskActionPatch = this.pm.patch(() => {
            let oskAction = global.stage.get_action('osk')!;
            if (oskAction) global.stage.remove_action(oskAction);

            return () => {
                if (oskAction) global.stage.add_action_full('osk', Clutter.EventPhase.CAPTURE, oskAction)
            };
        });

        this._updatePrimaryMonitorPatch = this._createPrimaryMonitorPatch();
        // Debounce the primary monitor changes to avoid concurrency issues in rare cases:
        this._debouncedPrimaryMonitorPatchSetActive = debounce(
            (props: {active: boolean, force?: boolean}) => {
                if (props.active) {
                    this._updatePrimaryMonitorPatch.enable(props.force);
                } else {
                    this._updatePrimaryMonitorPatch.disable(props.force);
                }
            }, 120);

        // Build the appropriate navigation bar:
        this.setMode(settings.navigationBar.mode.get()).then(() => {});
    }

    async setMode(mode: NavbarMode) {
        if (mode === this._mode) {
            return;
        }

        this._currentNavBar?.destroy();

        switch (mode) {
            case 'gestures':
                this._currentNavBar = new GestureNavigationBar({
                    reserveSpace: settings.navigationBar.gesturesReserveSpace.get(),
                    invisibleMode: settings.navigationBar.gesturesInvisibleMode.get(),
                });
                break;
            case 'buttons':
                this._currentNavBar = new ButtonsNavigationBar();
                break;
            default:
                log(`NavigationBarFeature.setMode() called with an unknown mode: ${mode}`);
                await this.setMode('gestures');
                return;
        }

        this._mode = mode;

        await this._updateVisibility();

        this._mode == 'gestures'
            ? this._removeOskActionPatch.enable()
            : this._removeOskActionPatch.disable();
    }

    get mode(): NavbarMode {
        return this._mode;
    }

    get isVisible(): boolean {
        return this._currentNavBar?.isVisible ?? false;
    }

    private async _updateVisibility() {
        let monitorIndex = await this._getNavigationBarTargetMonitor();

        if (monitorIndex != null) {
            // Update the navbar monitor:
            this._currentNavBar.setMonitor(monitorIndex);

            // If enabled, make the primary monitor follow the navbar:
            if (settings.navigationBar.primaryMonitorFollowsNavbar.get()) {
                this._debouncedPrimaryMonitorPatchSetActive({active: true, force: true});  // `force=true` to enable changing the monitor again if it has already been changed before
            }

            // Show the navbar if it's not visible already, and trigger signal handlers:
            if (!this.isVisible) {
                this._currentNavBar.show();
            }

            // Update style classes to reflect the current state:
            this._updateGlobalStyleClasses();
        } else {
            // If the navbar is visible, hide it and trigger signal handlers:
            if (this.isVisible) {
                this._currentNavBar.hide();
            }

            // Restore the original primary monitor if it has been changed before:
            if (settings.navigationBar.primaryMonitorFollowsNavbar.get()) {
                this._debouncedPrimaryMonitorPatchSetActive({active: false});
            }

            // Remove all global style classes:
            this._removeGlobalStyleClasses();
        }
    }

    /**
     * Finds out whether the navigation bar should currently be visible and, if so, on which monitor
     * it should be placed.
     *
     * Returns `null` if the navigation bar should be hidden and the appropriate monitor index otherwise.
     */
    private async _getNavigationBarTargetMonitor() {
        const touchMode = TouchUpExtension.instance!.getFeature(TouchModeService)!.isTouchModeActive;
        const alwaysVisible = settings.navigationBar.alwaysVisible.get();
        const selectedMonitor = settings.navigationBar.monitor.get();

        if (!alwaysVisible && !touchMode) return null;

        const state = await DisplayConfigState.getCurrent();
        let monitorIndex: number = -1;  // `-1` is also used by `global.backend.get_monitor_manager().get_monitor_for_connector()`, which is used below, as null-value

        if (selectedMonitor) {
            const monitor = state.monitors.find(m => m.constructMonitorId() === selectedMonitor.id);
            monitorIndex = monitor !== undefined
                ? global.backend.get_monitor_manager().get_monitor_for_connector(monitor.connector)
                : -1;
        } else {
            monitorIndex = global.backend.get_monitor_manager().get_monitor_for_connector(state.builtinMonitor.connector);
        }
 
        return monitorIndex === -1 ? null : monitorIndex;
    }

    /**
     * Adds/updates style classes to [Main.layoutManager.uiGroup] to allow the CSS-side of this extension
     * to style different elements across the desktop in accordance with the current navigation bar mode
     * and visibility. This is for example used to move up the dash to make place for the navigation bar
     * below it.
     */
    private _updateGlobalStyleClasses() {
        const isInInvisibleMode = (
            settings.navigationBar.mode.get() === 'gestures' &&
            settings.navigationBar.gesturesInvisibleMode.get()
        );

        const styleClasses: Record<string, boolean> = {
            'touchup-navbar--visible': this._currentNavBar.isVisible && !isInInvisibleMode,
            'touchup-navbar--gestures': this.mode === 'gestures',
            'touchup-navbar--buttons': this.mode === 'buttons',
        };

        for (let cls in styleClasses) {
            styleClasses[cls]
                ? Main.layoutManager.uiGroup.add_style_class_name(cls)
                : Main.layoutManager.uiGroup.remove_style_class_name(cls);
        }
    }

    /**
     * Remove any style class from [Main.layoutManager.uiGroup] that was added by [_updateGlobalStyleClasses]
     */
    private _removeGlobalStyleClasses() {
        if (Main.layoutManager.uiGroup.styleClass != null) {
            Main.layoutManager.uiGroup.styleClass = Main.layoutManager.uiGroup.styleClass
                .split(/\s+/)
                .filter(c => !c.startsWith('touchup-navbar--'))
                .join(' ')
        }
    }

    /**
     * Changes the primary monitor to the given one.
     *
     * If the primary monitor is already the target monitor, no display change operation is performed.
     */
    private async _setPrimaryMonitor(monitor: Monitor) {
        if (Main.layoutManager.primaryIndex === monitor.index) return;

        // Note: there's probably a better way to do this - can we rely on the order of the logical monitors?
        const rect = new Mtk.Rectangle({
            x: monitor.x,
            y: monitor.y,
            width: monitor.width,
            height: monitor.height,
        });
        const state = await DisplayConfigState.getCurrent();
        const m = state.logicalMonitors.find(m => rect.contains_point(m.x + 1, m.y + 1))!;
        state.setPrimaryMonitor(m);
    }

    private _createPrimaryMonitorPatch() {
        let originalMonitor: Monitor | undefined;

        return this.pm.registerPatch(() => {
            originalMonitor ??= Main.layoutManager.primaryMonitor!;
            this._setPrimaryMonitor(this._currentNavBar.monitor);
            return () => {
                this._setPrimaryMonitor(originalMonitor!);
                originalMonitor = undefined;
            }
        });
    }

    destroy() {
        this._removeGlobalStyleClasses()
        this._currentNavBar?.destroy();
        super.destroy();
    }
}

