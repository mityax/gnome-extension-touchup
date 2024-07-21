import Clutter from "@girs/clutter-14";


export function css(v: any): string | null {
    let res: string | null = null;

    if (['string', 'number'].indexOf(typeof v) !== -1) {
        res = v.toString();
    } else if (v instanceof Clutter.Color) {
        res = `rgba(${v.red}, ${v.green}, ${v.blue}, ${v.alpha / 255.0})`;
    } else if (Array.isArray(v)) {
        res = v.map(x => css(x)).join(" ");
    } else if (typeof v === 'object') {
        res = "";
        for (let prop in v) {
            if (Object.hasOwn(v, prop)) {
                // Convert camelCase to kebab-case:
                const cssPropName = prop.replace(/[A-Z]+(?![a-z])|[A-Z]/g, ($, ofs) => (ofs ? "-" : "") + $.toLowerCase())

                res += cssPropName + ": " + css(v[prop]) + "; ";
            }
        }
    } else {
        log(`Warning: cannot convert \`${typeof v}\` to CSS: `, v);
        res = v.toString();
    }

    return !!res ? res.trim() : null;
}
