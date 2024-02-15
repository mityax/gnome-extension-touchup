import St from "@girs/st-13";
import GObject from "@girs/gobject-2.0";
import Clutter from "@girs/clutter-13";

import * as Main from '@girs/gnome-shell/ui/main';

import {Bin} from '../../jsx/components/containers';
import {Monitor} from "@girs/gnome-shell/ui/layout";
import {foregroundColorFor, getStyle, print} from "$src/utils/utils";
import {PatchManager} from "$src/utils/patchManager";
//import {WorkspaceAnimation} from "@girs/gnome-shell/ui/workspaceAnimation";
import BinAlignment = Clutter.BinAlignment;


const LEFT_EDGE_OFFSET = 100;

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
            name: 'navigation-bar',
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
        this.height = mode == 'gestures' ? 28 : 50;
        this.x = 0;
        this.y = monitor.height - this.height;

        this.add_child(
            <Bin
                width={200}
                height={Math.floor(Math.min(this.height * 0.6, this.height - 2, 7))}
                style={{
                    backgroundColor: foregroundColorFor(panelStyle.get_background_color() || 'black', 0.9),
                    borderRadius: '10px',
                }}>
            </Bin>
        );

        //this.gestureDetector = new GestureDetector();
        //this.connect('event', (e) => this.gestureDetector.pushEvent(e));
        this.connect('event', (a, b, c) => {
            //print("Event: ", b.type(), b.get_coords())
        });

        //const workspaceAnimationController = new WorkspaceAnimation.WorkspaceAnimationController();

        const swipeAction = new Clutter.SwipeAction({
            threshold_trigger_distance_y: 10,

        });
        this.add_action_full('swipetracker', Clutter.EventPhase.BUBBLE, swipeAction);
        swipeAction.connect('swipe', (_, actor, direction) => {
            if (direction == Clutter.SwipeDirection.RIGHT) {
                /*workspaceAnimationController.animateSwitch(0, to, direction, () => {
                    this._shellwm.completed_switch_workspace();
                    this._switchInProgress = false;
                });*/
                print("Swipe right");
            } else if (direction == Clutter.SwipeDirection.LEFT) {
                print("Swipe left");

            }
            print(`Swipe: ${direction}`)
            return true;
        });

        const bottomDragAction = global.stage.get_action('osk')!;

        let baseDist = 300;
        let gestureIsGoingOn= false;

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
