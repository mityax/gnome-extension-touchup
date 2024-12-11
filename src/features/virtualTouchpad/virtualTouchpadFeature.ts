import St from "gi://St";
import {MonitorConstraint} from "resource:///org/gnome/shell/ui/layout.js";
import {PatchManager} from "$src/utils/patchManager";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import Clutter from "gi://Clutter";
import {Widgets} from "$src/utils/ui/widgets";
import {randomChoice} from "$src/utils/utils";
import {debugLog} from "$src/utils/logging";
import Cogl from "gi://Cogl";
import ActorAlign = Clutter.ActorAlign;
import EventPhase = Clutter.EventPhase;


export class VirtualTouchpad {
    public static readonly PATCH_SCOPE: unique symbol = Symbol('virtual-touchpad');
    private readonly actor: St.Widget;

    constructor() {
        const buttonRef = new Widgets.Ref<Widgets.Button>();
        this.actor = new St.Widget({
            name: 'gnometouch-virtual-touchpad',
            visible: false,
            reactive: true,
            trackHover: true,
            canFocus: true,
            backgroundColor: Cogl.Color.from_string('black')[1],
            constraints: new Clutter.BindConstraint({
                source: Main.uiGroup,
                coordinate: Clutter.BindCoordinate.ALL,
            }),
        });
        this.actor.add_child(new Widgets.Button({
            child: new Widgets.Icon({iconName: 'edit-delete-symbolic', style: 'color: white;'}),
            ref: buttonRef,
            reactive: true,
            trackHover: true,
            canFocus: true,
            xAlign: ActorAlign.END,
            yAlign: ActorAlign.START,
            onClicked: () => {
                debugLog('Clicked!!!');
                this.close();
            },
        }));
        this.actor.add_constraint(new MonitorConstraint({
            workArea: true,
            primary: true,  // TODO: show on touch-enabled monitor instead of primary one
        }));

        /*let st = new TouchSwipeGesture();
        this.actor.add_action_full('test', EventPhase.BUBBLE, st);
        st.connect('end', () => {
            debugLog("Swept!");
        })*/
        let ac = new Clutter.TapAction({});
        this.actor.add_action_full('test', EventPhase.CAPTURE, ac);
        ac.connect('tap', () => {
            debugLog('Tap action activated');
            this.actor.backgroundColor = Cogl.Color.from_string(randomChoice([
                "red", 'blue', 'green', 'purple', 'yellow', 'orange', 'black', 'white'
            ]))[1];
        })


        PatchManager.patch(() => {
            Main.layoutManager.addChrome(this.actor, {
                affectsStruts: false,
                trackFullscreen: false,
                affectsInputRegion: true,
            });

            return () => Main.layoutManager.removeChrome(this.actor);
        }, {scope: VirtualTouchpad.PATCH_SCOPE});
    }

    open() {
        this.actor.show();
    }

    close() {
        this.actor.hide();
    }

    toggle() {
        if (this.actor.visible) {
            this.actor.hide();
        } else {
            this.actor.show();
        }
    }

    destroy() {
        this.actor?.destroy();
    }
}
