import St from "gi://St";
import Clutter from "gi://Clutter";
import {IntervalRunner} from "$src/utils/intervalRunner";
import {clamp, UnknownClass} from "$src/utils/utils";
import Shell from "gi://Shell";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import {NavigationBarGestureTracker} from "../navigationBarGestureTracker";
import {IdleRunner} from "$src/utils/idleRunner";
import {log} from "$src/utils/logging";
import {calculateLuminance} from "$src/utils/colors";
import BaseNavigationBar from "$src/features/navigationBar/widgets/baseNavigationBar";
import * as Widgets from "$src/utils/ui/widgets";


// Area reserved on the left side of the navbar in which a swipe up opens the OSK
// Note: This is in logical pixels, not physical pixels
const LEFT_EDGE_OFFSET = 100;


export default class GestureNavigationBar extends BaseNavigationBar<St.Bin> {
    declare private pill: St.Bin;
    private styleClassUpdateInterval: IntervalRunner;
    private _isWindowNear: boolean = false;

    constructor({reserveSpace} : {reserveSpace: boolean}) {
        super({ reserveSpace: reserveSpace });

        this.styleClassUpdateInterval = new IntervalRunner(500, this.updateStyleClasses.bind(this));

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
            onCreated: (widget) => this._setupGestureTrackerFor(widget),
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

    private _setupGestureTrackerFor(actor: Clutter.Actor) {
        const scaleFactor = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scaleFactor;

        //@ts-ignore
        const wsController: UnknownClass = Main.wm._workspaceAnimation;

        // TODO: potentially delete the NavigationBarGestureTracker and just use a plain GestureRecognizer2D instead

        const gesture = new NavigationBarGestureTracker();
        actor.add_action_full('navigation-bar-gesture', Clutter.EventPhase.CAPTURE, gesture as Clutter.Action);
        gesture.orientation = null; // Clutter.Orientation.HORIZONTAL;

        let baseDistX = 900;
        let baseDistY = global.screenHeight;

        let initialWorkspaceProgress = 0;
        let targetWorkspaceProgress = 0;
        let currentWorkspaceProgress = 0;

        let initialOverviewProgress = 0;
        let targetOverviewProgress = 0;
        let currentOverviewProgress = 0;

        let overviewMaxSpeed = 0.005;
        let workspaceMaxSpeed = 0.0016;

        // This idle runner is responsible for making the actual overview/workspace progress smoothly
        // follow the according target progress:
        const idleRunner = new IdleRunner((_, dt) => {
            dt ??= 0;

            if (Math.abs(targetOverviewProgress - currentWorkspaceProgress) > 5 * overviewMaxSpeed) {
                let d = targetOverviewProgress - currentOverviewProgress;
                currentOverviewProgress += Math.sign(d) * Math.min(Math.abs(d) ** 2, dt * overviewMaxSpeed);
                Main.overview._gestureUpdate(gesture, currentOverviewProgress);
            }

            if (Math.abs(targetWorkspaceProgress - currentWorkspaceProgress) > 5 * workspaceMaxSpeed) {
                let d = targetWorkspaceProgress - currentWorkspaceProgress;
                currentWorkspaceProgress += Math.sign(d) * Math.min(Math.abs(d) ** 2, dt * workspaceMaxSpeed);
                wsController._switchWorkspaceUpdate({}, currentWorkspaceProgress);
            }
        });

        gesture.connect('begin', (_: any, time: number, xPress: number, yPress: number) => {
            // Workspace switching:
            wsController._switchWorkspaceBegin({
                confirmSwipe(baseDistance: number, points: number[], progress: number, cancelProgress: number) {
                    baseDistX = baseDistance;
                    initialWorkspaceProgress = currentWorkspaceProgress = targetWorkspaceProgress = progress;
                }
            }, this.monitor.index);

            // Overview toggling:
            Main.overview._gestureBegin({
                confirmSwipe(baseDistance: number, points: number[], progress: number, cancelProgress: number) {
                    baseDistY = baseDistance;

                    // The following tenary expression is needed to fix a bug (presumably in Gnome Shell's
                    // OverviewControls) that causes a `progress` of 1 to be passed to this callback on the first
                    // gesture begin, even though the overview is not visible:
                    initialOverviewProgress = currentOverviewProgress = targetOverviewProgress = Main.overview._visible ? progress : 0;
                }
            });

            // Close OSK if it is open:
            if (Main.keyboard.visible)
                Main.keyboard._keyboard
                    ? Main.keyboard._keyboard.close(true)  // close with immediate = true
                    : Main.keyboard.close();

            idleRunner.start();
        });

        gesture.connect('update', (_: any, time: number, distX, distY) => {
            // Workspace switching:
            targetWorkspaceProgress = initialWorkspaceProgress + distX / baseDistX * 1.6;   // TODO: potential extension setting

            // Overview toggling:
            if (Main.keyboard._keyboard && gesture.get_press_coords(0)[0] < LEFT_EDGE_OFFSET * scaleFactor) {
                Main.keyboard._keyboard.gestureProgress(distY / baseDistY);
            } else {
                // TODO: potential extension setting:
                targetOverviewProgress = initialOverviewProgress + distY / (baseDistY * 0.2);  // baseDist ist the whole screen height, which is way too long for our bottom drag gesture, thus we only take a fraction of it
            }
        });

        gesture.connect('end', (_: any, direction: string, speed: number) => {
            idleRunner.stop();

            // Workspace switching:
            if (direction === 'left' || direction === 'right') {
                wsController._switchWorkspaceEnd({}, 500, targetWorkspaceProgress + (direction == 'left' ? 0.5 : -0.5));
            } else {
                wsController._switchWorkspaceEnd({}, 500, initialWorkspaceProgress);
            }

            if (Main.keyboard._keyboard && gesture.get_press_coords(0)[0] < LEFT_EDGE_OFFSET * scaleFactor) {
                if (direction == 'up') {
                    //@ts-ignore
                    Main.keyboard._keyboard.gestureActivate(Main.layoutManager.bottomIndex);
                }
            } else {
                // Overview toggling:
                if (direction === 'up' || direction === null) {  // `null` means user holds still at the end
                    Main.overview._gestureEnd({}, 300, clamp(Math.round(targetOverviewProgress), 1, 2));
                } else {
                    Main.overview._gestureEnd({}, 300, initialOverviewProgress);
                }
            }
        });

        gesture.connect('gesture-cancel', (_gesture) => {
            idleRunner.stop();

            wsController._switchWorkspaceEnd({}, 500, initialWorkspaceProgress);
            if (Main.keyboard._keyboard && gesture.get_press_coords(0)[0] < LEFT_EDGE_OFFSET * scaleFactor) {
                Main.keyboard._keyboard.gestureCancel();
            } else {
                Main.overview._gestureEnd({}, 300, 0);
            }
        })
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


