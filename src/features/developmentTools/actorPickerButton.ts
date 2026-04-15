import {DevToolButton} from "./developmentToolButton";
import GObject from "gi://GObject";
import Clutter from "gi://Clutter";
import {Bin, Ref} from "$src/utils/ui/widgets";
import {css} from "$src/utils/ui/css";
import {logger} from "$src/core/logging";
import {showActorInfoPopup} from "$src/features/developmentTools/actorInfoPopup";


export class ActorPickerButton extends DevToolButton {
    static {
        GObject.registerClass(this);
    }

    constructor(props?: {ref?: Ref<ActorPickerButton>}) {
        super({
            ref: props?.ref,
            label: 'Actor Analyzer',
            icon: 'color-select-symbolic',
            onPressed: () => this.trigger(),
        });
    }

    private async trigger() {
        const actor = await this._doPickActor();
        if (actor) {
            logger.debug(actor);
            try {
                showActorInfoPopup(actor);
            } catch (e) {
                logger.error(e);
            }
        }
    }

    private async _doPickActor(): Promise<Clutter.Actor | null> {
        return new Promise((resolve) => {
            const overlay = new Bin({
                x: 0,
                y: 0,
                width: global.stage.width,
                height: global.stage.height,
                reactive: true,
                canFocus: true,
                cursorType: Clutter.CursorType.CROSSHAIR,
                onButtonPressEvent: (bin: Bin, event: Clutter.Event) => {
                    bin.destroy();
                    resolve(global.stage.get_actor_at_pos(Clutter.PickMode.ALL, ...event.get_coords()));
                },
                onTouchEvent: (bin: Bin, event: Clutter.Event) => {
                    bin.destroy();
                    resolve(global.stage.get_actor_at_pos(Clutter.PickMode.ALL, ...event.get_coords()));
                },
                onKeyReleaseEvent: (bin: Bin, event: Clutter.Event) => {
                    bin.destroy();
                    resolve(null);
                },
                style: css({
                    backgroundColor: "rgba(0,0,0,0.2)",
                }),
            });

            global.stage.insert_child_above(overlay, null);
        });


        // return new Promise((resolve) => {
        //     const filterId = Clutter.event_add_filter(global.stage, (event, event_actor) => {
        //         if (event.type() === Clutter.EventType.BUTTON_PRESS) {
        //             Clutter.event_remove_filter(filterId);
        //             resolve(global.stage.get_actor_at_pos(Clutter.PickMode.ALL, ...event.get_coords()));
        //         } else if (event.type() === Clutter.EventType.KEY_PRESS && event.get_key_code() === Clutter.KEY_Escape) {
        //             Clutter.event_remove_filter(filterId);
        //             resolve(null);
        //         }
        //
        //         return Clutter.EVENT_STOP;
        //     });
        // });
    }
}
