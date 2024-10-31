import {ExtensionPreferences} from "@girs/gnome-shell/extensions/prefs";
import Adw from "@girs/adw-1";
import {initSettings} from "./features/preferences/backend";


export default class GnomeTouchPreferences extends ExtensionPreferences {
    async fillPreferencesWindow(window: Adw.PreferencesWindow) {
        // @ts-ignore
        initSettings(this.getSettings());
    }
}

