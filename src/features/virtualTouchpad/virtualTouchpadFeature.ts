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
import Mtk from "gi://Mtk";
import {clamp} from "$src/utils/utils";
import {Delay} from "$src/utils/delay";
import {GestureRecognizer, GestureRecognizerEvent, GestureState} from "$src/utils/ui/gestureRecognizer";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import OverviewAndWorkspaceGestureController from "$src/utils/overviewAndWorkspaceGestureController";


export class VirtualTouchpadFeature extends ExtensionFeature {
    private readonly actor: _TouchPadActor;
    private readonly openButton: VirtualTouchpadQuickSettingsItem;

    constructor(pm: PatchManager) {
        super(pm);

        this.actor = new _TouchPadActor({
            onClose: () => this.close(),
        });

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
    }

    open() {
        this.actor.show();
    }

    close() {
        this.actor.hide();
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
        //debugLog("Touch device dimensions:", device?.get_dimensions());

        // FIXME: Find a way to get the touch-enabled monitor instead of builtin monitor

        const state = await DisplayConfigState.getCurrent();
        const idx = global.backend.get_monitor_manager().get_monitor_for_connector(state.builtinMonitor.connector) ?? global.display.get_primary_monitor();

        this.actor.setMonitor(idx);
    }

    destroy() {
        super.destroy();
    }
}


class _TouchPadActor extends Widgets.Column {
    static {
        GObject.registerClass(this);
    }

    private readonly _onClose: () => void;

    private readonly _virtualInputDevice = Clutter.get_default_backend().get_default_seat().create_virtual_device(
        Clutter.InputDeviceType.TOUCHPAD_DEVICE
    );
    private readonly overviewAndWorkspaceController = new OverviewAndWorkspaceGestureController();
    private _monitorIndex: number = 0;
    private readonly _recognizer: GestureRecognizer;
    private _eventFilterId: number | null = null;
    private _lastPos: [number, number] | null = null;

