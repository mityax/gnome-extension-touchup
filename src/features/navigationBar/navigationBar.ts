import St from "@girs/st-14";
import GObject from "@girs/gobject-2.0";
import Clutter from "@girs/clutter-14";

import * as Main from '@girs/gnome-shell/ui/main';
import {Monitor} from "@girs/gnome-shell/ui/layout";
import {clamp, debugLog, getStyle, log, UnknownClass} from "$src/utils/utils";
import {PatchManager} from "$src/utils/patchManager";
import {css} from "$src/utils/ui/css";
import WindowPositionTracker from "$src/utils/ui/windowPositionTracker";
import Meta from "@girs/meta-14";
import {NavigationBarGestureTracker} from "$src/features/navigationBar/navigationBarGestureTracker";
import Shell from "@girs/shell-14";
import Gio from "@girs/gio-2.0";
import Cairo from "cairo";
import GdkPixbuf from "@girs/gdkpixbuf-2.0";
import {calculateAverageColor, calculateLuminance} from "$src/utils/colors";
import {IntervalRunner} from "$src/utils/intervalRunner";
import Action = Clutter.Action;
import Stage = Clutter.Stage;
import ActorAlign = Clutter.ActorAlign;

const LEFT_EDGE_OFFSET = 100;
const WORKSPACE_SWITCH_MIN_SWIPE_LENGTH = 12;


//Gio._promisify(Shell.Screenshot.prototype, 'screenshot_stage_to_content');
//Gio._promisify(Shell.Screenshot, 'composite_to_stream');

if (typeof Cairo.format_stride_for_width === 'undefined') {
    // Polyfill since the GJS bindings of Cairo are missing `format_stride_width`
    Cairo.format_stride_for_width = (w: number, bpp: number = 32) => {  // bpp for Cairo.Format.ARGB32 (see https://github.com/ImageMagick/cairo/blob/main/src/cairo-image-surface.c#L741)
        // Translated from original C-Code (https://github.com/ImageMagick/cairo/blob/main/src/cairoint.h#L1570):
        //
        // #define CAIRO_STRIDE_ALIGNMENT (sizeof (uint32_t))
        // #define CAIRO_STRIDE_FOR_WIDTH_BPP(w,bpp) \
        //    ((((bpp)*(w)+7)/8 + CAIRO_STRIDE_ALIGNMENT-1) & -CAIRO_STRIDE_ALIGNMENT)

        const CAIRO_STRIDE_ALIGNMENT = Uint32Array.BYTES_PER_ELEMENT || 4  // sizeof(uint32_t) is 4 bytes in most systems
        return (((bpp * w + 7) / 8 + CAIRO_STRIDE_ALIGNMENT - 1) & -CAIRO_STRIDE_ALIGNMENT);
    }
}


export default class NavigationBar extends St.Widget {
    static readonly PATCH_SCOPE: unique symbol = Symbol('navigation-bar');

    private monitor: Monitor;
    private mode: "gestures" | "buttons";
    private readonly scaleFactor: number;

    private windowPositionTracker: WindowPositionTracker;
    private readonly pill: St.Bin;
    private readonly brightnessUpdateTimeout: IntervalRunner;

    static {
        GObject.registerClass(this);
    }


