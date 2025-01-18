import GObject from "gi://GObject";
//@ts-ignore
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import {UnknownClass} from "$src/utils/utils";
import {assert, debugLog} from "$src/utils/logging";
import {Widgets} from "$src/utils/ui/widgets.ts";
import Clutter from "gi://Clutter";
import Ref = Widgets.Ref;


type PatchFunc = () => (() => any);

type AnyFunc = (...args: any[]) => any;
type Connectable<A extends any[], R> = {connect: (s: string, h: (...args: A) => R) => any, disconnect: (id: number) => any};



/**
 * Class to manage global changes ("patches") that need to be undone
 * when the extension is disabled.
 */
export class PatchManager {
    readonly debugName?: string;
    private _parent?: PatchManager;
    private _children: PatchManager[] = [];
    private readonly _injectionManager = new InjectionManager();
    private _patches: Patch[] = [];
    private _isDestroyed = false;

    constructor(debugName?: string) {
        this.debugName = debugName;
    }

    /**
     * Apply a patch. The callback peforming the patch is called immediately and must
     * return another function to undo the patch again.
    */
    patch(func: PatchFunc, debugName?: string): Patch {
        DEBUG: assert(!this._isDestroyed, `The PatchManager ${this.debugName ? `"${this.debugName}" ` : ' '}has already been and cannot be used anymore.`);

        this._patches.push(new Patch({
            enable: func,
            debugName,
        }));
        this._patches.at(-1)!.enable();
        return this._patches.at(-1)!;
    }

    /**
     * Add a patch without automatically applying it. Otherwise, same
     * as [PatchManager.patch(...)]
     */
    registerPatch(func: PatchFunc, debugName?: string): Patch {
        DEBUG: assert(!this._isDestroyed, `The PatchManager ${this.debugName ? `"${this.debugName}" ` : ' '}has already been and cannot be used anymore.`);

        this._patches.push(new Patch({
            enable: func,
            debugName,
        }));
        return this._patches.at(-1)!;
    }

    /**
     * Automatically destroy any object with a [destroy] method when the [PatchManager] is
     * disabled or destroyed.
     */
    autoDestroy<T extends Clutter.Actor>(instance: T) {
        this.patch(() => {
            let ref = new Ref(instance);
            return () => ref.current?.destroy();
        });
        return instance;
    }

    /**
     * Connect to a signal from any GObject/widget and automatically disconnect when the [PatchManager]
     * is disabled or destroyed.
     */
    connectTo<A extends any[], R>(instance: Connectable<A, R>, signal: string, handler: AnyFunc, debugName?: string) {
        this.patch(() => {
            const signalId = instance.connect(signal, handler);
            return () => instance.disconnect(signalId);
        }, debugName ?? `connectTo(${instance.constructor.name}:${signal})`);
    }

