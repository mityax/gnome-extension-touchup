import {BoolSetting, EnumSetting} from "./backend";


// NOTE: the doc comments in the following structure will be automatically included in the GSettings schema
// during the build process.

export const settings = {
    navigationBar: {
        /**
         * Whether to enable the navigation bar feature or not.
         */
        enabled: new BoolSetting('navigation-bar-enabled', true),

        /**
         * Navigation bar mode – whether to use a small gesture navigation bar or a more old school
         * navigation bar with buttons.
         */
        mode: new EnumSetting<'gestures' | 'buttons'>('navigation-bar-mode', 'gestures'),

        /**
         * Whether to reserve space for the navigation bar or overlay it over the work area.
         * This setting has no effect when the navigation bar mode is set to "buttons".
         */
        gesturesReserveSpace: new BoolSetting('navigation-bar-gestures-reserve-space', true),
    },

    oskKeyPopups: {
        /**
         * Whether to enable the OSK key popup feature or not.
         */
        enabled: new BoolSetting('osk-key-popups-enabled', true),
    }
}

