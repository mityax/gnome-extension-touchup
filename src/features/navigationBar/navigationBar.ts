import St from "@girs/st-14";
import GObject from "@girs/gobject-2.0";
import Clutter from "@girs/clutter-14";

import * as Main from '@girs/gnome-shell/ui/main';
import {Monitor, MonitorConstraint} from "@girs/gnome-shell/ui/layout";
import {clamp, foregroundColorFor, getStyle, log, UnknownClass} from "$src/utils/utils";
import {PatchManager} from "$src/utils/patchManager";
import {TouchSwipeGesture} from '$src/utils/ui/swipeTracker';
import {css} from "$src/utils/ui/css";
import WindowPositionTracker from "$src/utils/ui/windowPositionTracker";
import Meta from "@girs/meta-14";
import Action = Clutter.Action;
import Stage = Clutter.Stage;
import ActorAlign = Clutter.ActorAlign;

const LEFT_EDGE_OFFSET = 100;
const WORKSPACE_SWITCH_MIN_SWIPE_LENGTH = 12;

export default class NavigationBar extends St.Widget {
    static readonly PATCH_SCOPE = 'navigation-bar';

    private monitor: Monitor;
    private mode: "gestures" | "buttons";
    private readonly scaleFactor: number;

    private windowPositionTracker: WindowPositionTracker;
    private readonly pill: St.Bin;

    static {
        GObject.registerClass(this);
    }


    constructor(mode: 'gestures' | 'buttons') {
        const panelStyle = getStyle(St.Widget, 'panel');
        super({
            name: 'gnometouch-navbar',
            styleClass: 'bottom-panel solid',
            reactive: true,
            trackHover: true,
            canFocus: true,
            layoutManager: new Clutter.BinLayout(),
            visible: Clutter.get_default_backend().get_default_seat().touchMode,
        });

        // TODO: find touch-enabled monitors, keyword: ClutterInputDevice
        this.monitor = Main.layoutManager.primaryMonitor!;
        this.mode = mode;

        this.scaleFactor = St.ThemeContext.get_for_stage(global.stage as Stage).scaleFactor;

        // Create and add the pill:
        this.pill = new St.Bin({
            yAlign: ActorAlign.CENTER,
            xAlign: ActorAlign.CENTER,
            style: css({
                backgroundColor: foregroundColorFor(panelStyle.get_background_color() || 'black', 0.9),
                borderRadius: '20px',
            })
        });
        this.add_child(this.pill);

        this._reallocate();

        PatchManager.patch(() => {
            const monitorManager = global.backend.get_monitor_manager();
            const id = monitorManager.connect('monitors-changed', this._reallocate.bind(this));
            return () => monitorManager.disconnect(id);
        }, {scope: NavigationBar.PATCH_SCOPE})

        this.windowPositionTracker = new WindowPositionTracker(windows => {
            // Check if at least one window is near enough to the navigation bar:
            const top = this.get_transformed_position()[1];
            const isNearEnough = windows.some((metaWindow: Meta.Window) => {
                const windowBottom = metaWindow.get_frame_rect().y + metaWindow.get_frame_rect().height;
                return windowBottom > top - 5 * this.scaleFactor;
            });

            if (Main.panel.has_style_pseudo_class('overview') || !isNearEnough) {
                this.add_style_class_name('transparent');
            } else {
                this.remove_style_class_name('transparent');
            }
        });

        this._setupHorizontalSwipeAction();

        // Disable default bottom drag action:
        PatchManager.patch(() => {
            const action = global.stage.get_action('osk')!;
            global.stage.remove_action(action);
            return () => global.stage.add_action_full('osk', Clutter.EventPhase.CAPTURE, action);
        })
    }

