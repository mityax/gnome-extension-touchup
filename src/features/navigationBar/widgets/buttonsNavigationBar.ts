import BaseNavigationBar from "./baseNavigationBar";
import St from "@girs/st-15";
import {Widgets} from "$src/utils/ui/widgets";
import * as Main from '@girs/gnome-shell/ui/main';
import {log} from "$src/utils/logging";
import Graphene from "@girs/graphene-1.0";


export default class ButtonsNavigationBar extends BaseNavigationBar<St.BoxLayout> {
    constructor() {
        super({
            actor: new Widgets.Row({
                name: 'gnometouch-navbar',
                styleClass: 'gnometouch-navbar bottom-panel',
                children: [
                    // Left side:
                    new Widgets.Row({
                        xExpand: false,

                    }),
                    // Center:
                    new Widgets.Row({
                        xExpand: true,
                    }),
                    // Right side:
                    new Widgets.Row({
                        xExpand: false,
                        children: [
                            new Widgets.Button({
                                name: 'gnometouch-navbar__overview-button',
                                styleClass: 'gnometouch-navbar__button',
                                iconName: 'open-menu-symbolic',
                                connect: {
                                    'clicked': () => Main.overview.toggle(),
                                }
                            }),
                            new Widgets.Button({
                                name: 'gnometouch-navbar__back-button',
                                styleClass: 'gnometouch-navbar__button',
                                iconName: 'media-playback-start-symbolic',  // TODO: replace with a proper icon
                                scaleX: -1,  // flip the icon (ugly)
                                pivotPoint: new Graphene.Point({x: 0.5, y: 0.5}),
                                connect: {
                                    'clicked': () => this._goBack(),
                                }
                            }),
                        ]
                    }),
                ]
            }),
            reserveSpace: true,
        });
    }

    protected onIsWindowNearChanged(isWindowNear: boolean): void {
        if (isWindowNear && !Main.overview.visible) {
            // Make navbar opaque (black or white, based on shell theme brightness):
            this.actor.remove_style_class_name('gnometouch-navbar--transparent');
        } else {
            // Make navbar transparent:
            this.actor.add_style_class_name('gnometouch-navbar--transparent');
        }
    }

    private _goBack() {
        if (Main.overview.visible) {
            Main.overview.hide();
        } else {
            // TODO: invoke "Alt + Left" keystroke (see: https://askubuntu.com/a/422448)
            //  or potentially "Esc", depending on context
            log("Back button pressed");
        }
    }
}
