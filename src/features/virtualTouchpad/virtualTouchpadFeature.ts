import St from "gi://St";
import {MonitorConstraint} from "resource:///org/gnome/shell/ui/layout.js";
import {PatchManager} from "$src/utils/patchManager";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import Clutter from "gi://Clutter";
import * as Widgets from "$src/utils/ui/widgets";
import ExtensionFeature from "$src/utils/extensionFeature";
import {VirtualTouchpadQuickSettingsItem} from "$src/features/virtualTouchpad/virtualTouchpadQuickSettingsItem";
import {css} from "$src/utils/ui/css";
import {DisplayConfigState} from "$src/utils/monitorDBusUtils";
import {CursorOverlay} from "$src/features/virtualTouchpad/cursorOverlay";
import Mtk from "gi://Mtk";
import {clamp} from "$src/utils/utils";
import {Delay} from "$src/utils/delay";
import {GestureRecognizer, GestureRecognizerEvent} from "$src/utils/ui/gestureRecognizer";
import GLib from "gi://GLib";
import Stage = Clutter.Stage;


export class VirtualTouchpadFeature extends ExtensionFeature {
    private readonly actor: St.Widget;
    private readonly openButton: VirtualTouchpadQuickSettingsItem;
    private _virtualInputDevice: Clutter.VirtualInputDevice;
    private _cursorOverlay?: CursorOverlay;
    private monitorIndex: number = 0;

    constructor(pm: PatchManager) {
        super(pm);

        const buttonRef = new Widgets.Ref<Widgets.Button>();

        this.actor = new Widgets.Column({
            name: 'touchup-virtual-touchpad',
            visible: false,
            reactive: true,
            trackHover: true,
            canFocus: true,
            style: css({
                backgroundColor: 'black',
            }),
            constraints: [],
            children: [
                new Widgets.Row({
                    xAlign: Clutter.ActorAlign.START,
                    yAlign: Clutter.ActorAlign.START,
                    style: css({ padding: '10px' }),
                    children: [
                        new Widgets.Button({
                            xAlign: Clutter.ActorAlign.START,
                            child: new Widgets.Icon({
                                iconName: 'window-close-symbolic',
                                iconSize: 35,
                                style: css({ color: 'white' }),
                            }),
                            ref: buttonRef,
                            reactive: true,
                            trackHover: true,
                            canFocus: true,
                            onClicked: () => this.close(),
                        })
                    ],
                }),
            ],
        });
        this._setupGestureTracker();

        DEBUG: {
            // In debug mode, add a little bit of transparency to make the logs below visible:
            this.actor.opacity = 0.7 * 255;

            // Add an info label to explain the development-specific changes:
            const label = new Widgets.Label({
                text: 'Development notice: The touchpad is transparent and, if only one monitor is connected, only ' +
                    'spans half of the screen in development mode; This is intentional to ease testing.',
                style: css({ color: 'white', padding: '25px' }),
            });
            label.clutterText.lineWrap = true;
            this.actor.add_child(label);
        }

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

        DEBUG: {
            // In debug mode, make the touchpad only occupy half the screen if there is no second monitor
            // connected:
            if (Main.layoutManager.monitors.length === 1) {
                this.actor.remove_constraint_by_name('monitor');
                this.actor.set_position(
                    Main.layoutManager.monitors[this.monitorIndex].width / 2,
                    0,
                );
                this.actor.set_size(
                    Main.layoutManager.monitors[this.monitorIndex].width / 2,
                    Main.layoutManager.monitors[this.monitorIndex].height,
                );
            }
        }
    }

    private _setupGestureTracker() {
        const recognizer = new GestureRecognizer({
            scaleFactor: St.ThemeContext.get_for_stage(global.stage as Stage).scaleFactor,
        });

        let lastPos: [number, number] | null = null;

        const onEvent = async (e: Clutter.Event) => {
            const evt = GestureRecognizerEvent.fromClutterEvent(e);
            const state = recognizer.push(evt);

            if (state.gestureHasJustStarted) {
                lastPos = null;
            }

            if (state.isDuringGesture && state.isCertainlyMovement) {
                if (state.totalFingerCount === 1) {
                    const d = state.currentMotionDelta;
                    const [dx, dy] = this._clampMovementToMonitor(d.x, d.y);
                    lastPos = [dx, dy];
                    this._virtualInputDevice.notify_absolute_motion(evt.timeUS, dx, dy);
                } else if (state.totalFingerCount === 2) {
                    // TODO: support pinch gestures

                    const d = state.currentMotionDelta;
                    this._virtualInputDevice.notify_scroll_continuous(
                        evt.timeUS, -d.x, -d.y, Clutter.ScrollSource.FINGER, null
                    );
                } else if (state.totalFingerCount === 3) {
                    // TODO: support workspace & overview gestures
                }
            } else if (state.isTap) {
                this._virtualInputDevice.notify_absolute_motion(evt.timeUS, lastPos![0], lastPos![1]);

                const button = state.totalFingerCount === 2 ? Clutter.BUTTON_SECONDARY : Clutter.BUTTON_PRIMARY;
                this._virtualInputDevice.notify_button(GLib.get_monotonic_time(), button, Clutter.ButtonState.PRESSED);
                await Delay.ms(100);
                this._virtualInputDevice.notify_button(GLib.get_monotonic_time(), button, Clutter.ButtonState.RELEASED);
            }
        }

        this.actor.connect("touch-event", (_: any, e: Clutter.Event) => onEvent(e));
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
