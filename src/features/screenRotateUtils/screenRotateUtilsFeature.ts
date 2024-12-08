import Meta from "gi://Meta";
import Gio from "gi://Gio";
import ExtensionFeature from "../../utils/extensionFeature";
import {
    getCurrentDisplayState,
    LogicalMonitorOrientation,
    rotateTo
} from "$src/features/screenRotateUtils/dbusUtilities.ts";
import {Widgets} from "$src/utils/ui/widgets.ts";
import GLib from "gi://GLib";
import {clamp} from "$src/utils/utils.ts";
import {debugLog} from "$src/utils/logging.ts";

type AccelerometerOrientation = 'normal' | 'right-up' | 'bottom-up' | 'left-up';


export class ScreenRotateUtilsFeature extends ExtensionFeature {
    private touchscreenSettings = new Gio.Settings({
        schema_id: 'org.gnome.settings-daemon.peripherals.touchscreen',
    });

    constructor() {
        super();

        this.connectTo(global.backend.get_monitor_manager(), 'monitors-changed', (manager: Meta.MonitorManager) => {
            global.display.get_n_monitors();
        });

        const handlerId = Gio.DBus.system.signal_subscribe(
            null,
            'org.freedesktop.DBus.Properties',
            'PropertiesChanged',
            '/net/hadess/SensorProxy',
            null,
            Gio.DBusSignalFlags.NONE,
            (connection, sender_name, object_path, interface_name, signal_name, parameters) => {
                const orientation: AccelerometerOrientation = (parameters?.deepUnpack() as any)
                    ?.at(1)
                    ?.AccelerometerOrientation
                    ?.deepUnpack();
                this.onAccelerometerOrientationChanged(orientation);
            });
        this.onCleanup(() => Gio.DBus.session.signal_unsubscribe(handlerId));
    }

    private get isOrientationLockEnabled(): boolean {
        return this.touchscreenSettings.get_boolean('orientation-lock');
    }

    private onAccelerometerOrientationChanged(orientation: AccelerometerOrientation) {
        if (!this.isOrientationLockEnabled) {
            this.showFloatingRotateButton(orientation);
        }
    }

    private async showFloatingRotateButton(orientation: AccelerometerOrientation): Promise<void> {
        const state = await getCurrentDisplayState();
        const monitorConnector = (state.builtinMonitor ?? state.monitors[0]).connector;

        const monitorIndex = global.backend.get_monitor_manager().get_monitor_for_connector(monitorConnector);
        const monitorGeometry = global.display.get_monitor_geometry(monitorIndex);
        let [aX, aY] = computeAlignment(state.getLogicalMonitorFor(monitorConnector)!.transform, orientation);

        debugLog(`Showing floating rotate button on monitor ${monitorConnector}, alignment=(${aX}, ${aY})`);

        const button = new Widgets.Button({
            iconName: 'rotation-allowed-symbolic',
            styleClass: 'gnometouch-floating-screen-rotation-button',
            x: monitorGeometry.x + monitorGeometry.width * clamp(aX, 0.1, 0.9),
            y: monitorGeometry.y + monitorGeometry.height * clamp(aY, 0.1, 0.9),
            connect: {
                'clicked': () => {
                    rotateTo({
                        'normal': 0,
                        'right-up': 1,
                        'bottom-up': 2,
                        'left-up': 3,
                    }[orientation] as LogicalMonitorOrientation);
                }
            }
        });
        global.stage.add_child(button);
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 5 * 1000, () => {
            global.stage.remove_child(button);
            return GLib.SOURCE_REMOVE;
        })
    }
}


/**
 * Computes the alignment tuple (x-alignment, y-alignment) to position an actor
 * on the bottom-right edge of the screen, considering the current transform and orientation.
 *
 * @param {LogicalMonitorOrientation} transform - The current display rotation (0-7).
 * @param {AccelerometerOrientation} orientation - The potential new screen orientation.
 * @returns {[number, number]} A tuple [x-alignment, y-alignment] in the range [0, 1].
 */
function computeAlignment(transform: LogicalMonitorOrientation, orientation: AccelerometerOrientation) {
    // Base alignments for each orientation assuming no rotation (transform = 0)
    const orientationAlignment = {
        normal: [1.0, 1.0], // Bottom-right
        'right-up': [1.0, 0.0], // Top-right
        'bottom-up': [0.0, 0.0], // Top-left
        'left-up': [0.0, 1.0], // Bottom-left
    };

    // Get the base alignment for the current orientation
    const [baseX, baseY] = orientationAlignment[orientation] || [1.0, 1.0];

    // Adjust alignment based on the transform
    // Transformation maps original alignment based on display rotation or flipping
    switch (transform) {
        case 0: // Normal
            return [baseX, baseY];
        case 1: // 90°
            return [baseY, 1.0 - baseX];
        case 2: // 180°
            return [1.0 - baseX, 1.0 - baseY];
        case 3: // 270°
            return [1.0 - baseY, baseX];
        case 4: // Flipped
            return [1.0 - baseX, baseY];
        case 5: // 90° Flipped
            return [baseY, baseX];
        case 6: // 180° Flipped
            return [baseX, 1.0 - baseY];
        case 7: // 270° Flipped
            return [1.0 - baseY, 1.0 - baseX];
        default:
            throw new Error(`Invalid transform value: ${transform}`);
    }
}