    constructor(mode: 'gestures' | 'buttons') {
        const panelStyle = getStyle(St.Widget, 'panel');
        super({
            name: 'gnometouch-navbar',
            styleClass: 'gnometouch-navbar gnometouch-navbar--transparent bottom-panel solid',
            reactive: true,
            trackHover: true,
            canFocus: true,
            layoutManager: new Clutter.BinLayout(),
            visible: Clutter.get_default_backend().get_default_seat().touchMode,
        });

        // TODO: find touch-enabled monitors, keyword: ClutterInputDevice
        this.monitor = Main.layoutManager.primaryMonitor!;
        this.mode = mode;

        this.scaleFactor = St.ThemeContext.get_for_stage(global.stage as Stage).scaleFactor;

        // Create and add the pill:
        this.pill = new St.Bin({
            name: 'gnometouch-navbar__pill',
            styleClass: 'gnometouch-navbar__pill',
            yAlign: ActorAlign.CENTER,
            xAlign: ActorAlign.CENTER,
            style: css({
                borderRadius: '20px',
            })
        });
        this.add_child(this.pill);

        this._reallocate();

        PatchManager.patch(() => {
            const monitorManager = global.backend.get_monitor_manager();
            const id = monitorManager.connect('monitors-changed', this._reallocate.bind(this));
            return () => monitorManager.disconnect(id);
        }, {scope: NavigationBar.PATCH_SCOPE})

        this._setupGestureTracker();

        // Disable default bottom drag action:
        PatchManager.patch(() => {
            const action = global.stage.get_action('osk')!;
            global.stage.remove_action(action);
            return () => global.stage.add_action_full('osk', Clutter.EventPhase.CAPTURE, action);
        });

        this.brightnessUpdateTimeout = new IntervalRunner(500, this.updatePillBrightness.bind(this));

        this.windowPositionTracker = new WindowPositionTracker(windows => {
            // Check if at least one window is near enough to the navigation bar:
            const top = this.get_transformed_position()[1];
            const windowTouchesPanel = windows.some((metaWindow: Meta.Window) => {
                const windowBottom = metaWindow.get_frame_rect().y + metaWindow.get_frame_rect().height;
                return windowBottom >= top;
            });
            const isInOverview = Main.panel.has_style_pseudo_class('overview');

            let newInterval = isInOverview || !windowTouchesPanel ? 3000 : 500;
            if (newInterval != this.brightnessUpdateTimeout.interval) {
                // if a window is moved onto/away from the panel or overview is toggled, schedule update soon:
                this.brightnessUpdateTimeout.scheduleOnce(30);
            }
            this.brightnessUpdateTimeout.setInterval(newInterval);
        });
    }

    private _reallocate() {
        // TODO: find touch-enabled monitor, keyword: ClutterInputDevice
        this.monitor = Main.layoutManager.primaryMonitor!;

        const height = (this.mode == 'gestures' ? 22 : 40) * this.scaleFactor;

        this.set_position(this.monitor.x, this.monitor.y + this.monitor.height - height);
        this.set_size(this.monitor.width, height);

        this.pill.set_size(
            // Width:
            clamp(this.monitor.width * 0.25, 70 * this.scaleFactor, 330 * this.scaleFactor),

            // Height:
            Math.floor(Math.min(this.height * 0.8, 4.5 * this.scaleFactor, this.height - 2))
        )
        debugLog('pill size: ', this.pill.width, 'x', this.pill.height)
    }

