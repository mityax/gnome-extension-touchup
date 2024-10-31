import {DevelopmentRestartButton} from "$src/features/developmentTools/developmentRestartButton";
import {PatchManager} from "$src/utils/patchManager";
import * as Main from "@girs/gnome-shell/ui/main";
import {DevelopmentLogDisplayButton} from "$src/features/developmentTools/developmentLogDisplay";
import {Widgets} from "$src/utils/ui/widgets";
import {debugLog} from "$src/utils/logging";
import Clutter from "@girs/clutter-15";
import {css} from "$src/utils/ui/css";
import Graphene from "@girs/graphene-1.0";
import {DevToolToggleButton} from "$src/features/developmentTools/developmentToolButton";
import GnomeTouchExtension from "$src/extension";


export class DevelopmentTools {
    static readonly PATCH_SCOPE = Symbol('development-tools');

    private _enforceTouchMode = false;
    private extension: GnomeTouchExtension;

    constructor(extension: GnomeTouchExtension) {
        this.extension = extension;
        this.enable();
    }

    private buildToolbar() {
        return [
            new Widgets.Label({
                text: 'Gnome Touch DevTools',
                yAlign: Clutter.ActorAlign.CENTER,
            }),
            new Widgets.Bin({width: 25}),
            new DevelopmentLogDisplayButton(),
            new Widgets.Bin({width: 10}),
            new DevToolToggleButton({
                label: 'Enforce Touch-Mode',
                icon: 'phone-symbolic',
                onPressed: (v) => {
                    this._enforceTouchMode = v;
                    this.extension.syncUI();
                }
            }),
            new Widgets.Bin({width: 15}),
            new DevelopmentRestartButton(),
        ];
    }

    enable() {
        PatchManager.patch(() => {
            const box = new Widgets.Row({
                yExpand: false,
                style: css({
                    border: '1px solid #cbcbcb',
                    borderRadius: '25px',
                    padding: '0 10px',
                    margin: '3px 15px',
                }),
                scaleX: 0.8,
                scaleY: 0.8,
                pivotPoint: new Graphene.Point({x: 0.5, y: 0.5}),
                children: this.buildToolbar(),
            });

            debugLog("Inserting devtools");

            //@ts-ignore
            Main.panel._rightBox.insert_child_at_index(box, 0);

            return () => box.destroy();
        }, {scope: DevelopmentTools.PATCH_SCOPE});
    }

    disable() {
        PatchManager.disable(DevelopmentTools.PATCH_SCOPE);
    }

    get enforceTouchMode(): boolean {
        return this._enforceTouchMode;
    }
}

