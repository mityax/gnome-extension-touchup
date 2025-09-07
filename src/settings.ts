import {
    BoolSetting,
    EnumSetting,
    IntSetting,
    JSONSetting,
    StringListSetting,
    StringSetting
} from "./features/preferences/backend";


// NOTE: the doc comments in the following structure will be automatically included in the GSettings schema
// during the build process.

export const settings = {
    navigationBar: {
        /**
         * Whether to enable the navigation bar feature or not.
         */
        enabled: new BoolSetting('navigation-bar-enabled', true),

        /**
         * If true, the navigation bar will be shown even if the Shell is not in touch mode. If false, the
         * navigation bar will be shown only in touch mode.
         */
        ignoreTouchMode: new BoolSetting('navigation-bar-ignore-touch-mode', false),

        /**
         * When set, and the chosen monitor is connected, the navigation bar is shown on that monitor instead
         * of the built-in monitor. When the chosen monitor is not connected, no navigation bar will be shown.
         */
        monitor: new JSONSetting<{name: string, id: string} | null>('navigation-bar-monitor', null),

        /**
         * When enabled, the primary monitor is automatically changed to the monitor the navigation bar
         * is placed on, as long as it's visible.
         */
        primaryMonitorFollowsNavbar: new BoolSetting('navigation-bar-primary-monitor-follows-navbar', true),

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
         * Whether to hide to navigation bar gesture hint entirely.
         */
        gesturesInvisibleMode: new EnumSetting<'never' | 'when-not-in-touch-mode' | 'always'>('navigation-bar-gestures-invisible-mode', 'never'),

        /**
         * Factor by which the overview gesture base distance is scaled (i.e. the bigger this factor, the
         * longer the required swipe distance for opening overview/app grid).
         */
        gesturesBaseDistFactor: new IntSetting('navigation-bar-gestures-base-dist-factor', 2, 1, 10),

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

    overviewGestures: {
        /**
         * Whether to enable the overview gestures feature or not.
         */
        enabled: new BoolSetting('overview-gestures-enabled', true),
    },

    osk: {
        keyPopups: {
            /**
             * Whether to enable the OSK key popup feature or not.
             */
            enabled: new BoolSetting('osk-key-popups-enabled', true),

            /**
             * How long to show the OSK key popups for (in milliseconds).
             */
            duration: new IntSetting('osk-key-popups-duration', 35, 15, 250),
        },

        gestures: {
            swipeToClose: {
                /**
                 * Whether to enable the swipe-to-close OSK gesture or not.
                 */
                enabled: new BoolSetting('osk-gestures-swipe-to-close-enabled', true),
            },

            extendKeys: {
                /**
                 * Whether to (virtually, not visibly) extend keys, i.e. allow taps close by an
                 * OSK key to also be registered as a key press.
                 */
                enabled: new BoolSetting('osk-gestures-extend-keys-enabled', true),
            }
        }
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
    },

    donations: {
        installationData: new StringSetting('donations-installation-data', "{}"),
    },

    /**
     * The initial page to show when the extension preferences are opened the next time.
     */
    initialPreferencesPage: new EnumSetting<'donations' | 'default'>('preferences-initial-page', 'default'),
}

