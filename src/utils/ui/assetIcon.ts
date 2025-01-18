import Gio from "gi://Gio";
import GObject from "gi://GObject";
import {assetPath} from "$src/config.ts";


export class AssetIcon extends Gio.FileIcon {
    static {
        GObject.registerClass(this);
    }

    constructor(iconName: string) {
        super({
            file: Gio.File.new_for_uri(assetPath.icon(iconName)),
        });
    }
}
