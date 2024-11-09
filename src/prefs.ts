import {ExtensionPreferences} from "@girs/gnome-shell/extensions/prefs";
import Adw from "@girs/adw-1";
import {initSettings} from "./features/preferences/backend";
import {NavigationBarPage} from "./features/preferences/pages/navigationBarPage";
import {OskKeyPopupPage} from "./features/preferences/pages/oskKeyPopupPage";


export default class GnomeTouchPreferences extends ExtensionPreferences {
    async fillPreferencesWindow(window: Adw.PreferencesWindow) {
        // @ts-ignore
        initSettings(this.getSettings());

        window.add(new NavigationBarPage());
        window.add(new OskKeyPopupPage());
    }
}

