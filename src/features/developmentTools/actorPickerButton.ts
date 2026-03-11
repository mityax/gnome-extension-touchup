// SPDX-FileCopyrightText: 2026 mityax, 2026
//
// SPDX-License-Identifier: GPL-3.0-only

import {DevToolButton} from "./developmentToolButton";
import GObject from "gi://GObject";
import Clutter from "gi://Clutter";
import {Bin, Ref} from "$src/utils/ui/widgets";
import {css} from "$src/utils/ui/css";
import {logger} from "$src/core/logging";
import Meta from "gi://Meta";
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
            global.stage.add_child(new Bin({
                x: 0,
                y: 0,
                width: global.stage.width,
                height: global.stage.height,
                reactive: true,
                canFocus: true,
                // @ts-ignore
                onButtonPressEvent: (bin: Bin, event: Clutter.Event) => {
                    bin.destroy();
                    resolve(global.stage.get_actor_at_pos(Clutter.PickMode.ALL, ...event.get_coords()));
                },
                // @ts-ignore
                onTouchEvent: (bin: Bin, event: Clutter.Event) => {
                    bin.destroy();
                    resolve(global.stage.get_actor_at_pos(Clutter.PickMode.ALL, ...event.get_coords()));
                },
                // @ts-ignore
                onKeyReleaseEvent: (bin: Bin, event: Clutter.Event) => {
                    bin.destroy();
                    resolve(null);
                },
                style: css({
                    backgroundColor: "rgba(0,0,0,0.2)"
                }),
                // onCreated: bin => bin.set_cursor_type(Clutter.CursorType.CROSS),
                onCreated: () => global.display.set_cursor(Meta.Cursor.CROSSHAIR),
                onDestroy: () => global.display.set_cursor(Meta.Cursor.DEFAULT),
            }));
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
