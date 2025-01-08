import {RestartButton} from "$src/features/developmentTools/restartButton.ts";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import {DevelopmentLogDisplayButton} from "$src/features/developmentTools/logDisplay.ts";
import {Widgets} from "$src/utils/ui/widgets";
import {debugLog, log} from "$src/utils/logging";
import Clutter from "gi://Clutter";
import {css} from "$src/utils/ui/css";
import Graphene from "gi://Graphene";
import {DevToolToggleButton} from "$src/features/developmentTools/developmentToolButton";
import GnomeTouchExtension from "$src/extension";
import {HotReloadButton} from "$src/features/developmentTools/hotReloadButton.ts";
import GLib from "gi://GLib";
import EventSource from "$src/utils/eventSource.ts";
import {_hotReloadExtension} from "$src/features/developmentTools/developmentReloadUtils.ts";
import ExtensionFeature from "$src/utils/extensionFeature.ts";
import {CancellablePromise, Delay} from "$src/utils/delay.ts";


export class DevelopmentTools extends ExtensionFeature {
    private _enforceTouchMode = false;
    private extension: GnomeTouchExtension;

    constructor(extension: GnomeTouchExtension) {
        super();
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
                label: 'Enforce touch-mode',
                icon: 'phone-symbolic',
                onPressed: (v) => {
                    this._enforceTouchMode = v;
                    this.extension.syncUI();
                }
            }),
            new Widgets.Bin({width: 15}),
            new RestartButton(),
            new Widgets.Bin({width: 15}),
            new HotReloadButton(),
        ];
    }

    get enforceTouchMode(): boolean {
        return this._enforceTouchMode;
    }

    enable() {
        this._setupDevToolBar();
        this._setupLiveReload();
    }

    private _setupDevToolBar() {
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

        //@ts-ignore
        Main.panel._rightBox.insert_child_at_index(box, 0);

        this.onCleanup(() => box.destroy());
    }

    private _setupLiveReload() {
        const watchBaseUrl = GLib.getenv("GNOMETOUCH_WATCH_EVENT_URL")?.replace(/\/$/, ""); // remove trailing slash
        const baseDir = GLib.getenv("GNOMETOUCH_BUILD_DIRECTORY")?.replace(/\/$/, "");

        if (!watchBaseUrl || !baseDir) return () => {};

        const source = new EventSource(`${watchBaseUrl}/esbuild`);
        source.on('change', debounce((data) => {
            _hotReloadExtension({
                baseUri: `file://${baseDir}`,
                // Data is a JSON-string containing info about changed files, e.g.:
                //   {"added":[],"removed":[],"updated":["/extension.js"]}
                // We're lazy here and just check whether '.js"' is present in that string:
                stylesheetsOnly: !/\.js"/.test(data),
            }).catch((e) => void debugLog("Error during auto-hot-reloading extension: ", e));
        }, 500));
        source.start()
            .then(_ => debugLog(`[Live-reload] Connected to ${watchBaseUrl}`))
            .catch((e) => log("[Live-reload] Failed to start listening to SSE events: ", e));

        this.onCleanup(() => source.close());
    }
}


function debounce<T extends (...args: any[]) => void>(func: T, delay_ms: number): (...args: Parameters<T>) => void {
    let d: CancellablePromise<boolean> | null = null;

    return (...args: Parameters<T>): void => {
        d?.cancel();
        d = Delay.ms(delay_ms);
        d.then(_ => func(...args));
    };
}



