import Gio from "@girs/gio-2.0";

let gioSettings: Gio.Settings | null = null;

export function initSettings(settings: Gio.Settings) {
    gioSettings = settings;
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
}


export class EnumSetting<T> extends Setting<T> {
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
    get() {
        return gioSettings!.get_int(this.key)!;
    }
    set(value: number) {
        console.assert(value % 1 == 0);
        gioSettings!.set_int(this.key, value);
    }
}