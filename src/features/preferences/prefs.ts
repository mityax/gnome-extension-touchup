import Adw from "gi://Adw";
import {initSettings} from "$src/features/preferences/backend";
import {NavigationBarPage} from "$src/features/preferences/pages/navigationBarPage";
import {OskKeyPopupPage} from "$src/features/preferences/pages/oskKeyPopupPage";
import {ExtensionPreferences} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import {DonationsPage} from "$src/features/preferences/pages/donationsPage.ts";
import Gtk from "gi://Gtk";
import Gdk from "@girs/gdk-4.0";


export default class GnomeTouchPreferences extends ExtensionPreferences {
    async fillPreferencesWindow(window: Adw.PreferencesWindow) {
        // @ts-ignore
        initSettings(this.getSettings());

        // const assets = Gio.resource_load(this.dir.get_child(assetsGResourceFile).get_path()!);
        // Gio.resources_register(assets);

        this.loadCss();
        Gtk.Settings.get_default()?.connect('notify::gtk-application-prefer-dark-theme', () => this.loadCss())

        window.add(new NavigationBarPage());
        window.add(new OskKeyPopupPage());
        window.add(new DonationsPage());
    }

    loadCss() {
        const display = Gdk.Display.get_default()!
        const settings = Gtk.Settings.get_for_display(display);

        const cssProvider = new Gtk.CssProvider();
        const cssFile = this.dir.get_child(
            settings.gtk_application_prefer_dark_theme
                ? 'prefs-dark.css'
                : 'prefs-light.css');
        cssProvider.load_from_file(cssFile);

        Gtk.StyleContext.add_provider_for_display(
            display,
            cssProvider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        );
    }
}