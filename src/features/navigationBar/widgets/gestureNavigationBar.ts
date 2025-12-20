import St from "gi://St";
import Clutter from "gi://Clutter";
import {IntervalRunner} from "$src/utils/intervalRunner";
import {clamp, oneOf} from "$src/utils/utils";
import Shell from "gi://Shell";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import {IdleRunner} from "$src/utils/idleRunner";
import {calculateLuminance} from "$src/utils/colors";
import BaseNavigationBar from "$src/features/navigationBar/widgets/baseNavigationBar";
import * as Widgets from "$src/utils/ui/widgets";
import {OverviewGestureController, WorkspaceGestureController} from "$src/utils/overviewAndWorkspaceGestureController";
import {GestureRecognizer, GestureState} from "$src/utils/ui/gestureRecognizer";
import {Monitor} from "resource:///org/gnome/shell/ui/layout.js";
import {Delay} from "$src/utils/delay";
import GObject from "gi://GObject";
import Mtk from "gi://Mtk";
import {logger} from "$src/utils/logging";
import {settings} from "$src/settings";
import GLib from "gi://GLib";
import Cogl from "gi://Cogl";


/**
 * Area reserved on the left side of the navbar in which a swipe up opens the OSK,
 * in logical pixels
 */
const LEFT_EDGE_OFFSET = 100;

/**
 * The full height of the navigation bar (not just the pill),
 * in logical pixels
 */
const NAV_BAR_HEIGHT = 22;


export default class GestureNavigationBar extends BaseNavigationBar<_EventPassthroughActor> {
    declare private pill: St.Bin;
    private styleClassUpdateInterval: IntervalRunner;
    private _isWindowNear: boolean = false;
    private readonly gestureManager: NavigationBarGestureManager;

    constructor(props: {reserveSpace: boolean, invisibleMode: boolean}) {
        super({ reserveSpace: props.reserveSpace });

        this.styleClassUpdateInterval = new IntervalRunner(500, this.updateStyleClasses.bind(this));
        this.gestureManager = new NavigationBarGestureManager({
            edgeThreshold: this.computeHeight(),
        });

        this.actor.connect('notify::mapped', () => this.gestureManager.setEnabled(this.actor.mapped));

        this.setInvisibleMode(props.invisibleMode);

        this.connect('notify::visible', _ => this._updateStyleClassIntervalEnabled());
        this.connect('notify::reserve-space', _ => {
            this._updateStyleClassIntervalEnabled();
            void this.updateStyleClasses();
        });
    }

    protected _buildActor(): _EventPassthroughActor {
        return new _EventPassthroughActor({
            name: 'touchup-navbar',
            styleClass: 'touchup-navbar touchup-navbar--transparent bottom-panel',
            reactive: true,
            trackHover: true,
            canFocus: true,
            layoutManager: new Clutter.BinLayout(),
            onRealize: () => this.styleClassUpdateInterval.scheduleOnce(),
            child: this.pill = new Widgets.Bin({  // the navigation bars pill:
                name: 'touchup-navbar__pill',
                styleClass: 'touchup-navbar__pill',
                yAlign: Clutter.ActorAlign.CENTER,
                xAlign: Clutter.ActorAlign.CENTER,
            }),
        });
    }

    protected onUpdateToSurrounding(surrounding: {isWindowNear: boolean, isInOverview: boolean}): void {
        this._isWindowNear = surrounding.isWindowNear && !surrounding.isInOverview;
        if (!this.reserveSpace) {
            let newInterval = surrounding.isInOverview || !surrounding.isWindowNear ? 3000 : 500;
            // if a window is moved onto/away from the navigation bar or overview is toggled, schedule update soonish:
            this.styleClassUpdateInterval.scheduleOnce(250);
            this.styleClassUpdateInterval.setInterval(newInterval);
        } else {
            void this.updateStyleClasses();
        }
    }

    protected computeHeight() {
        const sf = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scaleFactor;

        return NAV_BAR_HEIGHT * sf;
    }

