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
import Stage = Clutter.Stage;
import PolicyType = St.PolicyType;


export class DevelopmentLogDisplayButton extends DevToolToggleButton {
    static readonly MAX_LENGTH = 25_000;

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
                fontSize: '9pt',
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
                Delay.ms(10).then(() => {
                    if (this.logDisplays.includes(display)) a.set_value(a.upper);
                });
            }
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
