import Meta from "gi://Meta";
import Gio from "gi://Gio";
import ExtensionFeature from "../../utils/extensionFeature";
import {
    DisplayConfigState,
    LogicalMonitorTransform,
    setMonitorTransform,
} from "$src/features/screenRotateUtils/monitorDBusUtils.ts";
import {Widgets} from "$src/utils/ui/widgets.ts";
import {clamp, delay} from "$src/utils/utils.ts";
import St from "gi://St";
import Clutter from "gi://Clutter";
import Graphene from "gi://Graphene";
import {debugLog} from "$src/utils/logging.ts";
import Ref = Widgets.Ref;

type AccelerometerOrientation = 'normal' | 'right-up' | 'bottom-up' | 'left-up';


export class ScreenRotateUtilsFeature extends ExtensionFeature {
    private touchscreenSettings = new Gio.Settings({
        schema_id: 'org.gnome.settings-daemon.peripherals.touchscreen',
    });
    private readonly currentFloatingButton = new Ref<Widgets.Button>();

    constructor() {
        super();

        this.connectTo(global.backend.get_monitor_manager(), 'monitors-changed', (manager: Meta.MonitorManager) => {
            this.currentFloatingButton.value?.destroy();
        });

        const handlerId = Gio.DBus.system.signal_subscribe(
            null,
            'org.freedesktop.DBus.Properties',
            'PropertiesChanged',
            '/net/hadess/SensorProxy',
            null,
            Gio.DBusSignalFlags.NONE,
            (connection, sender_name, object_path, interface_name, signal_name, parameters) => {
                // FIXME: Apparently, this signal subscription no longer works after turning Gnome Shell's
                //  auto-rotate quicksetting on and off again.
                debugLog("SensorProxy PropertiesChanged changed: ", parameters?.deepUnpack())
                const orientation: AccelerometerOrientation = (parameters?.deepUnpack() as any)
                    ?.at(1)
                    ?.AccelerometerOrientation
                    ?.deepUnpack();
                if (orientation) {
                    this.onAccelerometerOrientationChanged(orientation);
                }
            });
        this.onCleanup(() => Gio.DBus.session.signal_unsubscribe(handlerId));
    }

    private get isOrientationLockEnabled(): boolean {
        return this.touchscreenSettings.get_boolean('orientation-lock');
    }

    private onAccelerometerOrientationChanged(orientation: AccelerometerOrientation) {
        if (this.isOrientationLockEnabled) {
            this.showFloatingRotateButton(orientation);
        }
    }

    private async showFloatingRotateButton(orientation: AccelerometerOrientation): Promise<void> {
        // TODO: don't show button if orientation == transform!

        const targetTransform = {
            'normal': 0,
            'left-up': 1,
            'bottom-up': 2,
            'right-up': 3,
        }[orientation] as LogicalMonitorTransform;

        const state = await DisplayConfigState.getCurrent();
        const monitorConnector = (state.builtinMonitor ?? state.monitors[0]).connector;
        const monitorIndex = global.backend.get_monitor_manager().get_monitor_for_connector(monitorConnector);
        const monitorGeometry = global.display.get_monitor_geometry(monitorIndex);
        const currentTransform = state.getLogicalMonitorFor(monitorConnector)!.transform;

        if (currentTransform === targetTransform) return;

        let [aX, aY] = computeAlignment(currentTransform, orientation);

        const sf = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scaleFactor;

        this.currentFloatingButton.value?.destroy();
        let btn: Widgets.Button | null = new Widgets.Button({
            ref: this.currentFloatingButton,
            styleClass: 'gnometouch-floating-screen-rotation-button',
            iconName: 'rotation-allowed-symbolic',
            width: 40 * sf,
            height: 40 * sf,
            x: monitorGeometry.x + clamp(monitorGeometry.width * aX, 40 * sf, monitorGeometry.width - 40 * sf - 40 * sf),
            y: monitorGeometry.y + clamp(monitorGeometry.height * aY, 40 * sf, monitorGeometry.height - 40 * sf - 40 * sf),
            connect: {
                'clicked': () => {
                    setMonitorTransform(targetTransform);
                    btn?.destroy();
                    btn = null;
                },
            },
            opacity: 128,
            scaleX: 0.5,
            scaleY: 0.5,
            pivotPoint: new Graphene.Point({x: 0.5, y: 0.5}),
        });

        global.stage.add_child(btn);

        // Animate in:
        // @ts-ignore
        btn.ease({
            opacity: 255,
            scaleX: 1,
            scaleY: 1,
            duration: 250, // ms
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        // Rotate/wiggle animation:
        for (let i = 0; i < 3; i++) {
            delay(700 + 2000 * i).then(() => {
                // @ts-ignore
                btn?.ease({
                    rotationAngleZ: btn.rotationAngleZ - 90,
                    duration: 550, // ms
                    mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,  // bounce/back?
                });
            });
        }

        // Animate out and destroy:
        delay(7000).then(() => {
            // @ts-ignore
            btn?.ease({
                scaleX: 0.5,
                scaleY: 0.5,
                opacity: 128,
                duration: 250, // ms
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onComplete: () => {
                    btn?.destroy()
                    btn = null;
                },
            });
        });
    }
}


/**
 * Computes the alignment tuple (x-alignment, y-alignment) to position an actor
 * on the bottom-right edge of the screen, considering the current transform and orientation.
 *
 * @param transform - The current display rotation (0-7).
 * @param orientation - The potential new screen orientation.
 * @returns A tuple [x-alignment, y-alignment] in the range [0, 1].
 */
function computeAlignment(transform: LogicalMonitorTransform, orientation: AccelerometerOrientation) {
    // Base alignment for each orientation assuming no rotation (transform = 0)
    const [baseX, baseY] = {
        normal: [1, 1],       // Bottom-right
        'left-up': [1, 0],    // Bottom-left
        'bottom-up': [0, 0],  // Top-left
        'right-up': [0, 1],   // Top-right
    }[orientation] || [1.0, 1.0];  // default value, just in case (even though this should never happen)

    // Adjust alignment based on the transform
    // Transformation maps original alignment based on display rotation or flipping
    return {
        0: [baseX, baseY],                // Normal
        1: [1.0 - baseY, baseX],          // 90°
        2: [1.0 - baseX, 1.0 - baseY],    // 180°
        3: [baseY, 1.0 - baseX],          // 270°
        4: [1.0 - baseX, baseY],          // Flipped
        5: [baseY, baseX],                // 90° Flipped
        6: [baseX, 1.0 - baseY],          // 180° Flipped
        7: [1.0 - baseY, 1.0 - baseX]     // 270° Flipped
    }[transform] || [baseX, baseY];  // default value, just in case (even though this should never happen)
}