    protected computePillSize() {
        const sf = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scaleFactor;

        return {
            width: clamp(this.monitor.width * 0.25, 70 * sf, 330 * sf),
            height: Math.floor(Math.min(this.computeHeight() * 0.8, 6 * sf, this.computeHeight() - 2)),
        };
    }

    protected onBeforeReallocate() {
        this.actor.set_height(this.isInInvisibleMode ? 0 : this.computeHeight());

        this.pill.set_size(this.computePillSize().width, this.computePillSize().height);

        this.gestureManager.setEdgeThreshold(this.computeHeight());
    }

    setMonitor(monitorIndex: number) {
        super.setMonitor(monitorIndex);
        this.gestureManager.setMonitor(monitorIndex);
    }

    private updateStyleClasses() {
        if (this.reserveSpace && this._isWindowNear) {
            // Make navbar opaque (black or white, based on shell theme brightness):
            this.actor.remove_style_class_name('touchup-navbar--transparent');
            this.pill.remove_style_class_name('touchup-navbar__pill--dark');
        } else {
            // Make navbar transparent:
            this.actor.add_style_class_name('touchup-navbar--transparent');

            // Adjust pill brightness:
            this.findBestPillBrightness().then(brightness => {
                // Avoid doing anything in case the callback has been stopped during the time
                // `findBestPillBrightness` was running:
                if (!this.styleClassUpdateInterval.enabled) return;

                if (brightness == 'dark') {
                    this.pill.add_style_class_name('touchup-navbar__pill--dark')
                } else {
                    this.pill.remove_style_class_name('touchup-navbar__pill--dark')
                }
            });
        }
    }

    /**
     * Find the best pill brightness by analyzing what's on the screen behind the pill
     */
    private findBestPillBrightness(): Promise<'dark' | 'light'> {
        return new Promise<'dark' | 'light'>((resolve) => {
            // Capture the pill's surrounding in a GLib idle task, to prevent it from running in bad scenarios.
            //
            // Example: While the screen is being rotated by the Shell, this can cause Shell crashes (e.g. because
            // it could result in capturing a screenshot outside the screens dimensions). In JS, we don't have
            // precise enough control over what runs when to ensure this in another way.
            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                let rect = this.pill.get_transformed_extents();

                const shooter = new Shell.Screenshot();

                Promise
                    .all([
                        // FIXME: This relies on the color of a single pixel right now, see below for several other attempts
                        //  that all have problems due to GJS/introspection limitations
                        // Notice 1: See the bottom of this file for a history of other attempts
                        // Notice 2: Fetching multiple pixel colors this way concurrently has very bad performance
                        shooter.pick_color(rect.get_x() + rect.get_width() * 0.5, rect.get_y() - 2),
                        // shooter.pick_color(rect.get_x() + rect.get_width() * 0.4, rect.get_y() + rect.get_height() + 3),
                    ])
                    // @ts-ignore
                    .then((results: [Cogl.Color, any][]) => {
                        const colors = results.map(c => c[0]);

                        // Calculate the luminance of the average RGB values:
                        let luminance = calculateLuminance(
                            colors.reduce((a, b) => a + b.red, 0) / colors.length,
                            colors.reduce((a, b) => a + b.green, 0) / colors.length,
                            colors.reduce((a, b) => a + b.blue, 0) / colors.length
                        );

                        resolve(luminance > 0.5 ? 'dark' : 'light');
                    });

                return GLib.SOURCE_REMOVE;
            });
        });
    }

    private _updateStyleClassIntervalEnabled() {
        this.styleClassUpdateInterval.setEnabled(this.isVisible && !this.reserveSpace);
    }

    /**
     * In invisible mode, the navigation bars height and opacity are set to 0; this is because
     * we cannot use the `visible` property since this would infer with the Shell's own handling
     * of that (in `Main.layoutManager.addTopChrome`)
     */
    setInvisibleMode(invisible: boolean) {
        // We use opacity here instead of the actors `visible` property since [LayoutManager.addTopChrome] uses the
        // `visible` property itself which would interfere with this.
        this.actor.opacity = invisible ? 0 : 255;

        // Reallocate, to adjust the navbar height to invisible mode:
        this.reallocate();
    }

    get isInInvisibleMode() {
        return this.actor.opacity === 0;
    }

    destroy() {
        this.styleClassUpdateInterval.stop();
        this.gestureManager.destroy();
        super.destroy();
    }
}


