import GObject from "@girs/gobject-2.0";

/**
 * Class to manage global changes ("patches") that need to be undone
 * when the extension is disabled.
 */
export class PatchManager {
    private static _undoCallbacks: (() => any)[] = [];

    /**
     * Apply a patch. The callback peforming the patch is called immediately and must
     * return another function to undo the patch again.
    */
    static patch(func: () => (() => any)) {
        this._undoCallbacks.push(func());
    }

    /**
     * Overwrite a signal handler for a specific instance.
     *
     * @param instance The instance to patch the signal handler on
     * @param signalId The signal to connect to
     * @param handler The new handler that is called in place of the original handler
     */
    static patchSignalHandler(instance: GObject.Object, signalId: string, handler: (...args: any[]) => any) {
        this.patch(() => {
            //@ts-ignore
            const originalHandler = GObject.signal_handler_find(instance, {signalId});
            GObject.signal_handler_block(instance, originalHandler);
            const newHandler = instance.connect(signalId, handler);
            return () => {
                GObject.signal_handler_disconnect(instance, newHandler);
                GObject.signal_handler_unblock(instance, originalHandler);
            }
        });
    }

    /**
     * Undo all patches made so far. This function should usually only be called when the
     * extension is being deactivated.
     */
    static clear() {
        for (let cb of this._undoCallbacks) {
            cb();
        }
    }
}
