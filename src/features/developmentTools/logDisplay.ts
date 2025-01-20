import St from "gi://St";
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Widgets} from "$src/utils/ui/widgets";
import Clutter from "gi://Clutter";
import {clamp} from "$src/utils/utils";
import {css} from "$src/utils/ui/css";
import {addLogCallback, removeLogCallback} from "$src/utils/logging";
import GObject from "gi://GObject";
import {DevToolToggleButton} from "$src/features/developmentTools/developmentToolButton";
import {Delay} from "$src/utils/delay.ts";
import Pango from "@girs/pango-1.0";
import Cogl from "gi://Cogl";
import Stage = Clutter.Stage;
import PolicyType = St.PolicyType;
import Ref = Widgets.Ref;


export class DevelopmentLogDisplayButton extends DevToolToggleButton {
    static readonly MAX_LENGTH = 500;

    static {
        GObject.registerClass(this);
    }

    private logDisplays: St.Widget[] = [];
    private readonly logAddedCallbacks: ((text: string) => void)[] = [];
    private readonly logCallbackId: number;

    constructor() {
        super({
            label: 'Show log display',
            icon: 'format-justify-left-symbolic',
            onPressed: (value) => this._onPressed(value),
        });
        this.value = true;

        //@ts-ignore
        Main.layoutManager._bgManagers.forEach(this._addLogDisplay.bind(this));

        this.logCallbackId = addLogCallback((t) => {
            this.logAddedCallbacks.forEach((c) => c(t))
        });
    }

    private _addLogDisplay(bgManager: any): void {
        const scaleFactor = St.ThemeContext.get_for_stage(global.stage as Stage).scaleFactor;

        const col = new Ref<Widgets.Column>();
        const display = new Widgets.ScrollView({
            child: new Widgets.Column({
                ref: col,
            }),
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
            constraints: [
                new Clutter.BindConstraint({
                    source: bgManager._container,
                    coordinate: Clutter.BindCoordinate.POSITION,
                    offset: Main.panel.height + 25
                }),
            ],
        });
        bgManager._container.add_child(display);

        this.logAddedCallbacks.push((t) => {
            // Check whether the log display is scrolled to the bottom and schedule auto-scroll down if so:
            const a = display.get_vadjustment();
            if (a.value + a.pageSize >= a.upper - 25 * scaleFactor) {
                Delay.ms(25).then(() => {
                    if (this.logDisplays.includes(display)) a.set_value(a.upper);
                });
            }

            // Remove first log message if there are too many:
            if ((col.current?.get_n_children() ?? 0) > DevelopmentLogDisplayButton.MAX_LENGTH) {
                col.current!.remove_child(col.current!.get_child_at_index(0)!);
            }

            // Add the log message:
            col.current?.add_child(new Widgets.Label({
                text: t,
                onCreated: (l) => {
                    l.clutterText.lineWrap = true;
                    l.clutterText.lineWrapMode = Pango.WrapMode.WORD_CHAR;
                    l.clutterText.ellipsize = Pango.EllipsizeMode.NONE;
                    l.clutterText.selectable = true;
                    l.clutterText.reactive = true;
                    l.clutterText.selectionColor = Cogl.Color.from_string('rgba(255,255,255,0.3)')[1];
                },
                style: css({
                    backgroundColor: "rgba(255,255,255,0.2)",
                    borderRadius: "7px",
                    padding: "7px",
                    marginTop: "7px",
                    fontFamily: "monospace",
                    fontSize: '9pt',
                })
            }));
        });
        this.logDisplays.push(display);
    }

    private _onPressed(value: boolean) {
        for (let d of this.logDisplays) {
            d.visible = value;
        }
    }

    vfunc_destroy() {
        removeLogCallback(this.logCallbackId);
        this.logDisplays.forEach((d) => d.destroy());
        this.logDisplays = [];
        super.destroy();
    }
}
