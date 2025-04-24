import Gio from "gi://Gio";
import GObject from "gi://GObject";
import Gtk from "gi://Gtk";
import {clamp} from "$src/utils/utils";
import {assert} from "$src/utils/logging";

let gioSettings: Gio.Settings | null = null;


/**
 * Initialize the settings using the given [Gio.Settings] instance.
 *
 * Do not forget to call [uninitSettings] when settings are no longer needed to
 * free the global reference kept to the [Gio.Settings] instance.
 */
export function initSettings(settings: Gio.Settings) {
    gioSettings = settings;
}

export function uninitSettings() {
    gioSettings = null;
}

export abstract class Setting<T> {
    readonly key: string;
    readonly defaultValue: T;

    constructor(key: string, defaultValue: T) {
        this.key = key;
        this.defaultValue = defaultValue;
    }

    abstract get(): T;
    abstract set(value: T): void;

    bind(instance: GObject.Object | Gtk.Widget, property: string, flags: Gio.SettingsBindFlags = Gio.SettingsBindFlags.DEFAULT) {
        gioSettings!.bind(this.key, instance as GObject.Object, property, flags);
    }

    connect(signal: 'changed' | string, handler: (newValue: T) => any): number {
        console.assert(signal === 'changed', "The only supported signal for now is `changed`");
        return gioSettings!.connect(`${signal}::${this.key}`, () => handler(this.get()));
    }

    disconnect(signalId: number) {
        gioSettings!.disconnect(signalId);
    }
}


export class EnumSetting<T extends string> extends Setting<T> {
    get(): T {
        return gioSettings!.get_string(this.key)! as T;
    }
    set(value: T) {
        gioSettings!.set_string(this.key, value as string);
    }
}

export class BoolSetting extends Setting<boolean> {
    get() {
        return gioSettings!.get_boolean(this.key)!;
    }
    set(value: boolean) {
        gioSettings!.set_boolean(this.key, value);
    }
}

export class IntSetting extends Setting<number> {
    readonly min: number;
    readonly max: number;

    constructor(key: string, defaultValue: number, min: number, max: number) {
        assert(min <= max);
        super(key, defaultValue);
        this.min = min;
        this.max = max;
    }

    get() {
        return gioSettings!.get_int(this.key)!;
    }

    set(value: number) {
        assert(value % 1 == 0);
        assert(value >= this.min);
        assert(value <= this.max);
        gioSettings!.set_int(this.key, clamp(value, this.min, this.max));
    }
}

export class StringSetting extends Setting<string> {
    get(): string {
        return gioSettings!.get_string(this.key);
    }
    set(value: string): void {
        gioSettings!.set_string(this.key, value);
    }
}

export class StringListSetting<T extends string> extends Setting<T[]>{
    get(): T[] {
        let res: any;
        gioSettings!.get_mapped(this.key, value => {
            if (value === null) {
                res = [];
            } else {
                try {
                    res = JSON.parse(value.get_string()[0]);
                    this._validateValue(res);
                } catch (e) {
                    return false;
                }
            }
            return true;
        });
        return res;
    }

    set(value: T[]) {
        this._validateValue(value);
        gioSettings!.set_string(this.key, JSON.stringify(value));
    }

    private _validateValue(value: any) {
        if (!Array.isArray(value) || (value as any[]).some(v => typeof v !== 'string')) {
            throw Error(`Invalid value for StringListSetting (not an array of strings): ${value}`);
        }
    }
}


/**
 * Returns the value type of a Setting, i.e. SettingsType<BoolSetting> => bool
 */
export type SettingsType<S> = S extends Setting<infer T> ? T : never;

