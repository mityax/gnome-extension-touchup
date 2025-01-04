import Meta from "gi://Meta";
import Gio from "gi://Gio";
import {assert, debugLog} from "../../utils/logging";
import {ModalDialog} from "resource:///org/gnome/shell/ui/modalDialog.js";
import {MessageDialogContent} from "resource:///org/gnome/shell/ui/dialog.js";
import St from "gi://St";
import {Widgets} from "../../utils/ui/widgets";
import GLib from "gi://GLib";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import GnomeTouchExtension from "$src/extension.ts";
import GObject from "gi://GObject";
import PolicyType = St.PolicyType;


export const PROJECT_DIR  = GLib.getenv('GNOMETOUCH_PROJECT_DIR');


export function _restartShell() {
    Meta.restart('Restarting…', global.context);
}


/**
 * Hot-reload the extension.
 *
 * If a [baseUri] is given, the extension will be reloaded from that location instead of the default
 * location. At the moment, only "file://" urls are supported.
 *
 * Note 1: Since this function applies temporary patches to the extension system, its code is disallowed
 * in the extension review at extensions.gnome.org – therefore, this function must never be included
 * in release builds.
 *
 * Note 2: While this generally works well and improves development iteration speed, it should not be
 * relied upon to always correctly work – if anything unexpected happens, try a full shell restart instead
 * to exclude the possibility that something went wrong/was not properly uninitialized during hot reload.
 *
 * Note 3: Duplicate registration of GTypes (using GObject.registerClass) is prevented by appending a reload
 * id (derived from the current system time) to all newly registered GTypeNames – for example "MyClass_hr1735922389432".
 * Thus, GTypeNames will no longer match the class names – this should not have any consequences relevant to this
 * extension, but it is good to be aware of this, still.
 */
export async function _hotReloadExtension(config?: { baseUri?: string }) {
    assert(!config?.baseUri || config.baseUri.startsWith('file://'), "Only file:// uris are supported as baseUri.");

    const reloadId = `hr${Date.now().toString()}`;

    debugLog(`Hot-restarting extension (reload id: ${reloadId})…`);

    const extObj = Main.extensionManager.lookup(GnomeTouchExtension.instance!.uuid!);

    // Patch the extension path function to append a cache-buster to the imported url; this
    // is what allows us to re-import the extension while bypassing the module cache:
    const origGetChildFn = extObj.dir.get_child;
    extObj.dir.get_child = (name: string) => {
        let res: Gio.File = origGetChildFn.call(extObj.dir, name);

        if (config?.baseUri) {
            res.get_uri = () => `${config?.baseUri}/${name}?cache_buster=${reloadId}`;
            if (name.endsWith(".css")) {
                res = Gio.File.new_for_uri(res.get_uri());
            }
        } else if (name === "extension.js") {
            const origUri = res.get_uri();
            res.get_uri = () => `${origUri}?cache_buster=${reloadId}`;
        }
        return res;
    };

    // Patch extension error logger function to print errors occurring during reloading the extension:
    const origLogExtError = Main.extensionManager.logExtensionError;
    Main.extensionManager.logExtensionError = (u, e) => {
        debugLog(`Extension error during hot reload (${u}): ${e}`);
        console.error(e);
        origLogExtError.call(Main.extensionManager, u, e);
    }

    // Patch GObject.registerClass to fix duplicate GTypeNames since all classes the extension registers
    // are now registered again – this is circumvented by attaching the reload id as a suffix to the GTypeName:
    const origRegisterClass = GObject.registerClass;
    // @ts-ignore
    GObject.registerClass = (meta: any, cls: any) => {
        if (typeof cls === 'undefined') {
            cls = meta;
            meta = {};
        }
        meta.GTypeName = `${meta.GTypeName ?? cls.prototype.constructor.name}_${reloadId}`;
        // @ts-ignore
        origRegisterClass.call(GObject, meta, cls);
    }

    try {
        await Main.extensionManager.reloadExtension(extObj);
    } finally {
        // Undo all patches:
        extObj.dir.get_child = origGetChildFn;
        Main.extensionManager.logExtensionError = origLogExtError;
        GObject.registerClass = origRegisterClass;
    }
}


export async function _rebuildExtension(showDialogOnError: boolean = true) {
    try {
        const launcher = new Gio.SubprocessLauncher({
            flags: Gio.SubprocessFlags.STDIN_PIPE |
                Gio.SubprocessFlags.STDOUT_PIPE |
                Gio.SubprocessFlags.STDERR_PIPE,
        });
        debugLog("Rebuilding extension, cwd: ", PROJECT_DIR);
        launcher.set_cwd(PROJECT_DIR!);
        const proc = launcher.spawnv(['npm', 'run', 'install']);
        // @ts-ignore
        const [stdout, stderr] = await proc.communicate_utf8_async(null, null);

        debugLog(`Exit code (${proc.get_successful() ? 'successful' : 'unsuccessful'}): `, proc.get_exit_status());

        if (!proc.get_successful()) {
            debugLog(`Build failed.\n\nstdout:\n${stdout}"\n\nstderr:\n${stderr}`)

            if (showDialogOnError) {
                _showBuildFailedDialog(proc.get_exit_status(), stdout, stderr);
            }

            return false;
        }
    } catch (e) {
        debugLog(e);
        return false;
    }

    return true;
}

export function _showBuildFailedDialog(exitStatus: number, stdout: string | null, stderr: string | null) {
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
            _restartShell();
        }
    });
    d.addButton({
        label: 'Close',
        action: () => d.close(),
        default: true,
    });
    d.open();
}