class NavigationBarGestureManager {
    private static readonly _overviewMaxSpeed = 0.005;
    private static readonly _workspaceMaxSpeed = 0.0016;

    private readonly _gesture: Clutter.PanGesture;
    private _overviewController: OverviewGestureController;
    private _wsController: WorkspaceGestureController;
    private _recognizer: GestureRecognizer;
    private _idleRunner: IdleRunner;

    private _targetWorkspaceProgress: number | null = 0;
    private _targetOverviewProgress: number | null = null;

    /**
     * This virtual input device is used to emulate touch events in click-through-navbar scenarios.
     */
    private readonly _virtualTouchscreenDevice: Clutter.VirtualInputDevice;
    private readonly _scaleFactor: number;

    private _hasStarted: boolean = false;
    private _isKeyboardGesture: boolean = false;
    private _edgeThreshold: number;

    constructor(props: {monitor?: Monitor, edgeThreshold: number}) {
        this._scaleFactor = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scaleFactor;
        this._edgeThreshold = props.edgeThreshold;

        // The controller used to actually perform the navigation gestures:
        this._overviewController = new OverviewGestureController();
        this._wsController = new WorkspaceGestureController({
            monitorIndex: props.monitor?.index ?? Main.layoutManager.primaryIndex,
        });

        // Use an [IdleRunner] to make the gestures asynchronously follow the users' finger:
        this._idleRunner = new IdleRunner((_, dt) => this._onIdleRun(dt ?? undefined));

        // Our [GestureRecognizer] to interpret the gestures:
        this._recognizer = new GestureRecognizer({
            onGestureProgress: state => this._onGestureProgress(state),
            onGestureCompleted: state => this._onGestureCompleted(state),
        });

        // Action that listens to appropriate events on the stage:
        this._gesture = new Clutter.PanGesture({
            max_n_points: 1,
        });

        this._gesture.connect('should-handle-sequence', (_: any, e: Clutter.Event) =>
            this._shouldHandleSequence(e));
        this._gesture.connect('pan-update', () => this._recognizer.push(Clutter.get_current_event()));
        this._gesture.connect('end', () => this._recognizer.push(Clutter.get_current_event()));
        this._gesture.connect('cancel', () => this._onGestureCancel())

        global.stage.add_action_full('touchup-navigation-bar', Clutter.EventPhase.CAPTURE, this._gesture);

        // To emit virtual events:
        this._virtualTouchscreenDevice = Clutter
            .get_default_backend()
            .get_default_seat()
            .create_virtual_device(Clutter.InputDeviceType.TOUCHSCREEN_DEVICE);
    }

    setMonitor(monitorIndex: number) {
        this._wsController.monitorIndex = monitorIndex;
    }

    setEdgeThreshold(edgeThreshold: number) {
        this._edgeThreshold = edgeThreshold;
    }

    setEnabled(enabled: boolean) {
        this._gesture.enabled = enabled;
    }

    private _getMonitorRect(x: number, y: number): Mtk.Rectangle {
        const rect = new Mtk.Rectangle({ x: x - 1, y: y - 1, width: 1, height: 1 });
        const monitorIndex = global.display.get_monitor_index_for_rect(rect);

        return global.display.get_monitor_geometry(monitorIndex);
    }

    private _shouldHandleSequence(event: Clutter.Event): boolean {
        const [x, y] = event.get_coords();
        const monitorRect = this._getMonitorRect(x, y);

        return y > monitorRect.y + monitorRect.height - this._edgeThreshold;
    }

    private _onGestureProgress(state: GestureState) {
        if (state.hasMovement) {
            if (!this._hasStarted) {
                this._startGestures(state);
            }

            if (this._isKeyboardGesture) {
                Main.keyboard._keyboard.gestureProgress(-state.totalMotionDelta.y);
            } else {
                const baseDistFactor = settings.navigationBar.gesturesBaseDistFactor.get() / 10.0;
                this._targetOverviewProgress = this._overviewController.initialProgress
                    + (-state.totalMotionDelta.y / (this._overviewController.baseDist * baseDistFactor));
                this._targetWorkspaceProgress = this._wsController.initialProgress
                    - (state.totalMotionDelta.x / this._wsController.baseDist) * 1.6;
            }
        }
    }