    constructor(props: {onClose: () => void}) {
        const buttonRef = new Widgets.Ref<Widgets.Button>();

        super({
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
                            onClicked: () => this._onClose(),
                        }),
                    ],
                }),
            ],
        });

        this._onClose = props.onClose;

        this._recognizer = new GestureRecognizer({
            scaleFactor: St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scaleFactor,
            onGestureStarted: state => this._onGestureStarted(),
            onGestureProgress: state => this._onGestureProgress(state),
            onGestureCompleted: state => this._onGestureCompleted(state),
        });

        DEBUG: {
            // In debug mode, add a little bit of transparency to make the logs below visible:
            this.opacity = 0.7 * 255;

            // Add an info label to explain the development-specific changes:
            const label = new Widgets.Label({
                text: 'Development notice: The touchpad is transparent and, if only one monitor is connected, only ' +
                    'spans half of the screen in development mode; This is intentional to ease testing.',
                style: css({ color: 'white', padding: '25px' }),
            });
            label.clutterText.lineWrap = true;
            this.add_child(label);
        }

        this.connect('show',  () => this._addEventFilter());
        this.connect('hide', () => this._removeEventFilter())
        this.connect('destroy', () => this._removeEventFilter());
    }

    /**
     * A global event filter is registered instead of just listening to touch events on the virtual
     * touchpad actor as you'd normally do it – this allows us to not interact with the virtual
     * touchpad without immediately affecting other actors (e.g. closing popup menus).
     *
     * The event filter is registered whenever the touchpad becomes visible and unregistered when it
     * is hidden or destroyed.
     */
    private _addEventFilter() {
        this._eventFilterId = Clutter.event_add_filter(global.stage, (event, event_actor) => {
            if (event_actor === this && GestureRecognizerEvent.isTouch(event)) {
                this._recognizer.push(GestureRecognizerEvent.fromClutterEvent(event));

                return Clutter.EVENT_STOP;
            }

            return Clutter.EVENT_PROPAGATE;
        });
    }

    private _removeEventFilter() {
        if (this._eventFilterId !== null) Clutter.event_remove_filter(this._eventFilterId!);
        this._eventFilterId = null;
    }

    private _onGestureStarted() {
        const [x, y, _] = global.get_pointer();
        this._lastPos = [x, y];
    }

    private _onGestureProgress(state: GestureState) {
        // TODO: evaluate supressing global.backend::'last-device-changed' events to avoid pointer blinking

        if (state.isCertainlyMovement) {
            if (state.totalFingerCount === 1) {
                const d = state.currentMotionDelta;
                const [dx, dy] = this._clampMovementToMonitor(d.x, d.y);
                this._lastPos = [dx, dy];
                this._virtualInputDevice.notify_absolute_motion(state.events.at(-1)!.timeUS, dx, dy);
            } else if (state.totalFingerCount === 2) {
                // TODO: support pinch gestures

                const d = state.currentMotionDelta;
                this._virtualInputDevice.notify_scroll_continuous(
                    state.events.at(-1)!.timeUS, -d.x, -d.y, Clutter.ScrollSource.FINGER, null
                );
            } else if (state.totalFingerCount === 3) {
                const d = state.totalMotionDelta;
                this.overviewAndWorkspaceController.gestureUpdate({
                    overviewProgress: -d.y / (this.overviewAndWorkspaceController.baseDistY * 0.35),
                    workspaceProgress: -d.x / (this.overviewAndWorkspaceController.baseDistX * 0.62),
                });
            }
        }
    }

    private async _onGestureCompleted(state: GestureState) {
        if (state.totalFingerCount === 3) {
            this.overviewAndWorkspaceController.gestureEnd({
                direction: state.lastMotionDirection?.direction ?? null,
            });
        } else if (state.isTap) {
            this._virtualInputDevice.notify_absolute_motion(state.events.at(-1)!.timeUS, this._lastPos![0], this._lastPos![1]);

            const button = state.totalFingerCount === 2 ? Clutter.BUTTON_SECONDARY : Clutter.BUTTON_PRIMARY;
            this._virtualInputDevice.notify_button(GLib.get_monotonic_time(), button, Clutter.ButtonState.PRESSED);
            await Delay.ms(100);
            this._virtualInputDevice.notify_button(GLib.get_monotonic_time(), button, Clutter.ButtonState.RELEASED);
        } else if (state.totalFingerCount === 1) {
            // After pointer movements have finished, we emit a (shortly delayed) pointer event to ensure that
            // the shell continues showing the cursor – as otherwise, the last touch event (touch release) would
            // come after the previously emitted pointer events and hide the cursor.
            await Delay.ms(20);
            this._virtualInputDevice.notify_relative_motion(state.events.at(-1)!.timeUS, 0, 0);
        }
    }

    show() {
        super.show();
        this._placeCursorOnOtherMonitor();
    }

    hide() {
        super.hide();
    }

    setMonitor(index: number) {
        this._monitorIndex = index;

        this.remove_constraint_by_name('monitor');
        this.add_constraint_with_name('monitor', new MonitorConstraint({
            workArea: true,
            index: this._monitorIndex,
        }));

        DEBUG: {
            // In debug mode, make the touchpad only occupy half the screen if there is no second monitor
            // connected:
            if (Main.layoutManager.monitors.length === 1) {
                this.remove_constraint_by_name('monitor');
                this.set_position(
                    Main.layoutManager.monitors[this._monitorIndex].width / 2,
                    0,
                );
                this.set_size(
                    Main.layoutManager.monitors[this._monitorIndex].width / 2,
                    Main.layoutManager.monitors[this._monitorIndex].height,
                );
            }
        }
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
        if (newMonitor === this._monitorIndex) {
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
        let idx = (this._monitorIndex + 1) % global.display.get_n_monitors();
        let geometry = global.display.get_monitor_geometry(idx);
        this._virtualInputDevice.notify_absolute_motion(
            global.get_current_time(),
            geometry.x + geometry.width / 2,
            geometry.y + geometry.height / 2,
        );
    }
}

