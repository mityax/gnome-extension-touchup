// This was originally taken from the "Pointer Tracker" extension, but has been
// modified to fit into this extensions structure and make use of its utilities.
//
// Source: https://github.com/garzj/gjs-pointer-tracker/blob/master/src/tracker/Cursor.ts
//


import Clutter from 'gi://Clutter';
import Mtk from 'gi://Mtk';
import St from "gi://St";
import {IdleRunner} from "../../utils/idleRunner";
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
// @ts-ignore
import {getPointerWatcher} from 'resource:///org/gnome/shell/ui/pointerWatcher.js';
import {PatchManager} from "$src/utils/patchManager.ts";


export class CursorOverlay {
    private static readonly MIN_WATCHER_INTERVAL = 1;

    private readonly widget: St.Widget;
    private shellTracker = global.backend.get_cursor_tracker();
    private pm: PatchManager;


    constructor(pm: PatchManager) {
        this.pm = pm;
        this.widget = new St.Bin();

        // this.shellTracker.connect('visibility-changed', () => this.update());
        this.pm.connectTo(this.shellTracker, 'cursor-changed', () => {
            this.update();

            this.pm.patch(() => {
                const idleRunner = IdleRunner.once(() => this.update());
                idleRunner.start();
                return () => idleRunner.stop();
            });
        });
        this.update();

        this.pm.patch(() => {
            const pointerListener = getPointerWatcher().addWatch(
                CursorOverlay.MIN_WATCHER_INTERVAL,
                (x: number, y: number) => this.updatePosition(x, y),
            );
            return () => pointerListener.remove();
        })

        const [initialX, initialY] = global.get_pointer();
        this.updatePosition(initialX, initialY);

        this.pm.patch(() => {
            Main.layoutManager.uiGroup.add_child(this.widget);
            return () => this.widget.destroy();
        })
    }

    destroy() {
        this.pm.destroy();
    }

    private update() {
        const texture = this.shellTracker.get_sprite();
        if (!texture) return;

        const [width, height] = [texture.get_width(), texture.get_height()];
        const clip = new Mtk.Rectangle({ x: 0, y: 0, width, height });
        const content = Clutter.TextureContent.new_from_texture(texture, clip);
        this.widget.set_content(content);

        this.widget.set_size(width, height);

        const scale = this.shellTracker.get_scale();
        /*const scale =
            1 /
            global.display.get_monitor_scale(global.display.get_current_monitor());*/
        this.widget.set_scale(scale, scale);

        const [hotX, hotY] = this.shellTracker.get_hot().map((v) => v * scale);
        this.widget.set_translation(-hotX, -hotY, 0);
    }

    private updatePosition(x: number, y: number) {
        this.widget.set_position(x, y);

        // Raise cursor to top:
        const parent = this.widget.get_parent();
        parent?.set_child_above_sibling(this.widget, null);
    }
}
