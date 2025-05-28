import {RestartButton} from "$src/features/developmentTools/restartButton";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import {DevelopmentLogDisplayButton} from "$src/features/developmentTools/logDisplay";
import * as Widgets from "$src/utils/ui/widgets";
import {debugLog, log} from "$src/utils/logging";
import Clutter from "gi://Clutter";
import {css} from "$src/utils/ui/css";
import Graphene from "gi://Graphene";
import {DevToolToggleButton} from "$src/features/developmentTools/developmentToolButton";
import TouchUpExtension from "$src/extension";
import {HotReloadButton} from "$src/features/developmentTools/hotReloadButton";
import GLib from "gi://GLib";
import EventSource from "$src/utils/eventSource";
import {_hotReloadExtension} from "$src/features/developmentTools/developmentReloadUtils";
import ExtensionFeature from "$src/utils/extensionFeature";
import {PatchManager} from "$src/utils/patchManager";
import {debounce} from "$src/utils/debounce";
import Cogl from "gi://Cogl";
import {SendTestNotificationsButton} from "$src/features/developmentTools/sendTestNotificationsButton";
import {TouchModeService} from "$src/services/touchModeService";


type _PersistedState = {
    enforceTouchMode: boolean,
    showLogDisplays: boolean,
};


export class DevelopmentTools extends ExtensionFeature {
    // Note: This is intentionally not a patch; this is state that needs to be persisted through hot-reloads.
    // Since the DevelopmentTools code will not be included in release builds this is not a problem for code review.
    get _persistedState(): _PersistedState {
        // @ts-ignore
        return window._touchUpPersistedState ??= {
            enforceTouchMode: false,
            showLogDisplays: true,
        };
    }

    constructor(pm: PatchManager) {
        super(pm);
        this._setupDevToolBar();
        this._setupLiveReload();

        // Set the [enforceTouchMode] from the persisted state:
        TouchUpExtension.instance!.getFeature(TouchModeService)!.enforceTouchMode =
            this._persistedState.enforceTouchMode;
    }

    private buildToolbar() {
        return [
            new Widgets.Label({
                text: 'TouchUp DevTools',
                yAlign: Clutter.ActorAlign.CENTER,
            }),
            new Widgets.Bin({width: 25}),
            new DevelopmentLogDisplayButton({
                initialValue: this._persistedState.showLogDisplays,
                onPressed: (v) => this._persistedState.showLogDisplays = v,
            }),
            new Widgets.Bin({width: 10}),
            new DevToolToggleButton({
                label: 'Enforce touch-mode',
                icon: 'phone-symbolic',
                initialValue: this._persistedState.enforceTouchMode,
                onPressed: (v) => {
                    this._persistedState.enforceTouchMode = v;
                    TouchUpExtension.instance!.getFeature(TouchModeService)!.enforceTouchMode = v;
                }
            }),
            new Widgets.Bin({width: 15}),
            new RestartButton(),
            new Widgets.Bin({width: 10}),
            new HotReloadButton(TouchUpExtension.instance!.metadata.uuid),
            new Widgets.Bin({width: 10}),
            new Widgets.Bin({width: 1, backgroundColor: Cogl.Color.from_string('grey')[1]}),
            new Widgets.Bin({width: 10}),
            new SendTestNotificationsButton(),
        ];
    }

    get enforceTouchMode(): boolean {
        return this._persistedState.enforceTouchMode;
    }

    private _setupDevToolBar() {
        this.pm.patch(() => {
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

            return () => box.destroy();
        });
    }

    private _setupLiveReload() {
        const watchBaseUrl = GLib.getenv("TOUCHUP_WATCH_EVENT_URL")?.replace(/\/$/, ""); // remove trailing slash
        const baseDir = GLib.getenv("TOUCHUP_BUILD_DIRECTORY")?.replace(/\/$/, "");

        if (!watchBaseUrl || !baseDir) return () => {};

        this.pm.patch(() => {
            const source = new EventSource(`${watchBaseUrl}/watch`);
            source.on('reload', debounce((data) => {
                _hotReloadExtension(TouchUpExtension.instance!.metadata.uuid, {
                    baseUri: `file://${baseDir}`,
                    // `data` is a JSON-string containing info about changed files, e.g.:
                    //   {"added":[],"removed":[],"updated":["src/extension.ts"]}
                    // We're lazy here and just check whether '.js"' or '.ts"' is present in that string:
                    stylesheetsOnly: !/\.[jt]s"/.test(data),
                }).catch((e) => void debugLog("Error during auto-hot-reloading extension: ", e));
            }, 500));
            source.start()
                .then(_ => debugLog(`[Live-reload] Connected to ${watchBaseUrl}`))
                .catch((e) => log("[Live-reload] Failed to start listening to SSE events: ", e));

            return () => source.close();
        });
    }
}



