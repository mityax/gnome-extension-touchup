import St from "@girs/st-14";
import {Monitor, MonitorConstraint} from "@girs/gnome-shell/ui/layout";
import {PatchManager} from "$src/utils/patchManager";
import * as Main from "@girs/gnome-shell/ui/main";
import Clutter from "@girs/clutter-14";
import {Widgets} from "$src/utils/ui/widgets";
import {debugLog, log, randomChoice} from "$src/utils/utils";
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
            backgroundColor: Clutter.Color.from_string('black')[1],
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
            connect: {
                'button-press-event': () => {
                    debugLog('Button-pressed!!!');
                    this.close();
                },
                'clicked': () => {
                    debugLog('Clicked!!!');
                    this.close();
                },
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
            this.actor.backgroundColor = Clutter.Color.from_string(randomChoice([
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
