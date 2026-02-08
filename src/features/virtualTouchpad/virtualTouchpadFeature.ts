//@ts-ignore
import * as Keyboard from 'resource:///org/gnome/shell/ui/keyboard.js';
import {Patch, PatchManager} from "$src/core/patchManager";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import ExtensionFeature from "$src/core/extensionFeature";
import {VirtualTouchpadQuickSettingsItem} from "$src/features/virtualTouchpad/virtualTouchpadQuickSettingsItem";
import {DisplayConfigState} from "$src/utils/monitorDBusUtils";
import TouchUpExtension from "$src/extension";
import {TouchModeService} from "$src/services/touchModeService";
import {devMode} from "$src/config";
import {_TouchPadActor} from "$src/features/virtualTouchpad/touchPadActor";


export class VirtualTouchpadFeature extends ExtensionFeature {
    private readonly actor: _TouchPadActor;
    private readonly openButton: VirtualTouchpadQuickSettingsItem;
    private _forceEnableKeyboardPatch?: Patch;
    private _ensureKeyboardMonitorPatch?: Patch;

    constructor(pm: PatchManager) {
        super(pm);

        this.actor = new _TouchPadActor({
            onClose: () => this.close(),
        });

        this.pm.patch(() => {
            Main.layoutManager.addChrome(this.actor, {
                affectsStruts: false,
                trackFullscreen: false,
            });
            return () => Main.layoutManager.removeChrome(this.actor);
        });

        // Add virtual touchpad open button to panel:
        this.openButton = new VirtualTouchpadQuickSettingsItem(() => this.toggle());
        this.pm.patch(() => {
            Main.panel.statusArea.quickSettings._system!._systemItem.child.insert_child_at_index(
                this.openButton,
                2,  // add after battery indicator and spacer
            );
            return () => this.openButton?.destroy();
        });

        this.pm.connectTo(global.backend.get_monitor_manager(), 'monitors-changed',
            () => this.updateMonitor());
        void this.updateMonitor();

        this.pm.connectTo(TouchUpExtension.instance!.getFeature(TouchModeService)!.onChanged, 'changed',
            touchMode => {
                this.setCanOpen(touchMode && (global.display.get_n_monitors() > 1 || devMode));
            })
        this.setCanOpen(TouchUpExtension.instance!.getFeature(TouchModeService)!.isTouchModeActive);
    }

    open() {
        this.actor.show();

        // This patch ensures that the OSK is opened properly when e.g. focusing an input widget using the
        // virtual touchpad:
        this._forceEnableKeyboardPatch ??= this.pm.patchMethod(
            Keyboard.KeyboardManager.prototype,
            '_lastDeviceIsTouchscreen',
            () => true,
        );
        this._forceEnableKeyboardPatch.enable();

        // Ensure that the keyboard opens on the correct monitor:
        const self = this;
        this._ensureKeyboardMonitorPatch ??= this.pm.patchMethod(
            Keyboard.KeyboardManager.prototype,
            'open',
            function (this: Keyboard.KeyboardManager, originalMethod, _monitor: number) {
                originalMethod(self.actor.monitor);  // Call `KeyboardManager.open()` with the correct monitor as argument
            }
        );
        this._ensureKeyboardMonitorPatch.enable();
    }

    close() {
        this.actor.hide();
        this._forceEnableKeyboardPatch?.disable();
        this._ensureKeyboardMonitorPatch?.disable();
    }

    toggle() {
        if (this.actor.visible) {
            this.close();
        } else {
            this.open();
        }
    }

    /**
     * Set whether the virtual touchpad can be opened at the moment.
     *
     * This effectively updates the visibility of the open button in the quick settings
     * menu and, if [canOpen] is `false`, closes the touchpad if it is open.
     */
    setCanOpen(canOpen: boolean) {
        this.openButton.visible = canOpen;
        if (!canOpen) this.close();
    }

    private async updateMonitor() {
        //const devices = Clutter.get_default_backend().get_default_seat().list_devices();
        //const device = devices.find(d => d.deviceType == Clutter.InputDeviceType.TOUCHSCREEN_DEVICE);
        //logger.debug("Touch device dimensions:", device?.get_dimensions());

        // FIXME: Find a way to get the touch-enabled monitor instead of builtin monitor

        // FIXME: This error occurs (sometimes) when connected to multiple monitors during login:
        // Unhandled promise rejection. Stack trace of the failed promise:
        //     updateMonitor@file:///home/x/.local/share/gnome-shell/extensions/touchup@mityax/features/virtualTouchpad/virtualTouchpadFeature.js:89:24
        //     VirtualTouchpadFeature/<@file:///home/x/.local/share/gnome-shell/extensions/touchup@mityax/features/virtualTouchpad/virtualTouchpadFeature.js:44:96
        //     @resource:///org/gnome/shell/ui/init.js:21:20

        const state = await DisplayConfigState.getCurrent();
        this.actor.monitor =
            global.backend.get_monitor_manager().get_monitor_for_connector(state.builtinMonitor.connector)
            ?? global.display.get_primary_monitor();
    }

    destroy() {
        super.destroy();
    }
}


