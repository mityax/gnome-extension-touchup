import St from "@girs/st-13";
import GObject from "@girs/gobject-2.0";
import Clutter from "@girs/clutter-13";

import * as Main from '@girs/gnome-shell/ui/main';

import {Bin} from '../../jsx/components/containers';
import {Monitor} from "@girs/gnome-shell/ui/layout";
import {foregroundColorFor, getStyle, print} from "$src/utils/utils";
import {PatchManager} from "$src/utils/patchManager";
import BinAlignment = Clutter.BinAlignment;
import {TouchSwipeGesture} from '$src/utils/swipeTracker';
import Shell from "@girs/shell-13";

const LEFT_EDGE_OFFSET = 100;
const WS_SWITCH_DIST_THRESHOLD = 200;

export default class NavigationBar extends St.Widget {
    private monitor: Monitor;
    private mode: "gestures" | "buttons";
    //private gestureDetector: GestureDetector;

    static {
        GObject.registerClass(this);
    }

    constructor(monitor: Monitor, mode: 'gestures' | 'buttons') {
        const panelStyle = getStyle(St.Widget, 'panel');
        super({
            name: 'gnometouchNavigationBar',
            style_class: 'bottom-panel solid',
            reactive: true,
            track_hover: true,
            canFocus: true,
            layout_manager: new Clutter.BinLayout({
                yAlign: BinAlignment.CENTER,
            }),
            backgroundColor: panelStyle.get_background_color(),
        });

        this.monitor = monitor;
        this.mode = mode;

        this.width = monitor.width;
        this.height = mode == 'gestures' ? 38 : 60;
        this.x = 0;
        this.y = monitor.height - this.height;

        this.add_child(
            <Bin
                width={250}
                height={Math.floor(Math.min(this.height * 0.6, this.height - 2, 7))}
                style={{
                    backgroundColor: foregroundColorFor(panelStyle.get_background_color() || 'black', 0.9),
                    borderRadius: '10px',
                }}>
            </Bin>
        );

        this._setupHorizontalSwipeAction();

        this._setupBottomDragAction();
    }

    private _setupHorizontalSwipeAction() {
        const wsController = Main.wm._workspaceAnimation;

        const gesture = new TouchSwipeGesture();
        this.add_action_full('workspace-switch-gesture', Clutter.EventPhase.BUBBLE, gesture);
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
        gesture.connect('end', (_: any, time: number, distance: number) => {
            if (Math.abs(distance) > WS_SWITCH_DIST_THRESHOLD) {
                distance = baseDist * (distance/Math.abs(distance));
            }
            wsController._switchWorkspaceEnd({}, 300, initialProgress + Math.round(distance / baseDist));
        });
    }

    private _setupBottomDragAction() {
        const bottomDragAction = global.stage.get_action('osk')!;

        let baseDist = 300;
        let gestureIsGoingOn = false;

        PatchManager.patchSignalHandler(bottomDragAction, 'activated', (_action) => {
            if (_action.get_press_coords(0)[0] > LEFT_EDGE_OFFSET) {
                Main.overview._gestureEnd({}, 300, 1);
            } else {
                if (Main.keyboard._keyboard)
                    Main.keyboard._keyboard.gestureActivate(Main.layoutManager.bottomIndex);
            }
            gestureIsGoingOn = false;
        });

        PatchManager.patchSignalHandler(bottomDragAction, 'progress', (_action, progress) => {
            if (_action.get_press_coords(0)[0] > LEFT_EDGE_OFFSET) {
                if (!gestureIsGoingOn) {
                    Main.overview._gestureBegin({
                        confirmSwipe(baseDistance: number, points: number[], progress: number, cancelProgress: number) {
                            baseDist = baseDistance;
                        }
                    });
                } else {
                    Main.overview._gestureUpdate(_action, progress / baseDist);
                }
            } else {
                if (Main.keyboard._keyboard)
                    Main.keyboard._keyboard.gestureProgress(progress);
            }
            gestureIsGoingOn = true;
        });

        PatchManager.patchSignalHandler(bottomDragAction, 'gesture-cancel', (_action) => {
            // if 'activated' has not yet been triggered, consider gesture cancelled:
            if (_action.get_press_coords(0)[0] > LEFT_EDGE_OFFSET) {
                if (gestureIsGoingOn) {
                    Main.overview._gestureEnd({}, 300, 0);
                }
            } else {
                if (Main.keyboard._keyboard)
                    Main.keyboard._keyboard.gestureCancel();
            }

            gestureIsGoingOn = false;
        });
    }
}