    /**
     * Overwrite a signal handler for a specific instance.
     *
     * @param instance The instance to patch the signal handler on
     * @param signalId The signal to connect to
     * @param handler The new handler that is called in place of the original handler
     * @param debugName A name for this patch for debug log messages
     */
    patchSignalHandler(instance: GObject.Object, signalId: string, handler: AnyFunc, debugName?: string): Patch
    patchSignalHandler(instance: GObject.Object, signalId: string[], handler: AnyFunc, debugName?: string): MultiPatch
    patchSignalHandler(instance: GObject.Object, signalId: string | string[], handler: AnyFunc, debugName?: string): Patch | MultiPatch {
        DEBUG: assert(!this._isDestroyed, `The PatchManager ${this.debugName ? `"${this.debugName}" ` : ' '}has already been and cannot be used anymore.`);

        if (Array.isArray(signalId)) {
            return new MultiPatch({
                patches: signalId.map(s => this.patchSignalHandler(
                    instance, s, handler,
                    `${debugName}#signal(${instance.constructor.name}:${signalId})`
                )),
                debugName,
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
            }, debugName);
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
     * @param debugName A name for this patch for debug log messages
     */
    patchMethod(prototype: object, methodName: string, method: (originalMethod: AnyFunc, ...args: any[]) => any, debugName?: string): Patch
    patchMethod(prototype: object, methodName: string[], method: (originalMethod: AnyFunc, ...args: any[]) => any, debugName?: string): MultiPatch
    patchMethod(prototype: object, methodName: string | string[], method: (originalMethod: AnyFunc, ...args: any[]) => any, debugName?: string): Patch | MultiPatch {
        DEBUG: assert(!this._isDestroyed, `The PatchManager ${this.debugName ? `"${this.debugName}" ` : ' '}has already been and cannot be used anymore.`);

        if (Array.isArray(methodName)) {
            return new MultiPatch({
                patches: methodName.map(m => this.patchMethod(
                    prototype, m, method,
                    `${debugName}#method(${prototype.constructor.name}:${methodName})`
                )),
                debugName,
            });
        } else {
            return this.patch(() => {
                this._injectionManager.overrideMethod(prototype, methodName, (orig: (...args: any) => any) => {
                    return function (this: UnknownClass, ...args: any[]) {
                        method.call(this, orig.bind(this), ...args);
                    }
                });
                return () => this._injectionManager.restoreMethod(prototype, methodName);
            }, debugName);
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
     * @param debugName A name for this patch for debug log messages
     */
    appendToMethod(prototype: object, methodName: string, method: AnyFunc, debugName?: string): Patch
    appendToMethod(prototype: object, methodName: string[], method: AnyFunc, debugName?: string): MultiPatch
    appendToMethod(prototype: object, methodName: string | string[], method: AnyFunc, debugName?: string): Patch | MultiPatch {
        DEBUG: assert(!this._isDestroyed, `The PatchManager ${this.debugName ? `"${this.debugName}" ` : ' '}has already been and cannot be used anymore.`);

        if (Array.isArray(methodName)) {
            return new MultiPatch({
                patches: methodName.map(m => this.appendToMethod(
                    prototype, m, method,
                    `${debugName}#append-to-method(${prototype.constructor.name}:${methodName})`
                )),
                debugName,
            });
        } else {
            return this.patchMethod(prototype, methodName, function(this: UnknownClass, orig, ...args) {
                orig.call(this, ...args);
                method.call(this, ...args);
            }, debugName);
        }
    }


    /**
     * Undo and delete all patches made so far.
     *
     * This function should only be called if the [PatchManager] is not going to be used anymore.
     */
    destroy() {
        DEBUG: assert(!this._isDestroyed, `The PatchManager ${this.debugName ? `"${this.debugName}" ` : ' '}has already been destroyed, cannot destroy again.`);

        debugLog(`Destroying PatchManager ${this.debugName ?? ''}`.trim());

        this._children.forEach(c => c.destroy());
        this._patches.forEach(p => p.disable());

        this._parent!._children = this._parent!._children.filter(c => c != this);
        this._children = [];
        this._patches = [];
        DEBUG: this._isDestroyed = true;
    }

    /**
     * Undo all patches made so far, but keep them in store for a potential call to [enable]
     */
    disable() {
        DEBUG: assert(!this._isDestroyed, `The PatchManager ${this.debugName ? `"${this.debugName}" ` : ' '}has already been destroyed, cannot disable anymore.`);

        debugLog(`Disabling PatchManager ${this.debugName ?? ''}`.trim());

        this._children.forEach(c => c.disable());
        this._patches.forEach(p => p.disable());
    }

    /**
     * Enable all disabled patches.
     */
    enable() {
        DEBUG: assert(!this._isDestroyed, `The PatchManager ${this.debugName ? `"${this.debugName}" ` : ' '}has already been destroyed, cannot enable again.`);

        debugLog(`Enabling PatchManager ${this.debugName ?? ''}`.trim());

        this._patches.forEach(p => p.enable());
        this._children.forEach(c => c.enable());
    }

    /**
     * Create a descendent [PatchManager].
     *
     * This child [PatchManager] will react to any call to [clear], [disable] and [enable]
     * on any parent [PatchManager] and will forward those calls to its own descendents, should
     * it be forked again. This allows for a nice, tree-like structure and a consistent interface
     * managing patches.
     * @param debugName An optional label used for debug log messages
     */
    fork(debugName?: string): PatchManager {
        const instance = new PatchManager(
             this.debugName
                 ? `${this.debugName}/${debugName ?? this._children.length + 1}`
                 : debugName
        );
        instance._parent = this;
        this._children.push(instance);
        return instance;
    }
}


export class Patch {
    readonly debugName: string | null;
    private readonly _enableCallback: (...args: any) => any;
    private _disableCallback?: (...args: any) => any;
    private _isEnabled: boolean = false;

    constructor(props: {enable: PatchFunc, debugName?: string | null}) {
        this._enableCallback = props.enable;
        this.debugName = props.debugName ?? null;
    }

    disable(force: boolean = false) {
        if (!force && !this.isEnabled) return;
        debugLog(` - Undoing patch ${this.debugName}`);
        this._disableCallback?.call(this);
        this._isEnabled = false;
    }

    enable(force: boolean = false) {
        if (!force && this.isEnabled) return;
        debugLog(` - Applying patch ${this.debugName}`);
        this._disableCallback = this._enableCallback();
        this._isEnabled = true;
    }

    get isEnabled(): boolean {
        return this._isEnabled;
    }
}


export class MultiPatch extends Patch {
    private readonly _patches: Patch[];

    constructor(props: {patches: Patch[], debugName?: string | null}) {
        super({
            enable: () => {
                props.patches.forEach(p => p.enable());
                return () => props.patches.forEach(p => p.disable());
            },
            debugName: props.debugName,
        });
        this._patches = props.patches;
    }

    get isEnabled(): boolean {
        return this._patches.every(p => p.isEnabled);
    }

    enable(force: boolean = false) {
        this._patches.forEach(p => p.enable(force));
    }

    disable(force: boolean = false) {
        this._patches.forEach(p => p.disable(force));
    }
}


