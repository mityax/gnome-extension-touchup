import Meta from "gi://Meta";
import Gio from "gi://Gio";
import ExtensionFeature from "../../utils/extensionFeature";
import {DisplayConfigState, LogicalMonitorTransform, setMonitorTransform,} from "$src/utils/monitorDBusUtils";
import * as Widgets from "$src/utils/ui/widgets";
import {clamp} from "$src/utils/utils";
import St from "gi://St";
import Clutter from "gi://Clutter";
import Graphene from "gi://Graphene";
import Mtk from "gi://Mtk";
import {Delay} from "$src/utils/delay";
import {PatchManager} from "$src/utils/patchManager";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import {assert, logger} from "$src/utils/logging";
import {AccelerometerOrientation, SensorProxy} from "$src/features/screenRotateUtils/sensorProxy";
import GLib from "gi://GLib";
import {debounce} from "$src/utils/debounce";


export class FloatingScreenRotateButtonFeature extends ExtensionFeature {
    private touchscreenSettings = new Gio.Settings({
        schema_id: 'org.gnome.settings-daemon.peripherals.touchscreen',
    });
    private floatingButton: FloatingRotateButton | null = null;
    private sensorProxy: SensorProxy | null = null;

    constructor(pm: PatchManager) {
        super(pm);

        void this.initSensorProxy();

        // When orientation lock is enabled (i.e. the Shell's auto-rotate quicksetting is disabled), the accelerometer
        // is released by the shell. Since we're sharing a DBus connection with the Shell, we're affected too
        // and need to reclaim it again to receive updates:
        this.pm.connectTo(
            this.touchscreenSettings,
            "changed::orientation-lock",
            () => this.maybeClaimAccelerometer(),
        );

        // Destroy the current floating button when monitor configuration is modified:
        this.pm.connectTo(
            global.backend.get_monitor_manager(),
            'monitors-changed',
            (manager: Meta.MonitorManager) => this.floatingButton?.destroy({animate: false}),
        );
    }

    private async initSensorProxy() {
        this.sensorProxy = await new Promise((resolve, reject) => {
            new SensorProxy(
                Gio.DBus.system,
                "net.hadess.SensorProxy",
                "/net/hadess/SensorProxy",
                (proxy, error) => {
                    if (error === null)
                        resolve(proxy);
                    else
                        reject(error);
                },
                null, /* cancellable */
                Gio.DBusProxyFlags.NONE);
        });

        this.pm.connectTo(this.sensorProxy!, "g-properties-changed", (_, changed: GLib.Variant) => {
            if (Object.hasOwn(changed.unpack() as object, "AccelerometerOrientation")) {
                void this.onAccelerometerOrientationChanged(this.sensorProxy!.AccelerometerOrientation);
            }
        });

        // Perform initial accelerometer claim sync (after a delay to not conflict with the
        // Shell's own potential claim):
        Delay.s(1)
            .then(() => this.maybeClaimAccelerometer());

        // Try to claim it again a few times later - this apparently fixes the first claim
        // above being ignored on some devices, likely due to some initialization process of
        // undefined duration still going on. Claiming the accelerometer multiple times does
        // not do any harm.
        // FIXME: Find out why this is, and how do to it better
        for (let delay of [10, 15, 20, 25, 35, 60]) {  // somewhat arbitrary delays - since those depend on unknown factors anyway.
            Delay.s(delay)
                .then(() => this.maybeClaimAccelerometer());
        }
    }

    private async maybeClaimAccelerometer() {
        if (!this.sensorProxy) return;
        if (!this.sensorProxy.HasAccelerometer) {
            logger.info("[SensorProxy] No accelerometer available.");
            return;
        }

        if (this.isOrientationLockEnabled) {
            logger.info("[SensorProxy] Claiming accelerometer!");
            await this.sensorProxy.ClaimAccelerometerAsync();

            /*logger.info("[SensorProxy] Claimed accelerometer, now fixing up GLib properties cache");
            Gio.DBus.system.call(
                "net.hadess.SensorProxy",
                "/net/hadess/SensorProxy",
                "org.freedesktop.DBus.Properties",
                "Get",
                new GLib.Variant("(ss)", ["net.hadess.SensorProxy", "AccelerometerOrientation"]),
                new GLib.VariantType("(v)"),
                Gio.DBusCallFlags.NO_AUTO_START,
                -1,
                null,
                (source_object, res, data) => {
                    logger.info("DBus callback ready: ", res, data);
                    const propValue = Gio.DBus.system.call_finish(res);
                    this.sensorProxy.set_cached_property('AccelerometerOrientation', propValue.get_variant());
                    logger.info("DBus callback finished, accelerometer orientation: ",
                        this.sensorProxy.AccelerometerOrientation,
                        this.sensorProxy.get_cached_property('AccelerometerOrientation'),
                        propValue.deepUnpack());
                });*/
        }
    }

