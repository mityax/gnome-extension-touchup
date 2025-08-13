import St from "gi://St";

import Gio from "gi://Gio";
import Clutter from "gi://Clutter";
import Graphene from "gi://Graphene";
import GObject from "gi://GObject";
import {DevToolButton} from "$src/features/developmentTools/developmentToolButton";
import {IntervalRunner} from "$src/utils/intervalRunner";
import {
    _hotReloadExtension,
    _rebuildExtension,
    BUILD_OUTPUT_DIR,
    PROJECT_DIR
} from "$src/features/developmentTools/developmentReloadUtils";
import {AssetIcon} from "$src/utils/ui/assetIcon";
import {logger} from "$src/utils/logging";


Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');


export class HotReloadButton extends DevToolButton {
    private readonly extensionUuid: string;

    static {
        GObject.registerClass(this);
    }

    constructor(extensionUuid: string) {
        super({
            label: 'Rebuild and hot-reload',
            icon: new St.Icon({
                gicon: new AssetIcon('camera-flash-symbolic'),
                iconSize: 16,
                opacity: PROJECT_DIR !== null ? 255 : 128,
                pivotPoint: new Graphene.Point({x: 0.5, y: 0.5}),
            }),
            onPressed: () => this._onPressed(),
        });
        this.extensionUuid = extensionUuid;
    }

    private async _onPressed() {
        let res = true;
        this.icon.opacity = 128;
        try {
            if (PROJECT_DIR && BUILD_OUTPUT_DIR) {
                res = await this._withAnimatedIcon(() => _rebuildExtension({
                    buildForHotReload: true,
                    showDialogOnError: true,
                }));
            }
            this.icon.opacity = 255;

            if (res) {
                await _hotReloadExtension(this.extensionUuid, {
                    baseUri: `file://${BUILD_OUTPUT_DIR}`,
                });
            }
        } catch (e) {
            logger.error("Error during hot reloading or building: ", e);
            console.error(e);
        }
    }

    protected _startIconAnimation() {
        const runner = new IntervalRunner(201, () => {
            //@ts-ignore
            this.icon.ease({
                opacity: this.icon.opacity == 128 ? 255 : 128,
                duration: 200,
                mode: Clutter.AnimationMode.LINEAR,
            });
        });
        runner.start();

        return () => {
            runner.stop();
            this.icon.opacity = 255;
        };
    }

    protected async _withAnimatedIcon<T>(whileRunning: () => Promise<T>) {
        let stop = this._startIconAnimation();
        let res = await whileRunning();
        stop();
        return res;
    }
}

