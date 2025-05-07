import St from "gi://St";
import {MonitorConstraint} from "resource:///org/gnome/shell/ui/layout.js";
import {PatchManager} from "$src/utils/patchManager";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import Clutter from "gi://Clutter";
import {Widgets} from "$src/utils/ui/widgets";
import {debugLog} from "$src/utils/logging";
import ExtensionFeature from "$src/utils/extensionFeature";
import {VirtualTouchpadQuickSettingsItem} from "$src/features/virtualTouchpad/virtualTouchpadQuickSettingsItem";
import {css} from "$src/utils/ui/css";
import {DisplayConfigState} from "$src/utils/monitorDBusUtils";
import {CursorOverlay} from "$src/features/virtualTouchpad/cursorOverlay";
import Mtk from "gi://Mtk";
import {clamp} from "$src/utils/utils";


export class VirtualTouchpadFeature extends ExtensionFeature {
    private readonly actor: St.Widget;
    private readonly openButton: VirtualTouchpadQuickSettingsItem;
    private _virtualInputDevice: Clutter.VirtualInputDevice;
    private _cursorOverlay?: CursorOverlay;
    private monitorIndex: number = 0;


    constructor(pm: PatchManager) {
        super(pm);

        const buttonRef = new Widgets.Ref<Widgets.Button>();

        this.actor = new Widgets.Bin({
            name: 'gnometouch-virtual-touchpad',
            visible: false,
            reactive: true,
            trackHover: true,
            canFocus: true,
            style: css({
                backgroundColor: 'black',
            }),
            constraints: [],
            child: new Widgets.Button({
                child: new Widgets.Icon({
                    iconName: 'edit-delete-symbolic',
                    iconSize: 25,
                    style: css({ color: 'white' }),
                }),
                ref: buttonRef,
                reactive: true,
                trackHover: true,
                canFocus: true,
                x: 25,
                y: 25,
                onClicked: () => {
                    debugLog('Virtual Touchpad Close Button Clicked');
                    this.close();
                },
            }),
        });
        DEBUG: this.actor.opacity = 0.7 * 255;  // a little transparency in debug mode to see the logs below ;)
        this._setupGestureTracker();

        this.pm.connectTo(global.backend.get_monitor_manager(), 'monitors-changed', () => this.updateMonitor());
        void this.updateMonitor();

        this.pm.patch(() => {
            Main.layoutManager.addTopChrome(this.actor, {
                affectsStruts: false,
                trackFullscreen: false,
                affectsInputRegion: true,
            });
            return () => Main.layoutManager.removeChrome(this.actor);
        });

        // Add virtual touchpad open button to panel:
        this.openButton = new VirtualTouchpadQuickSettingsItem(() => this.toggle());
        this.pm.patch(() => {
            Main.panel.statusArea.quickSettings._system._systemItem.child.insert_child_at_index(
                this.openButton,
                2,  // add after battery indicator and spacer
            );
            return () => this.openButton?.destroy();
        });

        this._virtualInputDevice = Clutter.get_default_backend().get_default_seat()
            .create_virtual_device(Clutter.InputDeviceType.TOUCHPAD_DEVICE);
    }

    open() {
        this.actor.show();
        this._placeCursorOnOtherMonitor();
        this._cursorOverlay = new CursorOverlay(this.pm.fork('cursor-overlay'));
    }

