import ExtensionFeature from "../../utils/extensionFeature";
import {PatchManager} from "$src/utils/patchManager";


export class PanelMenusSwipeToOpenFeature extends ExtensionFeature {
    constructor(pm: PatchManager) {
        super(pm);

        /*
        const recognizer = new GestureRecognizer({
            onGestureProgress: state => {
                if (currentMenu?.menu) {
                    currentMenu.menu.actor.translationY = -currentMenu.menu.get_transformed_size()[1] + state.totalMotionDelta.y;
                    currentMenu.menu.actor.show();
                }
            },
            onGestureEnded: state => {
                if (currentMenu?.menu) {
                    if (state.lastMotionDirection?.direction === 'up') {
                        currentMenu.menu.actor.ease({
                            translationY: -currentMenu.menu.get_transformed_size()[1],
                            duration: 200,
                            onStopped: () => currentMenu!.menu.actor.hide(),
                        });
                    } else {
                        currentMenu.menu.actor.ease({
                            translationY: 0,
                            duration: 200,
                            //onStopped: () => currentMenu.menu.actor.hide(),
                        });
                    }
                }
            }
        });

        this.pm.patch(() => {
            const action = new EdgeDragAction(St.Side.TOP, Shell.ActionMode.ALL);

            action.connect('progress', (_: any, progress: number) => {
                logger.debug("Gesture progress: ", progress);
                const actor = Main.panel.statusArea.quickSettings.menu.actor;
                actor.show()
                logger.debug("actor: ", actor, actor.get_transformed_size()[1]);
                actor.translationY = -actor.get_transformed_size()[1] + progress;
            });
            action.connect('activated', () => {
                logger.debug("Gesture activated");

            })

            Main.panel.add_action_full('touchup-panel-menus-swipe-to-open', Clutter.EventPhase.CAPTURE, action);
            return () => Main.panel.remove_action(action);
        });

        this.pm.connectTo(Main.panel, 'captured-event', (_: any, evt: Clutter.Event) => {
            if (GestureRecognizerEvent.isTouch(evt)) {
                logger.debug("Captured event: ", GestureRecognizerEvent.fromClutterEvent(evt), evt.get_related());
            }
            return Clutter.EVENT_PROPAGATE;
        });
         */
    }
}