    private _reallocate() {
        // TODO: find touch-enabled monitor, keyword: ClutterInputDevice
        this.monitor = Main.layoutManager.primaryMonitor!;

        const height = (this.mode == 'gestures' ? 22 : 40) * this.scaleFactor;

        this.set_position(this.monitor.x, this.monitor.y + this.monitor.height - height);
        this.set_size(this.monitor.width, height);

        this.pill.set_size(
            // Width:
            clamp(this.monitor.width * 0.2, 70 * this.scaleFactor, 250 * this.scaleFactor),

            // Height:
            Math.floor(Math.min(this.height * 0.8, 6.5 * this.scaleFactor, this.height - 2))
        )
    }

    private _setupHorizontalSwipeAction() {
        //@ts-ignore
        const wsController: UnknownClass = Main.wm._workspaceAnimation;

        const gesture = new TouchSwipeGesture();
        this.add_action_full('workspace-switch-gesture', Clutter.EventPhase.CAPTURE, gesture as Action);
        gesture.orientation = null; // Clutter.Orientation.HORIZONTAL;

        let baseDistX = 900;
        let baseDistY = 300;
        let initialWorkspaceProgress = 0;
        let currentOverviewProgress = 0;

        gesture.connect('begin', (_: any, time: number, xPress: number, yPress: number) => {
            // Workspace switching:
            wsController._switchWorkspaceBegin({
                confirmSwipe(baseDistance: number, points: number[], progress: number, cancelProgress: number) {
                    baseDistX = baseDistance;
                    initialWorkspaceProgress = progress;
                }
            }, Main.layoutManager.primaryIndex); // TODO: supply correct monitor

            // Overview toggling:
            Main.overview._gestureBegin({
                confirmSwipe(baseDistance: number, points: number[], progress: number, cancelProgress: number) {
                    baseDistY = baseDistance;
                    currentOverviewProgress = progress;
                }
            });

        });

        gesture.connect('update', (_: any, time: number, distX, distY) => {
            // Workspace switching:
            wsController._switchWorkspaceUpdate({}, initialWorkspaceProgress + distX / baseDistX);

            // Overview toggling:
            if (Main.keyboard._keyboard && gesture.get_press_coords(0)[0] < LEFT_EDGE_OFFSET * this.scaleFactor) {
                Main.keyboard._keyboard.gestureProgress(distY / baseDistY);
            } else {
                currentOverviewProgress = distY / (baseDistY / 3);  // baseDist ist the whole screen height, which is way too long for our bottom drag gesture, thus baseDist / 3
                Main.overview._gestureUpdate(gesture, currentOverviewProgress);
            }
        });

        gesture.connect('end', (_: any, time: number, strokeDeltaX, strokeDeltaY) => {
            // Workspace switching:
            if (Math.abs(strokeDeltaX) > WORKSPACE_SWITCH_MIN_SWIPE_LENGTH * this.scaleFactor) {
                strokeDeltaX = baseDistX * (strokeDeltaX >= 0 ? -1 : 1);
            }
            wsController._switchWorkspaceEnd({}, 500, initialWorkspaceProgress + Math.round(strokeDeltaX / baseDistX));

            // Overview toggling:
            if (Math.abs(strokeDeltaY) > Math.abs(strokeDeltaX)) {
                if (Main.keyboard._keyboard && gesture.get_press_coords(0)[0] < LEFT_EDGE_OFFSET * this.scaleFactor) {
                    //@ts-ignore
                    Main.keyboard._keyboard.gestureActivate(Main.layoutManager.bottomIndex);
                } else {
                    Main.overview._gestureEnd({}, 300, clamp(Math.round(currentOverviewProgress), 1, 2));
                }
            } else {
                Main.overview._gestureEnd({}, 300, 0);
            }
        });

        gesture.connect('gesture-cancel', (_gesture) => {
            if (Main.keyboard._keyboard && gesture.get_press_coords(0)[0] < LEFT_EDGE_OFFSET * this.scaleFactor) {
                Main.keyboard._keyboard.gestureCancel();
            } else {
                // if 'activated' has not yet been triggered, consider gesture cancelled:
                //if (gestureIsGoingOn) {
                    Main.overview._gestureEnd({}, 300, 0);
                //}
            }
        })
    }

    destroy() {
        super.destroy();
        this.windowPositionTracker.destroy();
    }
}