    private _startGestures(state: GestureState) {
        this._hasStarted = true;
        this._isKeyboardGesture = false;

        if (Main.keyboard.visible) {
            // Close the keyboard if it's visible:
            Main.keyboard._keyboard
                ? Main.keyboard._keyboard.close(true)  // immediate = true
                : Main.keyboard.close();

        } else if (Main.keyboard._keyboard
            && state.pressCoordinates.x < LEFT_EDGE_OFFSET * this._scaleFactor
            && state.firstMotionDirection?.axis === 'vertical') {

            this._isKeyboardGesture = true;
        }

        if (!this._isKeyboardGesture) {
            // Start navigation gestures:
            this._overviewController.gestureBegin();
            this._wsController.gestureBegin();

            this._targetOverviewProgress = this._overviewController.initialProgress;
            this._targetWorkspaceProgress = this._wsController.initialProgress;

            this._idleRunner.start();
        }
    }

    private _onGestureCompleted(state: GestureState) {
        this._idleRunner.stop();
        this._hasStarted = false;

        const direction = state.lastMotionDirection?.direction ?? null;

        if (state.isTap) {
            this._overviewController.gestureCancel();
            this._wsController.gestureCancel();

            logger.debug("Emitting virtual tap");

            this._virtualTouchscreenDevice.notify_touch_down(state.events[0].timeUS, 0,
                state.pressCoordinates.x, state.pressCoordinates.y);
            Delay.ms(45).then(() => {
                this._virtualTouchscreenDevice.notify_touch_up(state.events.at(-1)!.timeUS, 0);
            });
        } else if (this._isKeyboardGesture) {
            if (direction === 'up') {
                Main.keyboard._keyboard?.gestureActivate();
            } else {
                Main.keyboard._keyboard?.gestureCancel();
            }
        } else {
            this._overviewController.gestureEnd(oneOf(direction, ['up', 'down']));
            this._wsController.gestureEnd(oneOf(direction, ['left', 'right']));
        }

        this._targetOverviewProgress = null;
        this._targetWorkspaceProgress = null;
    }

    private _onGestureCancel() {
        Main.keyboard._keyboard?.gestureCancel();
        this._overviewController.gestureCancel();
        this._wsController.gestureCancel();
    }

    private _onIdleRun(dt: number = 0) {
        let overviewProg = this._overviewController.currentProgress;
        let workspaceProg = this._wsController.currentProgress;

        if (this._targetOverviewProgress !== null
            && Math.abs(this._targetOverviewProgress - overviewProg) > 5 * NavigationBarGestureManager._overviewMaxSpeed) {
            let d = this._targetOverviewProgress - overviewProg;
            overviewProg += Math.sign(d) * Math.min(Math.abs(d) ** 2, dt * NavigationBarGestureManager._overviewMaxSpeed);
        }

        if (this._targetWorkspaceProgress !== null
            && Math.abs(this._targetWorkspaceProgress - workspaceProg) > 5 * NavigationBarGestureManager._workspaceMaxSpeed) {
            let d = this._targetWorkspaceProgress - workspaceProg;
            workspaceProg += Math.sign(d) * Math.min(Math.abs(d) ** 2, dt * NavigationBarGestureManager._workspaceMaxSpeed);
        }

        this._overviewController.gestureProgress(overviewProg - this._overviewController.initialProgress);
        this._wsController.gestureProgress(workspaceProg - this._wsController.initialProgress);
    }

    destroy() {
        this._overviewController.destroy();
        this._wsController.destroy();
        global.stage.remove_action(this._gesture);
    }
}


/**
 * An actor that is invisible to events, i.e. passes them through to any actors below.
 */
class _EventPassthroughActor extends Widgets.Bin {
    static {
        GObject.registerClass(this);
    }

