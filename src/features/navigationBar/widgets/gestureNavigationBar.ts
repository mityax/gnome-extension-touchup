import St from "gi://St";
import Clutter from "gi://Clutter";
import {IntervalRunner} from "$src/utils/intervalRunner";
import {clamp} from "$src/utils/utils";
import Shell from "gi://Shell";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import {IdleRunner} from "$src/utils/idleRunner";
import {log} from "$src/utils/logging";
import {calculateLuminance} from "$src/utils/colors";
import BaseNavigationBar from "$src/features/navigationBar/widgets/baseNavigationBar";
import * as Widgets from "$src/utils/ui/widgets";
import OverviewAndWorkspaceGestureController from "$src/utils/overviewAndWorkspaceGestureController";
import {GestureRecognizer, GestureRecognizerEvent, GestureState} from "$src/utils/ui/gestureRecognizer";
import {Monitor} from "resource:///org/gnome/shell/ui/layout.js";


// Area reserved on the left side of the navbar in which a swipe up opens the OSK
// Note: This is in logical pixels, not physical pixels
const LEFT_EDGE_OFFSET = 100;


export default class GestureNavigationBar extends BaseNavigationBar<St.Bin> {
    declare private pill: St.Bin;
    private styleClassUpdateInterval: IntervalRunner;
    private _isWindowNear: boolean = false;
    private readonly gestureManager: NavigationBarGestureManager;

    constructor({reserveSpace} : {reserveSpace: boolean}) {
        super({ reserveSpace: reserveSpace });

        this.styleClassUpdateInterval = new IntervalRunner(500, this.updateStyleClasses.bind(this));
        this.gestureManager = new NavigationBarGestureManager(this.actor);

        this.onVisibilityChanged.connect('changed', () => this._updateStyleClassIntervalActivity());
        this.onReserveSpaceChanged.connect('changed', (reserveSpace) => {
            this._updateStyleClassIntervalActivity();
            void this.updateStyleClasses();
        });
    }

