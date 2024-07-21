import St from "@girs/st-14";
import * as Main from '@girs/gnome-shell/ui/main';
import {Widgets} from "../../utils/ui/widgets";
import Clutter from "@girs/clutter-14";
import '@girs/gnome-shell/extensions/global';
import {clamp} from "../../utils/utils";
import Gio from "@girs/gio-2.0";
import {css} from "$src/utils/ui/css";
import {addLogCallback, debugLog, removeLogCallback} from "$src/utils/logging";
import Stage = Clutter.Stage;
import PolicyType = St.PolicyType;
import BindConstraint = Clutter.BindConstraint;
import BindCoordinate = Clutter.BindCoordinate;
import GLib from "@girs/glib-2.0";


const MAX_HISTORY_LENGTH = 10_000;  // in bytes


export class DevelopmentLogDisplay {
    private readonly logDisplays: St.Widget[] = [];
    private readonly logAddedCallbacks: ((text: string) => void)[] = [];
    private logCallbackId: number;

    constructor() {
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
            constraints: new BindConstraint({
                source: bgManager._container,
                coordinate: BindCoordinate.POSITION,
                offset: Main.panel.height + 25
            }),
        });
        bgManager._container.add_child(display);
        this.logAddedCallbacks.push((t) => {
            const a = display.get_vadjustment();
            const isAtBottom = a.value + a.pageSize >= a.upper - 25 * scaleFactor;
            label.text += t + '\n';

            if (isAtBottom) {
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 5, () => {
                    a.set_value(a.upper);
                    return GLib.SOURCE_REMOVE;
                });
            }
        });
    }

    destroy() {
        this.logDisplays.forEach((d) => d.destroy());
        removeLogCallback(this.logCallbackId);
    }
}