    private _setupGestureTracker() {
        //@ts-ignore
        const wsController: UnknownClass = Main.wm._workspaceAnimation;

        const gesture = new NavigationBarGestureTracker();
        this.add_action_full('workspace-switch-gesture', Clutter.EventPhase.CAPTURE, gesture as Action);
        gesture.orientation = null; // Clutter.Orientation.HORIZONTAL;

        let baseDistX = 900;
        let baseDistY = global.screenHeight;
        let initialWorkspaceProgress = 0;
        let currentWorkspaceProgress = 0;
        let initialOverviewProgress = 0;
        let currentOverviewProgress = 0;

        gesture.connect('begin', (_: any, time: number, xPress: number, yPress: number) => {
            // Workspace switching:
            wsController._switchWorkspaceBegin({
                confirmSwipe(baseDistance: number, points: number[], progress: number, cancelProgress: number) {
                    baseDistX = baseDistance;
                    initialWorkspaceProgress = currentWorkspaceProgress = progress;
                }
            }, this.monitor.index);

            // Overview toggling:
            Main.overview._gestureBegin({
                confirmSwipe(baseDistance: number, points: number[], progress: number, cancelProgress: number) {
                    baseDistY = baseDistance;

                    // the following tenary expression is needed to fix a bug (presumably in Gnome Shell's
                    // OverviewControls) that causes a `progress` of 1 to be passed to this callback on the first
                    // gesture begin, even though the overview is not visible:
                    initialOverviewProgress = currentOverviewProgress = Main.overview._visible ? progress : 0;           }
            });
        });

        gesture.connect('update', (_: any, time: number, distX, distY) => {
            // Workspace switching:
            currentWorkspaceProgress = initialWorkspaceProgress + distX / baseDistX;
            wsController._switchWorkspaceUpdate({}, currentWorkspaceProgress);

            // Overview toggling:
            if (Main.keyboard._keyboard && gesture.get_press_coords(0)[0] < LEFT_EDGE_OFFSET * this.scaleFactor) {
                Main.keyboard._keyboard.gestureProgress(distY / baseDistY);
            } else {
                currentOverviewProgress = initialOverviewProgress + distY / (baseDistY * 0.3);  // baseDist ist the whole screen height, which is way too long for our bottom drag gesture, thus we only take a fraction of it
                Main.overview._gestureUpdate(gesture, currentOverviewProgress);
            }
        });

        gesture.connect('end', (_: any, direction: string, speed: number) => {
            // Workspace switching:
            if (direction === 'left' || direction === 'right') {
                debugLog(`currenWorkspaceProgress=${currentWorkspaceProgress}, change: ${(direction == 'left' ? 0.5 : -0.5)}`)
                wsController._switchWorkspaceEnd({}, 500, currentWorkspaceProgress + (direction == 'left' ? 0.5 : -0.5));
            } else {
                wsController._switchWorkspaceEnd({}, 500, initialWorkspaceProgress);
            }

            if (Main.keyboard._keyboard && gesture.get_press_coords(0)[0] < LEFT_EDGE_OFFSET * this.scaleFactor) {
                if (direction == 'up') {
                    //@ts-ignore
                    Main.keyboard._keyboard.gestureActivate(Main.layoutManager.bottomIndex);
                }
            } else {
                // Overview toggling:
                if (direction === 'up' || direction === null) {  // `null` means user holds still at the end
                    Main.overview._gestureEnd({}, 300, clamp(Math.round(currentOverviewProgress), 1, 2));
                } else {
                    Main.overview._gestureEnd({}, 300, initialOverviewProgress);
                }
            }
        });

        gesture.connect('gesture-cancel', (_gesture) => {
            wsController._switchWorkspaceEnd({}, 500, initialWorkspaceProgress);
            if (Main.keyboard._keyboard && gesture.get_press_coords(0)[0] < LEFT_EDGE_OFFSET * this.scaleFactor) {
                Main.keyboard._keyboard.gestureCancel();
            } else {
                Main.overview._gestureEnd({}, 300, 0);
            }
        })
    }

    private async updatePillBrightness() {
        const shooter = new Shell.Screenshot();
        // @ts-ignore (typescript doesn't understand Gio._promisify(...) - see top of file)
        const [content]: [Clutter.TextureContent] = await shooter.screenshot_stage_to_content();
        const wholeScreenTexture = content.get_texture();

        const area = {
            x: this.pill.x - 20 * this.scaleFactor,
            y: this.y,
            w: this.pill.width + 40 * this.scaleFactor,
            h: this.height,
        };

        const stream = Gio.MemoryOutputStream.new_resizable();
        // @ts-ignore (ts doesn't understand Gio._promisify())
        const pixbuf: GdkPixbuf.Pixbuf = await Shell.Screenshot.composite_to_stream(  // takes around 4-14ms, most of the time 7ms
            wholeScreenTexture, area.x, area.y, area.w, area.h,
            this.scaleFactor, null, 0, 0, 1, stream
        );
        stream.close(null);

        const verticalPadding = (area.h - this.pill.height) / 2;

        const avgColor = calculateAverageColor(pixbuf.get_pixels(), pixbuf.width, [
            {x: 0, y: 0, width: pixbuf.width, height: verticalPadding},  // above pill
            {x: 0, y: verticalPadding + this.pill.height, width: pixbuf.width, height: verticalPadding}  // below pill
        ]);
        const luminance = calculateLuminance(...avgColor);

        // Save pxibuf as png image to tempdir to inspect:
        // pixbuf.savev(`/tmp/pxibuf-1-${avgColor}-${luminance}.png`, 'png', null, null);

        if (luminance > 0.5) {
            this.pill.add_style_class_name('gnometouch-navbar__pill--dark')
        } else {
            this.pill.remove_style_class_name('gnometouch-navbar__pill--dark')
        }
    }

    destroy() {
        this.brightnessUpdateTimeout.stop();
        super.destroy();
        this.windowPositionTracker.destroy();
    }
}
