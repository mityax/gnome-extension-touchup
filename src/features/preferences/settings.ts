import {BoolSetting, EnumSetting} from "./backend";


// NOTE: the doc comments in the following structure are potentially user-facing and should be formulated accordingly.

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
    },
    oskKeyPopups: {
        /**
         * Whether to enable the OSK key popup feature or not.
         */
        enabled: new BoolSetting('osk-key-popups-enabled', true),
    }
}

