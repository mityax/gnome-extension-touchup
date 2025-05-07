import St from "gi://St";
import * as Widgets from "./widgets";
import {css} from "./css";
import Clutter from "gi://Clutter";
import {Delay} from "../delay";


export default function showToast(text: string, actions: St.Button[]) {
    const toast = new Widgets.Row({
        style: css({
            background: 'rgba(32,32,32,0.8)',
            borderRadius: '50px',
            padding: '15px',
            fontSize: '90%',
            fontWeight: 'normal',
            paddingLeft: '25px',
        }),
        reactive: true,
        trackHover: true,
        children: [
            new Widgets.Label({ text, style: css({ fontWeight: 'bold' }), yAlign: Clutter.ActorAlign.CENTER }),
            new Widgets.Bin({ width: actions.length > 0 ? 45 : 0 }),
            ...actions,
        ],
    });
    toast.x = global.screenWidth / 2 - toast.width / 2;
    toast.y = global.screenHeight;
    global.stage.add_child(toast);

    // Animate in:
    // @ts-ignore
    toast.ease({
        y: global.screenHeight - toast.height - 100,
        duration: 300,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
    });

    // Use a Ref to not destroy twice:
    const ref = new Widgets.Ref(toast);

    // Close the toast when any action is invoked or delay is up:
    actions.forEach(a => a.connect('clicked', () => ref.current?.destroy()));
    // @ts-ignore
    Delay.ms(4000, 'resolve').then(() => ref.current?.ease({
        y: global.screenHeight,
        opacity: 0,
        duration: 150,
        mode: Clutter.AnimationMode.EASE_IN_QUAD,
        onComplete: () => ref.current?.destroy(),
    }));
}