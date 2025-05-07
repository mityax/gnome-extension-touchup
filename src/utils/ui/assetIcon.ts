import Gio from "gi://Gio";
import GObject from "gi://GObject";
import {assetPath} from "$src/config";
import {assert} from "$src/utils/logging";


export class AssetIcon extends Gio.FileIcon {
    static {
        GObject.registerClass(this);
    }

    constructor(iconName: string) {
        DEBUG: assert(
            Gio.File.new_for_uri(assetPath.icon(iconName)).query_exists(null),
            `Icon resource for '${iconName}' does not exist: ${assetPath.icon(iconName)}`
        );

        super({
            file: Gio.File.new_for_uri(assetPath.icon(iconName)),
        });
    }
}
