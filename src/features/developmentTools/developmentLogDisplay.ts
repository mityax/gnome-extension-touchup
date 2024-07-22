import St from "@girs/st-14";
import * as Main from '@girs/gnome-shell/ui/main';
import {Widgets} from "$src/utils/ui/widgets";
import Clutter from "@girs/clutter-14";
import '@girs/gnome-shell/extensions/global';
import {clamp} from "$src/utils/utils";
import {css} from "$src/utils/ui/css";
import {addLogCallback, debugLog, removeLogCallback} from "$src/utils/logging";
import GLib from "@girs/glib-2.0";
import GObject from "@girs/gobject-2.0";
import Stage = Clutter.Stage;
import PolicyType = St.PolicyType;
import Pango from "@girs/pango-1.0";


export class DevelopmentLogDisplayButton extends Widgets.Bin {
    static readonly MAX_LENGTH = 25_000;

    static {
        GObject.registerClass(this);
    }

    private readonly logDisplays: St.Widget[] = [];
    private readonly logAddedCallbacks: ((text: string) => void)[] = [];
    private readonly logCallbackId: number;

    constructor() {
        super({
            styleClass: 'panel-button',
            reactive: true,
            canFocus: true,
            xExpand: true,
            yExpand: false,
            trackHover: true,
            child: new St.Icon({
                iconName: 'format-justify-left-symbolic',
                iconSize: 16,
            }),
        });
        this.connect('button-press-event', this._onButtonPressed.bind(this));
        this.connect('touch-event', this._onButtonPressed.bind(this));

        //@ts-ignore
        Main.layoutManager._bgManagers.forEach(this._addLogDisplay.bind(this));

        this.logCallbackId = addLogCallback((t) => {
            this.logAddedCallbacks.forEach((c) => c(t))
        });
    }

    private _addLogDisplay(bgManager: any): void {
        debugLog("Adding log display.");
        const scaleFactor = St.ThemeContext.get_for_stage(global.stage as Stage).scaleFactor;

        const label = new Widgets.Label({
            text: '',
            style: 'font-family: monospace;',
        });
        //label.clutterText.ellipsize = Pango.EllipsizeMode.NONE;  // leads to bugs with St.ScrollView :/
        const display = new Widgets.ScrollView({
            child: label,
            width: clamp(global.screenWidth * 0.5, 250 * scaleFactor, 900 * scaleFactor),
            height: clamp(global.screenHeight * 0.5, 250 * scaleFactor, 900 * scaleFactor),
            hscrollbarPolicy: PolicyType.AUTOMATIC,
            vscrollbarPolicy: PolicyType.AUTOMATIC,
            style: css({
                backgroundColor: 'rgba(0,0,0,0.5)',
                color: 'white',
                padding: '15px',
                borderRadius: '10px',
            }),
            constraints: new Clutter.BindConstraint({
                source: bgManager._container,
                coordinate: Clutter.BindCoordinate.POSITION,
                offset: Main.panel.height + 25
            }),
        });
        bgManager._container.add_child(display);
        this.logAddedCallbacks.push((t) => {
            const a = display.get_vadjustment();
            const isAtBottom = a.value + a.pageSize >= a.upper - 25 * scaleFactor;
            label.text = (label.text + '\n' + t).slice(-DevelopmentLogDisplayButton.MAX_LENGTH).trimStart();

            if (isAtBottom) {
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
                    a.set_value(a.upper);
                    return GLib.SOURCE_REMOVE;
                });
            }
        });
        this.logDisplays.push(display);
    }

    private _onButtonPressed(_: Clutter.Actor, e: Clutter.Event) {
        if (e.type() == Clutter.EventType.BUTTON_PRESS ||
            e.type() == Clutter.EventType.TOUCH_END) {
            for (let d of this.logDisplays) {
                d.visible = !d.visible;
            }
        }
    }

    destroy() {
        this.logDisplays.forEach((d) => d.destroy());
        removeLogCallback(this.logCallbackId);
    }
}
