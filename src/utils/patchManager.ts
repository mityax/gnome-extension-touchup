import GObject from "gi://GObject";
//@ts-ignore
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import {UnknownClass} from "$src/utils/utils";
import {assert, logger, repr} from "$src/utils/logging";
import {Ref} from "$src/utils/ui/widgets";
import Clutter from "gi://Clutter";
import {Setting} from "$src/features/preferences/backend";


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

        const patch = this.registerPatch(func, debugName);
        patch.enable();
        return patch;
    }

    /**
     * Add a patch without automatically applying it. Otherwise, same
     * as [PatchManager.patch(...)]
     */
    registerPatch(func: PatchFunc, debugName?: string): Patch {
        DEBUG: assert(!this._isDestroyed, `The PatchManager ${this.debugName ? `"${this.debugName}" ` : ' '}has already been and cannot be used anymore.`);

        this._patches.push(new Patch({
            enable: func,
            debugName: this._generatePatchDebugName(debugName),
        }));
        return this._patches.at(-1)!;
    }

    /**
     * Automatically destroy any object with a [destroy] method when the [PatchManager] is
     * disabled or destroyed.
     */
    autoDestroy<T extends Clutter.Actor>(instance: T, debugName?: string) {
        DEBUG: assert(!this._isDestroyed, `The PatchManager ${this.debugName ? `"${this.debugName}" ` : ' '}has already been and cannot be used anymore.`);

        this.patch(() => {
            let ref = new Ref(instance);
            return () => ref.current?.destroy();
        }, debugName ?? `autoDestroy:${instance.constructor.name}`);
        return instance;
    }

    /**
     * Connect to a signal from any GObject/widget and automatically disconnect when the [PatchManager]
     * is disabled or destroyed.
     */
    connectTo<A extends any[], R>(instance: Connectable<A, R>, signal: string, handler: AnyFunc, debugName?: string): Patch {
        DEBUG: assert(!this._isDestroyed, `The PatchManager ${this.debugName ? `"${this.debugName}" ` : ' '}has already been and cannot be used anymore.`);

        const patch = this.patch(() => {
            const signalIds = [
                instance.connect(signal, handler)
            ];

            // If the given instance is a [Clutter.Actor], we drop this patch on actor destruction as it is
            // an error to disconnect from a signal on a destroyed actor (which we would do if we would disable
            // the patch):
            if (instance instanceof Clutter.Actor) {
                signalIds.push(instance.connect('destroy', () => this.drop(patch)));
            }

            return () => signalIds.forEach(s => instance.disconnect(s));
        }, debugName ?? `connectTo(${instance.constructor.name}:${signal})`);

        return patch;
    }

    /**
     * Set an objects property to a certain value and automatically reset it to the original value upon
     * [PatchManager] destruction or disabling.
     */
    setProperty<T extends object, P extends keyof T>(instance: T, prop: P, value: T[P], debugName?: string) {
        const patch = this.patch(() => {
            const originalValue = instance[prop];
            instance[prop] = value;

            // If the given instance is a [Clutter.Actor], we drop this patch on actor destruction as it is
            // an error to set a property on a destroyed actor (which we would do if we would disable the patch):
            let destroySignalId: number | null = null;
            if (instance instanceof Clutter.Actor) {
                destroySignalId = instance.connect('destroy', () => this.drop(patch));
            }

            return () => {
                instance[prop] = originalValue;

                if (destroySignalId !== null) {
                    (instance as GObject.Object).disconnect(destroySignalId);
                }
            };
        }, debugName ?? `setProperty(${instance.constructor?.name ?? repr(instance)}, '${prop.toString()}', ${repr(value)})`);

        return patch;
    }

    /**
     * Call the given [callback] with the given [setting]'s value and then whenever it is changed.
     */
    bindSetting<T>(setting: Setting<T>, callback: (v: T) => void) {
        callback(setting.get());
        return this.connectTo(setting, 'changed', () => callback(setting.get()));
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
                debugName: this._generatePatchDebugName(debugName),
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
    patchMethod<T extends UnknownClass>(prototype: T, methodName: string, method: (originalMethod: AnyFunc, ...args: any[]) => any, debugName?: string): Patch
    patchMethod<T extends UnknownClass>(prototype: T, methodName: string[], method: (originalMethod: AnyFunc, methodName: string, ...args: any[]) => any, debugName?: string): MultiPatch
    patchMethod<T extends UnknownClass>(prototype: T, methodName: string | string[], method: (originalMethod: AnyFunc, ...args: any[]) => any, debugName?: string): Patch | MultiPatch {
        DEBUG: assert(!this._isDestroyed, `The PatchManager ${this.debugName ? `"${this.debugName}" ` : ' '}has already been and cannot be used anymore.`);

        if (Array.isArray(methodName)) {
            return new MultiPatch({
                patches: methodName.map(m => this.patchMethod(
                    prototype, m,
                    function(this: UnknownClass, originalMethod, ...args) {
                        method.call(this, originalMethod, m, ...args);
                    },
                    `${debugName}#method(${prototype.constructor.name}:${m})`
                )),
                debugName: this._generatePatchDebugName(debugName),
            });
        } else {
            DEBUG: assert(typeof prototype[methodName] !== 'undefined', `Prototype has no such method: ${methodName}`);

            return this.patch(() => {
                this._injectionManager.overrideMethod(prototype, methodName, (orig: (...args: any) => any) => {
                    return function (this: UnknownClass, ...args: any[]) {
                        return method.call(this, orig.bind(this), ...args);
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
    appendToMethod<T extends UnknownClass>(prototype: T, methodName: string, method: AnyFunc, debugName?: string): Patch
    appendToMethod<T extends UnknownClass>(prototype: T, methodName: string[], method: AnyFunc, debugName?: string): MultiPatch
    appendToMethod<T extends UnknownClass>(prototype: T, methodName: string | string[], method: AnyFunc, debugName?: string): Patch | MultiPatch {
        DEBUG: assert(!this._isDestroyed, `The PatchManager ${this.debugName ? `"${this.debugName}" ` : ' '}has already been and cannot be used anymore.`);

        if (Array.isArray(methodName)) {
            return new MultiPatch({
                patches: methodName.map(m => this.appendToMethod(
                    prototype, m, method,
                    `${debugName}#append-to-method(${prototype.constructor.name}:${m})`
                )),
                debugName: this._generatePatchDebugName(debugName),
            });
        } else {
            DEBUG: assert(typeof prototype[methodName] !== 'undefined', `Prototype has no such method: ${methodName}`);

            return this.patchMethod(prototype, methodName, function(this: UnknownClass, orig, ...args) {
                const res = orig.call(this, ...args);
                method.call(this, ...args);
                return res;
            }, debugName);
        }
    }


    /**
     * Undo and delete all patches made so far.
     *
     * This function should only be called if the [PatchManager] is not going to be used anymore.
     */
    destroy() {
        if (this._isDestroyed) return;

        logger.debug(`Destroying PatchManager ${this.debugName ?? ''}`.trim());

        // Remove this PM from its parent:
        if (this._parent?._children.includes(this)) {
            this._parent?._children.splice(this._parent!._children.indexOf(this), 1);
        }

        // Destroy all descendent PMs, in reverse order - i.e. those descendents that where
        // created first will be destroyed last.
        //
        // Note: We use a while loop here to avoid destroying PMs again that have been destroyed
        // manually by the user during this process.
        while (this._children.length > 0) {
            this._children.pop()!.destroy();
        }

        // Undo all patches from this PM, in reverse order - i.e. those descendents that where
        // created first will be destroyed last, to create an "encapsulation" effect:
        // If patch A depends on another patch B that was made before it, patch B's `disable`
        // function might still need patch A, but patch A will not need patch B, since it was
        // already made before patch B even existed. Thus, we do it this way:
        //      create A -> create B -> disable B -> disable A
        // => All patches encapsulate those that are made after them.
        this._patches.toReversed().forEach(p => p.disable());
        this._patches = [];

        // This should be a noop, as all patches already restored their original method during
        // unpatching, but we'll still clear the [InjectionManager] here for completeness:
        this._injectionManager.clear();

        this._isDestroyed = true;
    }

    /**
     * Undo all patches made so far, but keep them in store for a potential call to [enable]
     */
    disable() {
        DEBUG: assert(!this._isDestroyed, {
            isWarning: true,
            message: `The PatchManager ${this.debugName ? `"${this.debugName}" ` : ' '}has already been destroyed, cannot disable anymore.`,
        });
        if (this._isDestroyed) return;

        logger.debug(`Disabling PatchManager ${this.debugName ?? ''}`.trim());

        this._children.toReversed().forEach(c => c.disable());
        this._patches.toReversed().forEach(p => p.disable());

        // This should be a noop, as all patches already restored their original method during
        // unpatching, but we'll still clear the [InjectionManager] here for completeness:
        this._injectionManager.clear();
    }

    /**
     * Enable all disabled patches.
     */
    enable() {
        DEBUG: assert(!this._isDestroyed, `The PatchManager ${this.debugName ? `"${this.debugName}" ` : ' '}has already been destroyed, cannot enable again.`);

        logger.debug(`Enabling PatchManager ${this.debugName ?? ''}`.trim());

        this._patches.forEach(p => p.enable());
        this._children.forEach(c => c.enable());
    }

    /**
     * Drops a patch from the list of patches maintained by this [PatchManager] without
     * disabling it. This is required in rare cases.
     *
     * Only use this when you are certain you know what you're doing.
     *
     * Returns the dropped patch or `null` if it is not managed by this PatchManager.
     */
    drop(patch: Patch): Patch | null {
        const idx = this._patches.findIndex(p => p === patch);

        DEBUG: assert(idx !== -1, `Could not find patch to remove: ${repr(patch)}`);

        if (idx === -1) return null;

        return this._patches.splice(idx, 1)[0];
    }

    /**
     * Create a descendent [PatchManager].
     *
     * This child [PatchManager] will react to any call to [destroy], [disable] and [enable]
     * on any parent [PatchManager] and will forward those calls to its own descendents, should
     * it be forked again. This allows for a nice, tree structure and a consistent interface
     * for managing patches.
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

    private _patchNameCounter = 0;
    private _generatePatchDebugName(debugName: string | undefined): string {
        return `${this.debugName}:${debugName ?? `#${this._patchNameCounter++}`}`;
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
        logger.debug(` - Disabling patch ${this.debugName}`);
        this._disableCallback?.call(this);
        this._isEnabled = false;
    }

    enable(force: boolean = false) {
        if (!force && this.isEnabled) return;
        logger.debug(` - Enabling patch ${this.debugName}`);
        this._disableCallback = this._enableCallback();
        this._isEnabled = true;
    }

    setEnabled(enabled: boolean, force: boolean = false) {
        if (enabled) {
            this.enable(force);
        } else {
            this.disable(force);
        }
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