    close() {
        this.actor.hide();
        this._cursorOverlay?.destroy();
        this._cursorOverlay = undefined;
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

    async getTouchMonitor(): Promise<number> {
        //const devices = Clutter.get_default_backend().get_default_seat().list_devices();
        //const device = devices.find(d => d.deviceType == Clutter.InputDeviceType.TOUCHSCREEN_DEVICE);
        //debugLog("Touch device dimensions:", device?.get_dimensions());

        // FIXME: Find a way to get the touch-enabled monitor instead of builtin monitor

        const state = await DisplayConfigState.getCurrent();
        return state.monitors.findIndex(m => m.isBuiltin) ?? global.display.get_primary_monitor();
    }

    private async updateMonitor() {
        this.monitorIndex = await this.getTouchMonitor();
        this.actor.remove_constraint_by_name('monitor');
        this.actor.add_constraint_with_name('monitor', new MonitorConstraint({
            workArea: true,
            index: this.monitorIndex,
        }));
    }

    private _setupGestureTracker() {
        // TODO: implement multi-finger gestures

        /*const recognizer = new GestureRecognizer2D();
        let lastEvent: Clutter.Event | null;

        this.actor.connect("touch-event", (_, e: Clutter.Event) => {
            recognizer.pushEvent(e);

            if (recognizer.isDuringGesture && lastEvent) {
                const [dx, dy] = this._clampMovementToMonitor(
                    e.get_coords()[0] - lastEvent.get_coords()[0],
                    e.get_coords()[1] - lastEvent.get_coords()[1],
                );
                this._virtualInputDevice.notify_absolute_motion(e.get_time_us(), dx, dy);
            }
            if (recognizer.gestureHasJustFinished && recognizer.isTap()) {
                this._virtualInputDevice.notify_button(e.get_time_us(), 1, Clutter.ButtonState.PRESSED);
                this._virtualInputDevice.notify_button(e.get_time_us(), 1, Clutter.ButtonState.RELEASED);
            }
            lastEvent = recognizer.gestureHasJustFinished ? null : e;
        });*/

        const rotate = new Clutter.RotateAction({nTouchPoints: 2});
        this.actor.add_action(rotate);
        rotate.connect("rotate", (_source, actor, angle) => {
            debugLog("Rotate: ", angle);
        });

        const zoom = new Clutter.ZoomAction({nTouchPoints: 2});
        this.actor.add_action(zoom);
        zoom.connect("zoom", (_source, actor, focal_point, factor) => {
            debugLog("Zoom: ", factor);
        });

        /*const swipe = new Clutter.SwipeAction({nTouchPoints: 2});
        this.actor.add_action(swipe);
        swipe.connect("swipe", (_source, actor, direction) => {
            debugLog("Swipe: ", direction);
        });

        const tap = new Clutter.TapAction({nTouchPoints: 1});
        this.actor.add_action(tap);
        tap.connect("tap", (_source, actor) => {
            debugLog("Tap!");
        });*/
    }

    destroy() {
        this._cursorOverlay?.destroy();
        super.destroy();
    }

    /**
     * Prevents the cursor from moving over the monitor where the VirtualTouchpad is open by
     * adjusting [dx] and [dy] in such a way that the cursor can only move until the edge of
     * the VirtualTouchpad's monitor.
     *
     * IMPORTANT: This function returns absolute coordinates!
     */
    private _clampMovementToMonitor(dx: any, dy: any): [number, number] {
        const [oldX, oldY, _] = global.get_pointer();
        let [newX, newY] = [oldX + dx, oldY + dy];
        let newMonitor = global.display.get_monitor_index_for_rect(new Mtk.Rectangle({
            x: newX, y: newY, width: 0, height: 0,
        }));
        if (newMonitor === this.monitorIndex) {
            // TODO: rethink this part
            const oldMonitor = global.display.get_monitor_index_for_rect(new Mtk.Rectangle({
                x: oldX, y: oldY, width: 0, height: 0,
            }));
            const oldMonitorRect = global.display.get_monitor_geometry(oldMonitor);
            newX = clamp(newX, oldMonitorRect.x + 2, oldMonitorRect.x + oldMonitorRect.width);
            newY = clamp(newY, oldMonitorRect.y + 2, oldMonitorRect.y + oldMonitorRect.height);
            return [newX, newY];
        } else {
            return [newX, newY];
        }
    }

    /**
     * Places the cursor in the center of the next best monitor that is not the one
     * this VirtualTouchpad is on.
     */
    private _placeCursorOnOtherMonitor() {
        let idx = (this.monitorIndex + 1) % global.display.get_n_monitors();
        let geometry = global.display.get_monitor_geometry(idx);
        this._virtualInputDevice.notify_absolute_motion(
            global.get_current_time(),
            geometry.x + geometry.width / 2,
            geometry.y + geometry.height / 2,
        );
    }
}
