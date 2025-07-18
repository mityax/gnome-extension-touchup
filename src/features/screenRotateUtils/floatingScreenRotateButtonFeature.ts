import Meta from "gi://Meta";
import Gio from "gi://Gio";
import ExtensionFeature from "../../utils/extensionFeature";
import {DisplayConfigState, LogicalMonitorTransform, setMonitorTransform,} from "$src/utils/monitorDBusUtils";
import * as Widgets from "$src/utils/ui/widgets";
import {clamp} from "$src/utils/utils";
import St from "gi://St";
import Clutter from "gi://Clutter";
import Graphene from "gi://Graphene";
import {debugLog} from "$src/utils/logging";
import Mtk from "gi://Mtk";
import {Delay} from "$src/utils/delay";
import {PatchManager} from "$src/utils/patchManager";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import Ref = Widgets.Ref;

type AccelerometerOrientation = 'normal' | 'right-up' | 'bottom-up' | 'left-up';


export class FloatingScreenRotateButtonFeature extends ExtensionFeature {
    private touchscreenSettings = new Gio.Settings({
        schema_id: 'org.gnome.settings-daemon.peripherals.touchscreen',
    });
    private readonly floatingButton = new Ref<Widgets.Button>();

    constructor(pm: PatchManager) {
        super(pm);

        this.pm.connectTo(global.backend.get_monitor_manager(), 'monitors-changed', (manager: Meta.MonitorManager) => {
            this.removeFloatingRotateButton({animate: false});
        });

        this.pm.patch(() => {
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
                        this.onAccelerometerOrientationChanged(orientation).then();
                    }
                });
            return () => Gio.DBus.system.signal_unsubscribe(handlerId);
        });
    }

    private get isOrientationLockEnabled(): boolean {
        return this.touchscreenSettings.get_boolean('orientation-lock');
    }

    private async onAccelerometerOrientationChanged(orientation: AccelerometerOrientation) {
        this.removeFloatingRotateButton({animate: true});

        if (this.isOrientationLockEnabled) {
            const targetTransform = {
                'normal': 0,
                'left-up': 1,
                'bottom-up': 2,
                'right-up': 3,
            }[orientation] as LogicalMonitorTransform & (0 | 1 | 2 | 3);

            const {geometry, transform: currentTransform} = await this.getBuiltinMonitorGeometryAndTransform();

            if (currentTransform !== targetTransform) {
                this.showFloatingRotateButton(currentTransform, targetTransform, geometry);
            }
        }
    }

    private showFloatingRotateButton(
        currentTransform: LogicalMonitorTransform,
        targetTransform: LogicalMonitorTransform & (0 | 1 | 2 | 3),
        monitorGeometry: Mtk.Rectangle,
    ): void {
        let [aX, aY] = computeAlignment(currentTransform, targetTransform);

        const sf = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scaleFactor;
        const buttonSize = 40 * sf;
        const margin = Main.panel.allocation.y2 + 5 * sf;

        let btn: Widgets.Button | null = this.pm.autoDestroy(new Widgets.Button({
            ref: this.floatingButton,
            styleClass: 'touchup-floating-screen-rotation-button',
            iconName: 'rotation-allowed-symbolic',
            width: 40 * sf,
            height: 40 * sf,
            x: monitorGeometry.x + clamp(monitorGeometry.width * aX, margin, monitorGeometry.width - buttonSize - margin),
            y: monitorGeometry.y + clamp(monitorGeometry.height * aY, margin, monitorGeometry.height - buttonSize - margin),
            onClicked: () => {
                btn?.destroy();
                setMonitorTransform(targetTransform);
            },
            onDestroy: () => btn = null,
            opacity: 128,
            scaleX: 0.5,
            scaleY: 0.5,
            pivotPoint: new Graphene.Point({x: 0.5, y: 0.5}),
        }));

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
            Delay.ms(700 + 2000 * i).then(() => {
                // @ts-ignore
                btn?.ease({
                    rotationAngleZ: btn.rotationAngleZ - 90,
                    duration: 550, // ms
                    mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
                });
            });
        }

        // Animate out and destroy:
        Delay.ms(7000).then(() => {
            if (btn === this.floatingButton.current) {  // Check if btn is still the current button, to not destroy another one
                this.removeFloatingRotateButton({animate: true});
            }
        });
    }

    private removeFloatingRotateButton({animate = false}: {animate: boolean}) {
        if (animate) {
            const btn = this.floatingButton.current;
            // @ts-ignore
            btn?.ease({
                scaleX: 0.5,
                scaleY: 0.5,
                opacity: 128,
                duration: 250, // ms
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onComplete: () => btn?.destroy(),
            });
        } else {
            this.floatingButton.current?.destroy();
        }

    }

    private async getBuiltinMonitorGeometryAndTransform() {
        const state = await DisplayConfigState.getCurrent();
        const monitorConnector = (state.builtinMonitor ?? state.monitors[0]).connector;
        const monitorIndex = global.backend.get_monitor_manager().get_monitor_for_connector(monitorConnector);

        const geometry = global.display.get_monitor_geometry(monitorIndex);
        const transform = state.getLogicalMonitorFor(monitorConnector)!.transform;
        return {geometry, transform};
    }
}


/**
 * Computes the alignment tuple (x-alignment, y-alignment) to position an actor
 * on the bottom-right edge of the screen, considering the current transform and targetOrientation.
 *
 * @param currentTransform - The current display rotation/transformation (0-7).
 * @param targetTransform - The potential new screen transform (0-3).
 * @returns A tuple [x-alignment, y-alignment] in the range [0, 1].
 */
function computeAlignment(currentTransform: LogicalMonitorTransform, targetTransform: LogicalMonitorTransform & (0 | 1 | 2 | 3)) {
    // Base alignment for each targetOrientation assuming no rotation (transform = 0)
    const [baseX, baseY] = {
        0: [1, 1],  // Bottom-right
        1: [1, 0],  // Bottom-left
        2: [0, 0],  // Top-left
        3: [0, 1],  // Top-right
    }[targetTransform] || [1.0, 1.0];  // default value, just in case (even though this should never happen)

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
    }[currentTransform] || [baseX, baseY];  // default value, just in case (even though this should never happen)
}



