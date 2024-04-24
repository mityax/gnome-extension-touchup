import St from "@girs/st-13";
import GObject from "@girs/gobject-2.0";
import Clutter from "@girs/clutter-13";

import * as Main from '@girs/gnome-shell/ui/main';
import {Monitor} from "@girs/gnome-shell/ui/layout";
import {clamp, foregroundColorFor, getStyle, UnknownClass} from "$src/utils/utils";
import {PatchManager} from "$src/utils/patchManager";
import {TouchSwipeGesture} from '$src/utils/ui/swipeTracker';
import {css} from "$src/utils/ui/css";
import BinAlignment = Clutter.BinAlignment;
import Action = Clutter.Action;
import Stage = Clutter.Stage;

const LEFT_EDGE_OFFSET = 100;
const WORKSPACE_SWITCH_MIN_SWIPE_LENGTH = 12;

export default class NavigationBar extends St.Widget {
    private monitor: Monitor;
    private mode: "gestures" | "buttons";
    private readonly scaleFactor: number;

    static {
        GObject.registerClass(this);
    }

    constructor(monitor: Monitor, mode: 'gestures' | 'buttons') {
        const panelStyle = getStyle(St.Widget, 'panel');
        super({
            name: 'gnometouchNavigationBar',
            styleClass: 'bottom-panel solid',
            reactive: true,
            trackHover: true,
            canFocus: true,
            layoutManager: new Clutter.BinLayout({
                yAlign: BinAlignment.CENTER,
            }),
            backgroundColor: panelStyle.get_background_color(),
        });

        this.monitor = monitor;
        this.mode = mode;
        this.scaleFactor = St.ThemeContext.get_for_stage(global.stage as Stage).scaleFactor;

        this.width = monitor.width;
        this.height = (mode == 'gestures' ? 22 : 40) * this.scaleFactor;
        this.x = 0;
        this.y = monitor.height - this.height;

        this.add_child(new St.Bin({
            width: clamp(monitor.width * 0.18, 50 * this.scaleFactor, 250 * this.scaleFactor),
            height: Math.floor(Math.min(this.height * 0.6, 5 * this.scaleFactor, this.height - 2)),
            style: css({
                backgroundColor: foregroundColorFor(panelStyle.get_background_color() || 'black', 0.9),
                borderRadius: '20px',
            })
        }));

        this._setupHorizontalSwipeAction();

        this._setupBottomDragAction();
    }

    private _setupHorizontalSwipeAction() {
        //@ts-ignore
        const wsController: UnknownClass = Main.wm._workspaceAnimation;

        const gesture = new TouchSwipeGesture();
        this.add_action_full('workspace-switch-gesture', Clutter.EventPhase.BUBBLE, gesture as Action);
        gesture.orientation = Clutter.Orientation.HORIZONTAL;

        let initialProgress = 0;
        let baseDist = 900;

        gesture.connect('begin', (_: any, time: number, xPress: number, yPress: number) => {
            wsController._switchWorkspaceBegin({
                confirmSwipe(baseDistance: number, points: number[], progress: number, cancelProgress: number) {
                    baseDist = baseDistance;
                    initialProgress = progress;
                }
            }, Main.layoutManager.primaryIndex); // TODO: supply correct monitor
        });
        gesture.connect('update', (_: any, time: number, delta, dist) => {
            wsController._switchWorkspaceUpdate({}, initialProgress + dist / baseDist);
        });
        gesture.connect('end', (_: any, time: number, distance: number, strokeDelta: number) => {
            if (Math.abs(strokeDelta) > WORKSPACE_SWITCH_MIN_SWIPE_LENGTH * this.scaleFactor) {
                strokeDelta = baseDist * (strokeDelta >= 0 ? -1 : 1);
            }
            wsController._switchWorkspaceEnd({}, 500, initialProgress + Math.round(strokeDelta / baseDist));
        });
    }

    private _setupBottomDragAction() {
        const bottomDragAction = global.stage.get_action('osk')!;

        let baseDist = 300;
        let gestureIsGoingOn = false;
        let currentProgress = 0;

        //@ts-ignore
        PatchManager.patchSignalHandler(bottomDragAction, 'activated', (_action) => {
            if (Main.keyboard._keyboard && _action.get_press_coords(0)[0] < LEFT_EDGE_OFFSET * this.scaleFactor) {
                //@ts-ignore
                Main.keyboard._keyboard.gestureActivate(Main.layoutManager.bottomIndex);
            } else {
                Main.overview._gestureEnd({}, 300, clamp(Math.round(currentProgress), 1, 2));
            }
            gestureIsGoingOn = false;
        });

        //@ts-ignore
        PatchManager.patchSignalHandler(bottomDragAction, 'progress', (_action, progress) => {
            if (Main.keyboard._keyboard && _action.get_press_coords(0)[0] < LEFT_EDGE_OFFSET * this.scaleFactor) {
                Main.keyboard._keyboard.gestureProgress(progress);
            } else {
                if (!gestureIsGoingOn) {
                    currentProgress = 0;
                    Main.overview._gestureBegin({
                        confirmSwipe(baseDistance: number, points: number[], progress: number, cancelProgress: number) {
                            baseDist = baseDistance;
                        }
                    });
                } else {
                    currentProgress = progress / (baseDist / 3);  // baseDist ist the whole screen height, which is way too long for our bottom drag gesture, thus baseDist / 3
                    Main.overview._gestureUpdate(_action, currentProgress);
                }
            }
            gestureIsGoingOn = true;
        });

        //@ts-ignore
        PatchManager.patchSignalHandler(bottomDragAction, 'gesture-cancel', (_action) => {
            if (Main.keyboard._keyboard && _action.get_press_coords(0)[0] < LEFT_EDGE_OFFSET * this.scaleFactor) {
                Main.keyboard._keyboard.gestureCancel();
            } else {
                // if 'activated' has not yet been triggered, consider gesture cancelled:
                if (gestureIsGoingOn) {
                    Main.overview._gestureEnd({}, 300, 0);
                }
            }
            gestureIsGoingOn = false;
        });
    }
}
