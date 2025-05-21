import Adw from "gi://Adw";
import GObject from "gi://GObject";
import Gtk from "gi://Gtk";
import {buildPreferencesGroup} from "$src/features/preferences/uiUtils";
import {randomChoice} from "$src/utils/utils";
import Gio from "gi://Gio";
import Pango from "gi://Pango";
import {donationPlatforms, feedbackPlatforms} from "$src/config";


export class DonationsPage extends Adw.PreferencesPage {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super({
            name: 'donations',
            title: "Support",
            icon_name: 'emote-love-symbolic',
        });

        this.add(buildPreferencesGroup({
            title: '',
            children: [
                this.buildInfoBox(),
            ]
        }));
        this.add(buildPreferencesGroup({
            title: 'Support by Donation',
            description: 'Choose a platform below to make a donation – even a dollar a month helps!',
            children: [
                this.buildDonateOptions(),
            ],
        }));
        this.add(buildPreferencesGroup({
            title: 'Leave Feedback or Ideas',
            description: 'Do you like TouchUp? Leave your feedback, rating or ideas!',
            children: this.buildFeedbackCards(),
        }));
    }

    private buildInfoBox() {
        const box = new Gtk.Box({
            cssClasses: ['callout', 'card' /*, 'callout--green'*/],
            orientation: Gtk.Orientation.VERTICAL,
        });

        box.append(new Gtk.Label({
            cssClasses: ['title-2'],
            halign: Gtk.Align.START,
            label: randomChoice([
                'The Mission', 'Why should I donate?', 'What we believe in'
            ]),
        }));

        box.append(new Gtk.Label({
            wrap: true,
            naturalWrapMode: Gtk.NaturalWrapMode.WORD,
            hexpand: true,
            label:
                'Mobile platforms are dominated by big tech oligarchs, and Gnome itself is tough to use on touch ' +
                'devices in everyday life. TouchUp helps improve Gnome’s usability on touchscreen devices and ' +
                'makes it a viable, free alternative: tablet users are no longer forced to sacrifice user experience ' +
                'for freedom, control and privacy.\n\nBy donating, you’re supporting a project that helps users regain ' +
                'control over their own devices and gives them another option than profit-driven ecosystems. ' +
                'Every contribution – be it code, monetary, suggestions or feedback – helps keep open software ' +
                'such as TouchUp competitive and accessible.\n\nThank you for making a difference! ❤️'
        }));

        return box;
    }

    private buildDonateOptions() {
        const box = new Gtk.FlowBox({
            orientation: Gtk.Orientation.HORIZONTAL,
            column_spacing: 10,
            row_spacing: 10,
            selectionMode: Gtk.SelectionMode.NONE,
            homogeneous: true,
        });

        for (let p of donationPlatforms) {
            const card = new Gtk.Box({
                cssClasses: ['card', 'padding-normal', 'donations-page__donation-option'],
                orientation: Gtk.Orientation.VERTICAL,
            });

            card.append(new Gtk.Label({ label: p.name, cssClasses: ['donations-page__donation-option__title'] }));

            if (p.recommended) {
                card.add_css_class('donations-page__donation-option--recommended');
                card.append(new Gtk.Label({
                    label: '★ recommended',
                    halign: Gtk.Align.CENTER,
                    cssClasses: ['donations-page__donation-option__badge'],
                }));
            }

            card.append(new Gtk.Label({
                label: p.description,
                cssClasses: ['body'],
                wrapMode: Pango.WrapMode.WORD_CHAR,
                wrap: true,
                justify: Gtk.Justification.CENTER,
                maxWidthChars: 10,
                vexpand: true,
            }));

            const btn = new Gtk.Button({ label: `Use ${p.name}`, halign: Gtk.Align.CENTER });
            btn.connect('clicked', () => Gio.AppInfo.launch_default_for_uri(p.url, null));
            card.append(btn);

            box.append(card);
        }

        return box;
    }

    private buildFeedbackCards() {
        const res = [];

        for (let r of feedbackPlatforms) {
            const card = new Gtk.Box({
                cssClasses: ['card', 'padding-normal'],
                marginBottom: 10,
                orientation: Gtk.Orientation.HORIZONTAL,
            });
            card.append(new Gtk.Label({ label: r.title }));
            card.append(new Gtk.Separator({ hexpand: true, cssClasses: ['spacer'] }));
            const btn = new Gtk.Button({ label: r.buttonLabel });
            btn.connect('clicked', () => Gio.AppInfo.launch_default_for_uri(r.url, null));
            card.append(btn);
            res.push(card);
        }

        return res;
    }
}