    private get isOrientationLockEnabled(): boolean {
        return this.touchscreenSettings.get_boolean('orientation-lock');
    }

    private async onAccelerometerOrientationChanged(orientation: AccelerometerOrientation) {
        const targetTransform = {
            'normal': 0,
            'left-up': 1,
            'bottom-up': 2,
            'right-up': 3,
        }[orientation] as LogicalMonitorTransform & (0 | 1 | 2 | 3);

        // If there's a floating button currently visible, that matches our `targetTransform`,
        // there's nothing to do:
        if (this.floatingButton !== null
            && !this.floatingButton?.isDestroyed
            && this.floatingButton?.targetTransform === targetTransform) {
            return;
        }

        const {geometry, transform: currentTransform} = await this.getBuiltinMonitorGeometryAndTransform();

        // Destroy previous button, if it's still visible:
        if (this.floatingButton?.isDestroyed === false) {
            this.floatingButton!.destroy({animate: true});
        }

        // If we're already in sync with the orientation reported by the accelerometer,
        // there's nothing to do:
        if (currentTransform === targetTransform) {
            return;
        }

        // Show a new floating button for the accelerometer's reported orientation:
        this.floatingButton = new FloatingRotateButton(
            currentTransform, targetTransform, geometry,
            () => this.applyOrientation(targetTransform),
        );

        await this.floatingButton.show();
    }

    private async getBuiltinMonitorGeometryAndTransform() {
        const state = await DisplayConfigState.getCurrent();
        const monitorConnector = (state.builtinMonitor ?? state.monitors[0]).connector;
        const monitorIndex = global.backend.get_monitor_manager().get_monitor_for_connector(monitorConnector);

        const geometry = global.display.get_monitor_geometry(monitorIndex);
        const transform = state.getLogicalMonitorFor(monitorConnector)!.transform;
        return {geometry, transform};
    }

    private applyOrientation = debounce(setMonitorTransform, 100);

    destroy() {
        this.floatingButton?.destroy({animate: false});

        // Only release the accelerometer if the orientation lock is enabled, since otherwise, the Shell
        // still needs it, and releasing would break auto-rotate:
        if (this.isOrientationLockEnabled) {
            void this.sensorProxy?.ReleaseAccelerometerAsync();
        }

        super.destroy();
    }
}


class FloatingRotateButton {
    private readonly actor: Widgets.Button;
    private destroyed: boolean = false;

    constructor(readonly currentTransform: LogicalMonitorTransform,
                readonly targetTransform: LogicalMonitorTransform & (0 | 1 | 2 | 3),
                readonly monitorGeometry: Mtk.Rectangle,
                readonly onClicked: () => void) {
        let [aX, aY] = computeAlignment(this.currentTransform, this.targetTransform);

        const sf = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scaleFactor;
        const buttonSize = 40 * sf;
        const margin = Main.panel.allocation.y2 + 5 * sf;

        this.actor = new Widgets.Button({
            styleClass: 'touchup-floating-screen-rotation-button',
            iconName: 'rotation-allowed-symbolic',
            width: 40 * sf,
            height: 40 * sf,
            x: monitorGeometry.x + clamp(monitorGeometry.width * aX, margin, monitorGeometry.width - buttonSize - margin),
            y: monitorGeometry.y + clamp(monitorGeometry.height * aY, margin, monitorGeometry.height - buttonSize - margin),
            onClicked: () => {
                this.destroy({ animate: false });
                this.onClicked();
            },
            opacity: 128,
            scaleX: 0.5,
            scaleY: 0.5,
            pivotPoint: new Graphene.Point({x: 0.5, y: 0.5}),
        });
    }

    async show() {
        DEBUG: assert(
            !this.destroyed,
            "Cannot call FloatingRotateButton.show() after it has already been destroyed.",
        );

        global.stage.add_child(this.actor);

        // Animate in:
        this.actor.ease({
            opacity: 255,
            scaleX: 1,
            scaleY: 1,
            duration: 250, // ms
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        // Rotate/wiggle animation:
        await Delay.ms(500);
        for (let i = 0; i < 3; i++) {
            if (!this.destroyed) {
                this.actor.ease({
                    rotationAngleZ: this.actor.rotationAngleZ - 90,
                    duration: 550, // ms
                    mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
                });

                await Delay.ms(2000);
            } else {
                break;
            }
        }

        // Animate out and destroy:
        await Delay.ms(500);
        this.destroy({animate: true});
    }

    destroy({animate = false}: {animate: boolean}) {
        if (this.destroyed) return;

        this.destroyed = true;

        if (animate) {
            this.actor.ease({
                scaleX: 0.5,
                scaleY: 0.5,
                opacity: 128,
                duration: 250, // ms
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onStopped: () => this.actor.destroy()
            });
        } else {
            this.actor.destroy();
        }
    }

    get isDestroyed(): boolean {
        return this.destroyed;
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
