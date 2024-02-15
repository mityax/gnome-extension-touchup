import '@girs/gnome-shell/extensions/global';
import St from "@girs/st-13";
import Clutter from "@girs/clutter-13";
import {AnyClass} from "@girs/gobject-2.0";

export function getStyle(widgetType: AnyClass = St.Widget, elementId: string = '', elementClass: string = '') {
    const ctx = St.ThemeContext.get_for_stage(global.stage as Clutter.Stage);
    const node = St.ThemeNode.new(
        ctx,
        null, /* parent node */
        ctx.get_theme(),
        //@ts-ignore
        widgetType, /* gtype */
        elementId, /* id */
        elementClass, /* class */
        '', /* pseudo class */
        ''); /* inline style */
    return node;
}


export function foregroundColorFor(color: Clutter.Color, opacity: number = 1) {
    return Clutter.Color.from_string(
        color.to_hls()[1] > 0.5
            ? `rgba(0,0,0,${opacity})`
            : `rgba(255,255,255,${opacity})`,
        )[1];
}


export function print(...text: any[]) {
    console.log("GJS:gnometouch:", ...text.map(item => {
        try {
            if (typeof item === 'object' || Array.isArray(item)) {
                return JSON.stringify(item);
            }
        } catch (e) {}
        return item;
    }));
}