    protected _buildActor(): St.Bin {
        return new Widgets.Bin({
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

    protected onIsWindowNearChanged(isWindowNear: boolean): void {
        this._isWindowNear = isWindowNear;
        if (!this.reserveSpace) {
            let newInterval = Main.overview.visible || !isWindowNear ? 3000 : 500;
            if (newInterval != this.styleClassUpdateInterval.interval) {
                // if a window is moved onto/away from the navigation bar or overview is toggled, schedule update soonish:
                this.styleClassUpdateInterval.scheduleOnce(250);
            }
            this.styleClassUpdateInterval.setInterval(newInterval);
        } else {
            void this.updateStyleClasses();
        }
    }

    protected onBeforeReallocate() {
        const sf = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scaleFactor;
        const height = 22 * sf;
        this.actor.set_height(height);

        this.pill.set_width(clamp(this.monitor.width * 0.25, 70 * sf, 330 * sf));
        this.pill.set_height(Math.floor(Math.min(height * 0.8, 6 * sf, height - 2)));
    }

    setMonitor(monitorIndex: number) {
        super.setMonitor(monitorIndex);
        this.gestureManager.setMonitor(monitorIndex);
    }

    private async updateStyleClasses() {
        if (this.reserveSpace && this._isWindowNear) {
            // Make navbar opaque (black or white, based on shell theme brightness):
            this.actor.remove_style_class_name('touchup-navbar--transparent');
            this.pill.remove_style_class_name('touchup-navbar__pill--dark');
        } else {
            // Make navbar transparent:
            this.actor.add_style_class_name('touchup-navbar--transparent');

            // Adjust pill brightness:
            let brightness = await this.findBestPillBrightness();
            if (brightness == 'dark') {
                this.pill.add_style_class_name('touchup-navbar__pill--dark')
            } else {
                this.pill.remove_style_class_name('touchup-navbar__pill--dark')
            }
        }
    }

    /**
     * Find the best pill brightness by analyzing what's on the screen behind the pill
     */
    private async findBestPillBrightness(): Promise<'dark' | 'light'> {
        try {
            // FIXME: This relies on the color of a single pixel right now, see below for several other attempts
            //  that all have problems due to GJS/introspection limitations

            const shooter = new Shell.Screenshot();
            // @ts-ignore (typescript doesn't understand Gio._promisify(...) - see top of file)
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
            //         debugLog("Buf length: ", buf.length, " - max: ", Math.max(...buf.values()));
            //     } else {
            //         debugLog("Subtex is null");
            //     }
            // } catch (e) {
            //     debugLog("Error in updatePillBrightness: ", e);
            // }

            // Mid-level attempt (not working; missing introspection annotations for `Cogl.Framebuffer.read_pixels`):
            // const ctx = Clutter.get_default_backend().get_cogl_context();
            // const subtex = Cogl.SubTexture.new(ctx, wholeScreenTexture, area.x, area.y, area.w, area.h);
            // debugLog("subtex: ", subtex);
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

            // Individual pixel attempt:
            let rect = this.pill.get_transformed_extents();

            // @ts-ignore
            let colors: Cogl.Color[] = (await Promise.all([
                // We only use one pixel as doing this with multiple pixels appears to have very bad
                // performance (screen lags, visible e.g. when moving a window):
                shooter.pick_color(rect.get_x() + rect.get_width() * 0.5, rect.get_y() - 2),
                // shooter.pick_color(rect.get_x() + rect.get_width() * 0.4, rect.get_y() + rect.get_height() + 3),
                // @ts-ignore
            ])).map(c => c[0]);
            // Calculate the luminance of the average RGB values:
            let luminance = calculateLuminance(
                colors.reduce((a, b) => a + b.red, 0) / colors.length,
                colors.reduce((a, b) => a + b.green, 0) / colors.length,
                colors.reduce((a, b) => a + b.blue, 0) / colors.length
            );

            return luminance > 0.5 ? 'dark' : 'light';
        } catch (e) {
            log("Exception during `findBestPillBrightness` (falling back to 'dark' brightness): ", e);
            return 'dark';
        }
    }

    private _updateStyleClassIntervalActivity() {
        this.styleClassUpdateInterval.setActive(this.isVisible && !this.reserveSpace);
    }

    destroy() {
        this.styleClassUpdateInterval.stop();
        super.destroy();
    }
}


class NavigationBarGestureManager {
    private controller: OverviewAndWorkspaceGestureController;
    private recognizer: GestureRecognizer;
    private idleRunner: IdleRunner;

    private targetWorkspaceProgress: number | null = 0;
    private targetOverviewProgress: number | null = null;

    private readonly overviewMaxSpeed = 0.005;
    private readonly workspaceMaxSpeed = 0.0016;
    private readonly scaleFactor: number;

    constructor(private actor: Clutter.Actor, private monitor?: Monitor) {
        this.scaleFactor = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scaleFactor;

        this.controller = new OverviewAndWorkspaceGestureController({
            monitorIndex: monitor?.index ?? Main.layoutManager.primaryIndex,
        });

        this.recognizer = new GestureRecognizer({
            scaleFactor: this.scaleFactor,
            onGestureStarted: state => this._onGestureStarted(state),
            onGestureProgress: state => this._onGestureProgress(state),
            onGestureCompleted: state => this._onGestureCompleted(state),
        });

        this.idleRunner = new IdleRunner((_, dt) => this._onIdleRun(dt ?? undefined));

        this.actor.connect('touch-event', (_, e) => {
            this.recognizer.push(GestureRecognizerEvent.fromClutterEvent(e));
        });
        this.actor.connect('destroy', () => this.idleRunner.stop());
    }

    private _onGestureStarted(state: GestureState) {
        this.controller.gestureBegin();
        this.targetOverviewProgress = this.controller.initialOverviewProgress;
        this.targetWorkspaceProgress = this.controller.initialWorkspaceProgress;
        this.idleRunner.start();

        if (Main.keyboard._keyboard && state.events[0].x < LEFT_EDGE_OFFSET * this.scaleFactor) {
            Main.keyboard._keyboard.gestureBegin();
        }

        if (Main.keyboard.visible) {
            Main.keyboard._keyboard
                ? Main.keyboard._keyboard.close(true)
                : Main.keyboard.close();
        }
    }

    private _onGestureProgress(state: GestureState) {
        this.targetWorkspaceProgress = this.controller.initialWorkspaceProgress
            - (state.totalMotionDelta.x / this.controller.baseDistX) * 1.6;

        if (Main.keyboard._keyboard && state.events[0].x < LEFT_EDGE_OFFSET * this.scaleFactor) {
            Main.keyboard._keyboard.gestureProgress(-state.totalMotionDelta.y / this.controller.baseDistY);
        } else {
            this.targetOverviewProgress = this.controller.initialOverviewProgress
                + (-state.totalMotionDelta.y / (this.controller.baseDistY * 0.2));
        }
    }

    private _onGestureCompleted(state: GestureState) {
        this.idleRunner.stop();

        const direction = state.lastMotionDirection?.direction ?? null;

        if (Main.keyboard._keyboard && direction === 'up' && state.events[0].x < LEFT_EDGE_OFFSET * this.scaleFactor) {
            //@ts-ignore
            Main.keyboard._keyboard.gestureActivate(Main.layoutManager.bottomIndex);
            this.controller.gestureEnd({ direction: null });
        } else {
            this.controller.gestureEnd({ direction });
        }

        this.targetOverviewProgress = null;
        this.targetWorkspaceProgress = null;
    }

    private _onIdleRun(dt: number = 0) {
        let overviewProg = this.controller.currentOverviewProgress;
        let workspaceProg = this.controller.currentWorkspaceProgress;

        if (this.targetOverviewProgress !== null
            && Math.abs(this.targetOverviewProgress - overviewProg) > 5 * this.overviewMaxSpeed) {
            let d = this.targetOverviewProgress - overviewProg;
            overviewProg += Math.sign(d) * Math.min(Math.abs(d) ** 2, dt * this.overviewMaxSpeed);
        }

        if (this.targetWorkspaceProgress !== null
            && Math.abs(this.targetWorkspaceProgress - workspaceProg) > 5 * this.workspaceMaxSpeed) {
            let d = this.targetWorkspaceProgress - workspaceProg;
            workspaceProg += Math.sign(d) * Math.min(Math.abs(d) ** 2, dt * this.workspaceMaxSpeed);
        }

        this.controller.gestureUpdate({
            overviewProgress: overviewProg - this.controller.initialOverviewProgress,
            workspaceProgress: workspaceProg - this.controller.initialWorkspaceProgress,
        });
    }

    setMonitor(monitorIndex: number) {
        this.controller.monitorIndex = monitorIndex;
    }
}





// Note: these are potentially needed for some of the approaches in `updatePillBrightness`, should
// they work one day:
//
//Gio._promisify(Shell.Screenshot.prototype, 'screenshot_stage_to_content');
//Gio._promisify(Shell.Screenshot.prototype, 'pick_color');
//
// if (typeof Cairo.format_stride_for_width === 'undefined') {
//     // Polyfill since the GJS bindings of Cairo are missing `format_stride_width`
//     Cairo.format_stride_for_width = (w: number, bpp: number = 32) => {  // bpp for Cairo.Format.ARGB32 (see https://github.com/ImageMagick/cairo/blob/main/src/cairo-image-surface.c#L741)
//         // Translated from original C-Code (https://github.com/ImageMagick/cairo/blob/main/src/cairoint.h#L1570):
//         //
//         // #define CAIRO_STRIDE_ALIGNMENT (sizeof (uint32_t))
//         // #define CAIRO_STRIDE_FOR_WIDTH_BPP(w,bpp) \
//         //    ((((bpp)*(w)+7)/8 + CAIRO_STRIDE_ALIGNMENT-1) & -CAIRO_STRIDE_ALIGNMENT)
//
//         const CAIRO_STRIDE_ALIGNMENT = Uint32Array.BYTES_PER_ELEMENT || 4  // sizeof(uint32_t) is 4 bytes in most systems
//         return (((bpp * w + 7) / 8 + CAIRO_STRIDE_ALIGNMENT - 1) & -CAIRO_STRIDE_ALIGNMENT);
//     }
// }
//
