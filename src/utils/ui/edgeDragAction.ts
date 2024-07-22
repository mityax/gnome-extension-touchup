import '@girs/gnome-shell/extensions/global';

import * as Main from '@girs/gnome-shell/ui/main';

import Clutter from "@girs/clutter-14";
import GObject from '@girs/gobject-2.0';
import Mtk from '@girs/mtk-14';
import St from '@girs/st-14';
import Shell from "@girs/shell-14";


const EDGE_THRESHOLD = 20;
const DRAG_DISTANCE = 80;


export class EdgeDragAction extends Clutter.GestureAction {
    static {
        GObject.registerClass(this);
    }

    declare private _side: St.Side;
    declare private _allowedModes: Shell.ActionMode;

    // @ts-ignore
    _init({side, allowedModes}: { side: St.Side, allowedModes: Shell.ActionMode }) {
        super._init();
        this._side = side;
        this._allowedModes = allowedModes;
        this.set_n_touch_points(1);
        this.set_threshold_trigger_edge(Clutter.GestureTriggerEdge.AFTER);
    }

    _getMonitorRect(x: number, y: number) {
        const rect = new Mtk.Rectangle(x - 1, y - 1, 1, 1);
        let monitorIndex = global.display.get_monitor_index_for_rect(rect);

        return global.display.get_monitor_geometry(monitorIndex);
    }

    vfunc_gesture_prepare(_actor: Clutter.Actor) {
        if (this.get_n_current_points() === 0)
            return false;

        if (!(this._allowedModes & Main.actionMode))
            return false;

        let [x, y] = this.get_press_coords(0);
        let monitorRect = this._getMonitorRect(x, y);

        const res = (this._side === St.Side.LEFT && x < monitorRect.x + EDGE_THRESHOLD) ||
            (this._side === St.Side.RIGHT && x > monitorRect.x + monitorRect.width - EDGE_THRESHOLD) ||
            (this._side === St.Side.TOP && y < monitorRect.y + EDGE_THRESHOLD) ||
            (this._side === St.Side.BOTTOM && y > monitorRect.y + monitorRect.height - EDGE_THRESHOLD);
        if (res) {
            this.emit('begin', monitorRect);
        }
        return res;
    }

    vfunc_gesture_progress(_actor: Clutter.Actor) {
        let [startX, startY] = this.get_press_coords(0);
        let [x, y] = this.get_motion_coords(0);
        let offsetX = Math.abs(x - startX);
        let offsetY = Math.abs(y - startY);

        if (offsetX < EDGE_THRESHOLD && offsetY < EDGE_THRESHOLD)
            return true;

        if ((offsetX > offsetY &&
                (this._side === St.Side.TOP || this._side === St.Side.BOTTOM)) ||
            (offsetY > offsetX &&
                (this._side === St.Side.LEFT || this._side === St.Side.RIGHT))) {
            this.cancel();
            return false;
        }

        if (this._side === St.Side.TOP ||
            this._side === St.Side.BOTTOM)
            this.emit('progress', offsetY);
        else
            this.emit('progress', offsetX);

        return true;
    }

    vfunc_gesture_end(_actor: Clutter.Actor) {
        let [startX, startY] = this.get_press_coords(0);
        let [x, y] = this.get_motion_coords(0);
        let monitorRect = this._getMonitorRect(startX, startY);

        if ((this._side === St.Side.TOP && y > monitorRect.y + DRAG_DISTANCE) ||
            (this._side === St.Side.BOTTOM && y < monitorRect.y + monitorRect.height - DRAG_DISTANCE) ||
            (this._side === St.Side.LEFT && x > monitorRect.x + DRAG_DISTANCE) ||
            (this._side === St.Side.RIGHT && x < monitorRect.x + monitorRect.width - DRAG_DISTANCE))
            this.emit('activated');
        else
            this.cancel();
    }
}