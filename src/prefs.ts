import Adw from "gi://Adw";
import {initSettings} from "$src/features/preferences/backend";
import {NavigationBarPage} from "$src/features/preferences/pages/navigationBarPage";
import {OskKeyPopupPage} from "$src/features/preferences/pages/oskKeyPopupPage";
import {ExtensionPreferences} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import St from "gi://St";


export default class GnomeTouchPreferences extends ExtensionPreferences {
    async fillPreferencesWindow(window: Adw.PreferencesWindow) {
        // @ts-ignore
        initSettings(this.getSettings());

        St;

        window.add(new NavigationBarPage());
        window.add(new OskKeyPopupPage());
    }
}

