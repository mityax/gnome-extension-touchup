import GObject from "@girs/gobject-2.0";
//@ts-ignore
import {InjectionManager} from '@girs/gnome-shell/extensions/extension';
import {log, UnknownClass} from "$src/utils/utils";


type NoArgsFunc = () => (() => any);
type AnyFunc = (...args: any) => ((...args: any) => any);
type PatchOptions = {scope?: string | null, supportsReapply?: boolean, debugName?: string | null};


/**
 * Class to manage global changes ("patches") that need to be undone
 * when the extension is disabled.
 */
export class PatchManager {
    private static _injectionManager = new InjectionManager();
    private static _patches: Patch[] = [];

    /**
     * Apply a patch. The callback peforming the patch is called immediately and must
     * return another function to undo the patch again.
    */
    static patch(func: NoArgsFunc, opts?: PatchOptions): Patch {
        this._patches.push(new Patch({
            func,
            ...opts,
        }));
        this._patches.at(-1)!.reapply();
        return this._patches.at(-1)!;
    }

    /**
     * Add a patch without automatically applying it. Otherwise, same
     * as [PatchManager.patch(...)]
     */
    static patchLater(func: NoArgsFunc, opts?: PatchOptions): Patch {
        this._patches.push(new Patch({
            func,
            ...opts,
        }));
        return this._patches.at(-1)!;
    }

    /**
     * Overwrite a signal handler for a specific instance.
     *
     * @param instance The instance to patch the signal handler on
     * @param signalId The signal to connect to
     * @param handler The new handler that is called in place of the original handler
     * @param opts Additional options for the patch
     */
    static patchSignalHandler(instance: GObject.Object, signalId: string, handler: AnyFunc, opts?: PatchOptions): Patch
    static patchSignalHandler(instance: GObject.Object, signalId: string[], handler: AnyFunc, opts?: PatchOptions): MultiPatch
    static patchSignalHandler(instance: GObject.Object, signalId: string | string[], handler: AnyFunc, opts?: PatchOptions): Patch | MultiPatch {
        if (Array.isArray(signalId)) {
            return new MultiPatch({
                patches: signalId.map(s => this.patchSignalHandler(instance, s, handler, opts)),
                ...opts,
            });
        } else {
            return this.patch(() => {
                //@ts-ignore
                const originalHandler = GObject.signal_handler_find(instance, {signalId});
                GObject.signal_handler_block(instance, originalHandler);
                const newHandler = instance.connect(signalId, handler);
                return () => {
                    GObject.signal_handler_disconnect(instance, newHandler);
                    GObject.signal_handler_unblock(instance, originalHandler);
                }
            }, opts);
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
    static patchMethod(prototype: object, methodName: string, method: (originalMethod: AnyFunc, ...args: any[]) => any, opts?: PatchOptions): Patch
    static patchMethod(prototype: object, methodName: string[], method: (originalMethod: AnyFunc, ...args: any[]) => any, opts?: PatchOptions): MultiPatch
    static patchMethod(prototype: object, methodName: string | string[], method: (originalMethod: AnyFunc, ...args: any[]) => any, opts?: PatchOptions): Patch | MultiPatch {
        if (Array.isArray(methodName)) {
            return new MultiPatch({
                patches: methodName.map(m => this.patchMethod(prototype, m, method, opts)),
                ...opts,
            });
        } else {
            return this.patch(() => {
                this._injectionManager.overrideMethod(prototype, methodName, (orig: (...args: any) => any) => {
                    return function (this: UnknownClass, ...args: any[]) {
                        method.call(this, orig.bind(this), ...args);
                    }
                });
                return () => this._injectionManager.restoreMethod(prototype, methodName);
            }, opts);
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
    static appendToMethod(prototype: object, methodName: string, method: (...args: any[]) => any, opts?: PatchOptions): Patch
    static appendToMethod(prototype: object, methodName: string[], method: (...args: any[]) => any, opts?: PatchOptions): MultiPatch
    static appendToMethod(prototype: object, methodName: string | string[], method: (...args: any[]) => any, opts?: PatchOptions): Patch | MultiPatch {
        if (Array.isArray(methodName)) {
            return new MultiPatch({
                patches: methodName.map(m => this.appendToMethod(prototype, m, method, opts)),
                ...opts,
            });
        } else {
            return this.patchMethod(prototype, methodName, function(this: UnknownClass, orig, ...args) {
                orig.call(this, ...args);
                method.call(this, ...args);
            }, opts);
        }
    }

    /**
     * Undo all patches made so far. This function should usually only be called when the
     * extension is being deactivated.
     *
     * @param scope If given, only patches belonging to the given scope are cleared.
     */
    static clear(scope?: string | null) {
        for (let patch of this._patches) {
            if (!scope || scope === patch.scope) {
                patch.undo();
            }
        }

        this._patches = this._patches.filter(value => !scope || scope === value.scope);
    }

    static disable(scope?: string | null) {
        for (let patch of this._patches) {
            if (patch.isApplied) {
                if (!scope || scope === patch.scope) {
                    patch.undo();
                }
            }
        }
    }

    static enable(scope?: string | null) {
        for (let patch of this._patches) {
            if (!patch.supportsReapply) {
                throw `Patch (debugName="${patch.debugName}", scope="${patch.scope}") cannot be reapplied.`
            }
            if (!patch.isApplied) {
                if (!scope || scope === patch.scope) {
                    patch.reapply();
                }
            }
        }
    }
}


export class Patch {
    readonly debugName: string | null;
    readonly scope: string | null;
    private readonly func: (...args: any) => any;
    private undoFunc?: (...args: any) => any;
    private _applied: boolean = false;
    readonly supportsReapply: boolean;

    constructor({scope, func, undoFunc, supportsReapply = true, debugName}: {scope?: string | null, func: (...args: any) => any, undoFunc?: (...args: any) => any, supportsReapply?: boolean, debugName?: string | null}) {
        this.func = func;
        this.undoFunc = undoFunc;
        this.scope = scope ?? null;
        this.debugName = debugName ?? null;
        this.supportsReapply = supportsReapply || true;
    }

    undo(force: boolean = false) {
        if (!force && !this.isApplied) return;
        log(`Undoing patch ${this.debugName} (scope: ${this.scope})`);
        this.undoFunc?.call(this);
        this._applied = false;
    }

    reapply(force: boolean = false) {
        if (!force && this.isApplied) return;
        log(`Applying patch ${this.debugName} (scope: ${this.scope})`);
        this.undoFunc = this.func();
        this._applied = true;
    }

    get isApplied(): boolean {
        return this._applied;
    }
}


export class MultiPatch extends Patch {
    private readonly patches: Patch[];

    constructor({patches, scope, debugName}: {patches: Patch[], scope?: string | null, debugName?: string | null}) {
        super({
            func: () => patches.forEach(p => p.reapply()),
            undoFunc: () => patches.forEach(p => p.undo()),
            supportsReapply: patches.every(p => p.supportsReapply),
            debugName: debugName,
            scope: scope,
        });
        this.patches = patches;
    }

    get isApplied(): boolean {
        return this.patches.every(p => p.isApplied);
    }

    reapply(force: boolean = false) {
        this.patches.forEach(p => p.reapply(force));
    }

    undo(force: boolean = false) {
        this.patches.forEach(p => p.undo(force));
    }
}


