import Adw from "gi://Adw";
import GObject from "gi://GObject";
import Gtk from "gi://Gtk";
import {buildPreferencesGroup} from "$src/features/preferences/uiUtils.ts";
import {randomChoice} from "$src/utils/utils.ts";
import NaturalWrapMode = Gtk.NaturalWrapMode;
import Orientation = Gtk.Orientation;
import Align = Gtk.Align;


export class DonationsPage extends Adw.PreferencesPage {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super({
            title: "Support",
            icon_name: 'emblem-favorite-symbolic',
        });

        this.add(buildPreferencesGroup({
            title: 'Support GnomeTouch',
            children: [
                this.buildInfoBox(),
            ]
        }));
    }

    private buildInfoBox() {
        const box = new Gtk.Box({
            cssClasses: ['callout', 'callout--green'],
            orientation: Orientation.VERTICAL,
        });

        box.append(new Gtk.Label({
            cssClasses: ['title-2'],
            halign: Align.START,
            label: randomChoice([
                'Our Mission', 'Why should I donate?', 'What we believe in'
            ]),
        }));

        box.append(new Gtk.Label({
            wrap: true,
            naturalWrapMode: NaturalWrapMode.WORD,
            hexpand: true,
            label:
                'Mobile platforms are dominated by corporate-controlled systems, and GNOME itself is tough to use on ' +
                'touch devices in everyday life. This extension helps improve GNOME’s usability on tablets, making it ' +
                'a more viable option for touch-based devices. By donating, you’re supporting a project that values ' +
                'freedom and user choice over profit-driven ecosystems.\n\nEvery contribution helps keep open ' +
                'platforms competitive and accessible — thank you for making a difference! ❤️'
        }));

        return box;
    }
}
