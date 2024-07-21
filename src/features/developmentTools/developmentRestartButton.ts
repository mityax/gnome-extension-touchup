import '@girs/gnome-shell/extensions/global';

import Meta from "@girs/meta-14";
import St from "@girs/st-14";

import Gio from "@girs/gio-2.0";
import {ModalDialog} from "@girs/gnome-shell/ui/modalDialog";
import {MessageDialogContent} from "@girs/gnome-shell/ui/dialog";
import GLib from "@girs/glib-2.0";
import Clutter from "@girs/clutter-14";
import Graphene from "@girs/graphene-1.0";
import {Widgets} from "$src/utils/ui/widgets";
import PolicyType = St.PolicyType;
import GObject from "@girs/gobject-2.0";
import {debugLog} from "$src/utils/logging";


Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');


export class DevelopmentRestartButton extends St.Bin {
    static {
        GObject.registerClass(this);
    }

    private readonly icon: St.Icon;
    private readonly projectDir  = GLib.getenv('GNOMETOUCH_PROJECT_DIR');

    constructor() {
        super({
            styleClass: 'panel-button',
            reactive: true,
            canFocus: true,
            xExpand: true,
            yExpand: false,
            trackHover: true,
        });
        this.connect('button-press-event', this._onButtonPressed.bind(this));
        this.connect('touch-event', this._onButtonPressed.bind(this));

        this.icon = new St.Icon({
            iconName: 'view-refresh',
            styleClass: 'system-status-icon',
            opacity: this.projectDir ? 255 : 128,
            iconSize: 18,
            pivotPoint: new Graphene.Point({x: 0.5, y: 0.5}),
        });
        this.set_child(this.icon);
    }

    destroy() {
        super.destroy();
        this.icon.destroy();
    }

    private async _onButtonPressed() {
        let res = true;

        if (this.projectDir) {
            res = await this._withAnimatedIcon(() => this._rebuild());
        }

        if (res) {
            this._restart();
        }
    }

    private _restart() {
        Meta.restart('Restarting…', global.context);
    }

    private async _rebuild(showDialogOnError: boolean = true) {
        try {
            const launcher = new Gio.SubprocessLauncher({
                flags: Gio.SubprocessFlags.STDIN_PIPE |
                    Gio.SubprocessFlags.STDOUT_PIPE |
                    Gio.SubprocessFlags.STDERR_PIPE,
            });
            debugLog("CWD: ", this.projectDir);
            launcher.set_cwd(this.projectDir!);
            const proc = launcher.spawnv(['npm', 'run', 'install']);
            const [stdout, stderr] = await proc.communicate_utf8_async(null, null);

            debugLog(`Exit code (${proc.get_successful() ? 'successful' : 'unsuccessful'}): `, proc.get_exit_status());

            if (!proc.get_successful()) {
                debugLog(`Build failed.\n\nstdout:\n${stdout}"\n\nstderr:\n${stderr}`)

                if (showDialogOnError) {
                    this._showBuildFailedDialog(proc.get_exit_status(), stdout, stderr);
                }

                return false;
            }
        } catch (e) {
            debugLog(e);
            return false;
        }

        return true;
    }

    private _showBuildFailedDialog(exitStatus: number, stdout: string | null, stderr: string | null) {
        const d = new ModalDialog({
            destroyOnClose: true,
            width: 0.7 * global.screenWidth,
        });

        const content = new MessageDialogContent({
            title: 'Build failed',
            description: `Rebuilding the extension failed with exit code ${exitStatus}`,
        });

        const outputText = new St.Label({
            text: `Exit code: ${exitStatus}\n\nOutput:` + stdout + "\n\nError output:\n" + stderr,
            style: 'font-family: monospace; cursor: text;',
            reactive: true,
            canFocus: true,
            trackHover: true,
        });
        outputText.clutterText.selectable = true;
        outputText.clutterText.reactive = true;

        content.add_child(new Widgets.ScrollView({
            height: 0.45 * global.screenHeight,
            hscrollbarPolicy: PolicyType.ALWAYS,
            vscrollbarPolicy: PolicyType.AUTOMATIC,
            child: outputText,
        }));

        d.contentLayout.add_child(content);
        d.addButton({
            label: 'Restart anyway',
            action: () => {
                d.close()
                this._restart();
            }
        });
        d.addButton({
            label: 'Close',
            action: () => d.close(),
            default: true,
        });
        d.open();
    }

    private _startIconAnimation() {
        let running = true;
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
            if (running) {
                //@ts-ignore
                this.icon.ease({
                    rotationAngleZ: (this.icon.rotationAngleZ + 7) % 360,
                    duration: 10,
                    mode: Clutter.AnimationMode.LINEAR,
                });
            } else {
                this.icon.rotationAngleZ = 0;
            }
            return running ? GLib.SOURCE_CONTINUE : GLib.SOURCE_REMOVE;
        })

        return () => running = false;
    }

    private async _withAnimatedIcon<T>(whileRunning: () => Promise<T>) {
        let stop = this._startIconAnimation();
        let res = await whileRunning();
        stop();
        return res;
    }
}

