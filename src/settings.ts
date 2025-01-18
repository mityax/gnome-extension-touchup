import {BoolSetting, EnumSetting, IntSetting, StringListSetting} from "./features/preferences/backend";


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

        /**
         * Which buttons to show on the left side of the button navigation bar
         *
         * Available choices are:
         *  - "keyboard" - keyboard open button
         *  - "workspace-previous" - switch to previous workspace
         *  - "workspace-next" - switch to next workspace
         *  - "overview" - open overview
         *  - "apps" - open apps overview
         *  - "back" - navigate back
         *  - "spacer" - adds a little space between buttons
         */
        buttonsLeft: new StringListSetting<
            "keyboard" | "workspace-previous" | "workspace-next" | "overview" | "apps" | "back" | "spacer"
        >('navigation-bar-buttons-left', ["keyboard"]),

        /**
         * Which buttons to show in the middle of the button navigation bar
         *
         * Available choices are:
         *  - "keyboard" - keyboard open button
         *  - "workspace-previous" - switch to previous workspace
         *  - "workspace-next" - switch to next workspace
         *  - "overview" - open overview
         *  - "apps" - open apps overview
         *  - "back" - navigate back
         *  - "spacer" - adds a little space between buttons
         */
        buttonsMiddle: new StringListSetting<
            "keyboard" | "workspace-previous" | "workspace-next" | "overview" | "apps" | "back" | "spacer"
        >('navigation-bar-buttons-middle', []),

        /**
         * Which buttons to show on the right side of the button navigation bar
         *
         * Available choices are:
         *  - "keyboard" - keyboard open button
         *  - "workspace-previous" - switch to previous workspace
         *  - "workspace-next" - switch to next workspace
         *  - "overview" - open overview
         *  - "apps" - open apps overview
         *  - "back" - navigate back
         *  - "spacer" - adds a little space between buttons
         */
        buttonsRight: new StringListSetting<
            "keyboard" | "workspace-previous" | "workspace-next" | "overview" | "apps" | "back" | "spacer"
        >('navigation-bar-buttons-right',
            ["workspace-previous", "workspace-next", "spacer", "apps", "overview", "back"]),
    },

    oskKeyPopups: {
        /**
         * Whether to enable the OSK key popup feature or not.
         */
        enabled: new BoolSetting('osk-key-popups-enabled', true),
        /**
         * How long to show the OSK key popups for (in milliseconds).
         */
        duration: new IntSetting('osk-key-popups-duration', 35, 15, 250),
    },

    screenRotateUtils: {
        /**
         * Whether to show a floating screen rotate button when Gnome's auto-rotate setting is disabled,
         * and the device is physically rotated.
         *
         * Note: This has no effect if the device does not have an accelerometer.
         */
        floatingScreenRotateButtonEnabled: new BoolSetting('screen-rotate-utils-floating-screen-rotate-button-enabled', true),
    },

    notificationGestures: {
        /**
         * Whether to enable touchscreen gestures for notifications or not.
         */
        enabled: new BoolSetting('notification-gestures-enabled', true),
    },

    virtualTouchpad: {
        /**
         * Whether to enable the virtual touchpad feature or not.
         */
        enabled: new BoolSetting('virtual-touchpad-enabled', true),
    }
}

