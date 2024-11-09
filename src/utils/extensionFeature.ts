import GObject from "@girs/gobject-2.0";
//@ts-ignore
import {InjectionManager} from "@girs/gnome-shell/extensions/extension";
import {UnknownClass} from "./utils";


type AnyFunc = (...args: any[]) => any;
type Connectable = {connect: (s: string, h: AnyFunc) => any, disconnect: (id: number) => any};

/**
 * Base class for each feature of this extension.
 *
 * It contains utilities to easily "patch" in Gnome Shell globally or deal with
 * signal handlers and automatically revert that once this feature (or the
 * extension) is disabled.
 */
export default abstract class ExtensionFeature {
    private static injectionManager = new InjectionManager();
    private cleanupJobs: (() => void)[] = [];

    protected constructor() {}

    destroy() {
        for (let job of this.cleanupJobs) {
            job();
        }
    }

    /**
     * Register a callback to be called when this class is destroyed.
     */
    protected onCleanup(cb: () => void) {
        this.cleanupJobs.push(cb);
    }

    /**
     * Connect to a signal from any GObject/widget and automatically disconnect once this
     * class is destroyed.
     */
    protected connectTo(instance: Connectable, signal: string, handler: AnyFunc) {
        const signalId = instance.connect(signal, handler);
        this.onCleanup(() => instance.disconnect(signalId));
    }

    /**
     * Overwrite a signal handler for a specific instance.
     *
     * @param instance The instance to patch the signal handler on
     * @param signalId The signal to connect to
     * @param handler The new handler that is called in place of the original handler
     */
    protected patchSignalHandler(instance: GObject.Object, signalId: string | string[], handler: AnyFunc): void {
        if (!Array.isArray(signalId)) {
            signalId = [signalId];
        }

        for (let sig of signalId) {
            //@ts-ignore
            const originalHandler = GObject.signal_handler_find(instance, {sig});
            GObject.signal_handler_block(instance, originalHandler);
            const newHandler = instance.connect(sig, handler);
            this.onCleanup(() => {
                GObject.signal_handler_disconnect(instance, newHandler);
                GObject.signal_handler_unblock(instance, originalHandler);
            })
        }
    }

    /**
     * Overwrite a method for a specific class.
     *
     * @param prototype The class to overwrite a method of
     * @param methodName The name of the method to overwrite
     * @param method The method to be used in place of the original method. Receives the original function
     *               followed by any arguments on call as argument. This method should be written in `function`
     *               syntax to retrieve the correct value for `this`.
     */
    protected patchMethod(prototype: object, methodName: string | string[], method: (originalMethod: AnyFunc, ...args: any[]) => any) {
        if (!Array.isArray(methodName)) {
            methodName = [methodName];
        }

        for (let m of methodName) {
            ExtensionFeature.injectionManager.overrideMethod(prototype, m, (orig: (...args: any) => any) => {
                return function (this: UnknownClass, ...args: any[]) {
                    method.call(this, orig.bind(this), ...args);
                }
            });
            this.onCleanup(() => ExtensionFeature.injectionManager.restoreMethod(prototype, m));
        }
    }

    /**
     * Call the given [method] whenever the method called [methodName] of
     * any instance of the given [prototype] is called. The given [method]
     * is called **after** the original method has been called successfully.
     *
     * @param prototype The class to append to a method of
     * @param methodName The name of the method to append to
     * @param method The method to be called after the original method. Receives any arguments
     *               that the original method received on call. This method should be written in
     *               `function` syntax to retrieve the correct value for `this`.
     */
    protected appendToMethod(prototype: object, methodName: string | string[], method: (...args: any[]) => any) {
        if (!Array.isArray(methodName)) {
            methodName = [methodName];
        }

        this.patchMethod(prototype, methodName, function(this: UnknownClass, orig, ...args) {
            orig.call(this, ...args);
            method.call(this, ...args);
        })
    }
}