    vfunc_pick(pick_context: Clutter.PickContext) {
        // By not making any call to this.pick_box(...) here, we make this actor pass through all events to
        // any actor potentially below it. Therefore, this actor is only a visuals and does not react to
        // events.
        return;
    }
}



// ==== Previous attempts to calculate pill surrounding brightness ===
// const shooter = new Shell.Screenshot();

// @ts-ignore (TS doesn't understand Gio._promisify(...) - see top of file)
// const [content]: [Clutter.TextureContent] = await shooter.screenshot_stage_to_content();
// const wholeScreenTexture = content.get_texture();

// An area surrounding the pill to use for brightness analysis:
// const area = {
//     x: this.pill.x - 20 * this.scaleFactor,
//     y: this.y,
//     w: this.pill.width + 40 * this.scaleFactor,
//     h: this.height,
// };
// const verticalPadding = (area.h - this.pill.height) / 2;

// High-level attempt (works but has memory leak - at least since Gnome Shell 46, maybe before too):
// const stream = Gio.MemoryOutputStream.new_resizable();
// // @ts-ignore (ts doesn't understand Gio._promisify())
// // noinspection JSVoidFunctionReturnValueUsed
// const pixbuf: GdkPixbuf.Pixbuf = await Shell.Screenshot.composite_to_stream(  // takes around 4-14ms, most of the time 7ms
//     wholeScreenTexture, area.x, area.y, area.w, area.h,
//     this.scaleFactor, null, 0, 0, 1, stream
// );
// stream.close(null);
// //  -- memory leak is above this line --
// const avgColor = calculateAverageColor(pixbuf.get_pixels(), pixbuf.width, [
//    {x: 0, y: 0, width: pixbuf.width, height: verticalPadding},  // above pill
//     {x: 0, y: verticalPadding + this.pill.height, width: pixbuf.width, height: verticalPadding}  // below pill
// ]);
// const luminance = calculateLuminance(...avgColor);
// // Save pxibuf as png image to tempdir to inspect:
// // pixbuf.savev(`/tmp/pxibuf-1-${avgColor}-${luminance}.png`, 'png', null, null);

// Low-level api attempt (not working; missing introspection annotations for `Cogl.SubTexture.get_data`):
// try {
//     const ctx = Clutter.get_default_backend().get_cogl_context();
//     const subtex = Cogl.SubTexture.new(ctx, wholeScreenTexture, area.x, area.y, area.w, area.h);
//     //const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, subtex.get_width(), subtex.get_height());
//
//     if (subtex) {
//         //const size = subtex.get_data(PixelFormat.ARGB_8888, 0, null);
//         //const buf = new Uint8Array(size);
//         let [buf, size] = subtex.get_data(PixelFormat.ARGB_8888, 0);
//
//         logger.debug("Buf length: ", buf.length, " - max: ", Math.max(...buf.values()));
//     } else {
//         logger.debug("Subtex is null");
//     }
// } catch (e) {
//     logger.debug("Error in updatePillBrightness: ", e);
// }

// Mid-level attempt (not working; missing introspection annotations for `Cogl.Framebuffer.read_pixels`):
// const ctx = Clutter.get_default_backend().get_cogl_context();
// const subtex = Cogl.SubTexture.new(ctx, wholeScreenTexture, area.x, area.y, area.w, area.h);
// logger.debug("subtex: ", subtex);
// if (subtex) {
//     /*(global.stage as Clutter.Stage).paint_to_buffer(
//         new Mtk.Rectangle({x: area.x, y: area.y, width: area.w, height: area.h}),
//         1,
//         buf,
//         0,
//         PixelFormat.ARGB_8888,
//         PaintFlag.NO_CURSORS,
//     );*/
//     /*
//     const tex = Cogl.Texture2D.new_with_size(ctx, area.w, area.h);
//     const fb = Cogl.Offscreen.new_with_texture(tex);
//     global.stage.paint_to_framebuffer(
//         fb,
//         new Mtk.Rectangle({x: area.x, y: area.y, width: area.w, height: area.h}),
//         1,
//         PaintFlag.NO_CURSORS,
//     );
//     const buffer: Uint8Array = fb.read_pixels(0, 0, area.w, area.h, PixelFormat.ARGB_8888);
//     */
// }
