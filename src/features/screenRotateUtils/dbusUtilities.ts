import Gio from "gi://Gio";
import GLib from "gi://GLib";


export const Methods = Object.freeze({
    verify: 0,
    temporary: 1,
    persistent: 2,
});

export function callDbusMethod(
    method: string,
    handler: Gio.AsyncReadyCallback<Gio.DBusConnection> | null,
    params: GLib.Variant | null = null
): void {
    if (handler !== null && handler !== undefined) {
        Gio.DBus.session.call(
            'org.gnome.Mutter.DisplayConfig',
            '/org/gnome/Mutter/DisplayConfig',
            'org.gnome.Mutter.DisplayConfig',
            method,
            params,
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null,
            handler
        );
    } else {
        Gio.DBus.session.call(
            'org.gnome.Mutter.DisplayConfig',
            '/org/gnome/Mutter/DisplayConfig',
            'org.gnome.Mutter.DisplayConfig',
            method,
            params,
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null
        );
    }
}

export function getCurrentDisplayState(): Promise<DisplayConfigState> {
    return new Promise((resolve, reject) => {
        callDbusMethod('GetCurrentState', (conn, res) => {
            try {
                const reply = conn?.call_finish(res)!;
                const configState = new DisplayConfigState(reply);
                resolve(configState);
            } catch (err) {
                reject(err);
            }
        });
    });
}

export function rotateTo(transform: LogicalMonitorOrientation): void {
    getCurrentDisplayState()
        .then((state) => {
            let targetMonitor = state.builtinMonitor;
            if (!targetMonitor) {
                targetMonitor = state.monitors[0];
            }
            const logicalMonitor = state.getLogicalMonitorFor(targetMonitor.connector);
            if (logicalMonitor) {
                logicalMonitor.transform = transform as any;
                const variant = state.packToApply(Methods.temporary);
                callDbusMethod('ApplyMonitorsConfig', null, variant);
            }
        })
        .catch((err) => {
            console.error(err);
        });
}

export class Monitor {
    connector: string;
    currentModeId: number | null = null;
    isUnderscanning: boolean = false;
    isBuiltin: boolean = false;

    constructor(variant: GLib.Variant) {
        const unpacked = variant.unpack() as any[];
        this.connector = unpacked[0].unpack()[0].unpack();

        const modes = unpacked[1].unpack();
        for (const modeVariant of modes) {
            const mode = modeVariant.unpack();
            const id = mode[0].unpack();
            const modeProps = mode[6].unpack();
            if ('is-current' in modeProps) {
                const isCurrent = modeProps['is-current'].unpack().get_boolean();
                if (isCurrent) {
                    this.currentModeId = id;
                    break;
                }
            }
        }

        const props = unpacked[2].unpack();
        if ('is-underscanning' in props) {
            this.isUnderscanning = props['is-underscanning'].unpack().get_boolean();
        }
        if ('is-builtin' in props) {
            this.isBuiltin = props['is-builtin'].unpack().get_boolean();
        }
    }
}


/**
 * Possible transform values:
 *   - 0: normal
 *   - 1: 90°
 *   - 2: 180°
 *   - 3: 270°
 *   - 4: flipped
 *   - 5: 90° flipped
 *   - 6: 180° flipped
 *   - 7: 270° flipped
 */
export type LogicalMonitorOrientation = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;


export class LogicalMonitor {
    x: number;
    y: number;
    scale: number;
    transform: LogicalMonitorOrientation;
    primary: boolean;
    monitors: [string, string, string, string][];
    properties: Record<string, any>;

    constructor(variant: GLib.Variant) {
        const unpacked = variant.unpack() as any[];
        this.x = unpacked[0].unpack();
        this.y = unpacked[1].unpack();
        this.scale = unpacked[2].unpack();
        this.transform = unpacked[3].unpack();
        this.primary = unpacked[4].unpack();
        this.monitors = unpacked[5].deep_unpack();
        this.properties = unpacked[6].unpack();

        for (const key in this.properties) {
            this.properties[key] = this.properties[key].unpack().unpack();
        }
    }
}

export class DisplayConfigState {
    serial: number;
    monitors: Monitor[] = [];
    logicalMonitors: LogicalMonitor[] = [];
    properties: Record<string, any>;

    constructor(result: GLib.Variant) {
        const unpacked = result.unpack() as any[];
        this.serial = unpacked[0].unpack();

        const monitorVariants = unpacked[1].unpack();
        for (const monitorPacked of monitorVariants) {
            this.monitors.push(new Monitor(monitorPacked));
        }

        const logicalMonitorVariants = unpacked[2].unpack();
        for (const logicalMonitorPacked of logicalMonitorVariants) {
            this.logicalMonitors.push(new LogicalMonitor(logicalMonitorPacked));
        }

        this.properties = unpacked[3].unpack();
        for (const key in this.properties) {
            this.properties[key] = this.properties[key].unpack().unpack();
        }
    }

    get builtinMonitor(): Monitor | null {
        return this.monitors.find((monitor) => monitor.isBuiltin) || null;
    }

    getMonitor(connector: string): Monitor | null {
        return this.monitors.find((monitor) => monitor.connector === connector) || null;
    }

    getLogicalMonitorFor(connector: string): LogicalMonitor | null {
        return this.logicalMonitors.find((logMonitor) =>
            logMonitor.monitors.some((lmMonitor) => connector === lmMonitor[0])
        ) || null;
    }

    packToApply(method: number): GLib.Variant {
        const packing = [this.serial, method, [], {}];
        const logicalMonitors = packing[2] as any[];
        const properties: Record<string, any> = packing[3];

        this.logicalMonitors.forEach((logicalMonitor) => {
            const lmonitorPack = [
                logicalMonitor.x,
                logicalMonitor.y,
                logicalMonitor.scale,
                logicalMonitor.transform,
                logicalMonitor.primary,
                [],
            ];
            const monitors = lmonitorPack[5] as any[];
            for (const logMonitor of logicalMonitor.monitors) {
                const connector = logMonitor[0];
                const monitor = this.getMonitor(connector);
                if (monitor) {
                    monitors.push([
                        connector,
                        monitor.currentModeId,
                        {
                            enable_underscanning: new GLib.Variant('b', monitor.isUnderscanning),
                        },
                    ]);
                }
            }
            logicalMonitors.push(lmonitorPack);
        });

        if ('layout-mode' in this.properties) {
            properties['layout-mode'] = new GLib.Variant('b', this.properties['layout-mode']);
        }

        return new GLib.Variant('(uua(iiduba(ssa{sv}))a{sv})', packing);
    }
}
