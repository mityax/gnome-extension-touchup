import St from "gi://St";

import Gio from "gi://Gio";
import Clutter from "gi://Clutter";
import Graphene from "gi://Graphene";
import GObject from "gi://GObject";
import {DevToolButton} from "$src/features/developmentTools/developmentToolButton";
import {IntervalRunner} from "$src/utils/intervalRunner.ts";
import {_rebuildExtension, _restartShell, PROJECT_DIR} from "$src/features/developmentTools/utils.ts";


Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');


export class RestartButton extends DevToolButton {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super({
            label: PROJECT_DIR !== null ? 'Rebuild and restart' : 'Restart',
            icon: new St.Icon({
                iconName: 'system-reboot-symbolic',
                iconSize: 16,
                opacity: PROJECT_DIR !== null ? 255 : 128,
                pivotPoint: new Graphene.Point({x: 0.5, y: 0.5}),
            }),
            onPressed: () => this._onPressed(),
        });
    }

    private async _onPressed() {
        let res = true;
        this.icon.opacity = 128;
        if (PROJECT_DIR) {
            res = await this._withAnimatedIcon(() => _rebuildExtension());
        }
        this.icon.opacity = 255;

        if (res) {
            _restartShell();
        }
    }

    protected _startIconAnimation() {
        const runner = new IntervalRunner(10, () => {
            //@ts-ignore
            this.icon.ease({
                rotationAngleZ: (this.icon.rotationAngleZ + 7) % 360,
                duration: 10,
                mode: Clutter.AnimationMode.LINEAR,
            });
        });
        runner.start();

        return () => {
            runner.stop();
            this.icon.rotationAngleZ = 0;
        };
    }

    protected async _withAnimatedIcon<T>(whileRunning: () => Promise<T>) {
        let stop = this._startIconAnimation();
        let res = await whileRunning();
        stop();
        return res;
    }
}

