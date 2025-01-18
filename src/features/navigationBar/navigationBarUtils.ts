import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Meta from "gi://Meta";
import Clutter from "gi://Clutter";


/**
 * Tries to, as good as possible, approximate the expected effect of pressing a back button
 * or activating a back gesture as known from Android.
 *
 * @param props.virtualKeyboardDevice A Clutter.VirtualInputDevice instance that can be used to invoke
 *                                    keystrokes if necessary.
 * @param props.greedyMode Whether to more aggressively try to navigate back (default: false). If true,
 *                         this function will also close the focused window if it is not just a dialog
 *                         but a root window.
 */
export function navigateBack(props: {virtualKeyboardDevice?: Clutter.VirtualInputDevice, greedyMode?: boolean}): boolean | null {
    // Close OSK:
    if (Main.keyboard.visible) {
        Main.keyboard._keyboard
            ? Main.keyboard._keyboard.close(true)  // close with immediate = true
            : Main.keyboard.close()
        return true;
    }

    // Close apps overview:
    if (Main.overview.dash.showAppsButton.checked) {
        Main.overview.dash.showAppsButton.checked = false;
        return true;
    }

    // Close overview:
    if (Main.overview.visible) {
        Main.overview.hide();
        return true;
    }

    // None of these experiments work for adwaita either:
    const focusWindow = global.display.focus_window;

    // Unfullscreen the focused window
    if (focusWindow?.is_fullscreen()) {
        focusWindow.unmake_fullscreen();
        return true;
    }

    // Close popups, dialogs and (if greedyMode == true) other windows:
    if (focusWindow?.can_close()) {
        if (focusWindow.get_window_type() == Meta.WindowType.DIALOG
            || focusWindow.get_window_type() == Meta.WindowType.MODAL_DIALOG
            || focusWindow.get_window_type() == Meta.WindowType.MENU
            || focusWindow.get_window_type() == Meta.WindowType.DROPDOWN_MENU
            || focusWindow.get_window_type() == Meta.WindowType.POPUP_MENU
            || focusWindow.get_window_type() == Meta.WindowType.COMBO
            || focusWindow.get_window_type() == Meta.WindowType.DND
            || focusWindow.get_transient_for() !== null) {
            // Close the focused window:
            focusWindow.delete(global.get_current_time());
            return true;
        }
        if (props.greedyMode && focusWindow.get_window_type() == Meta.WindowType.NORMAL) {
            focusWindow.delete(global.get_current_time());
            //const focusApp = Shell.WindowTracker.get_default().focusApp;
            //focusApp.request_quit();
            return true;
        }
    }

    // Invoke Clutter.KEY_Back:
    if (props.virtualKeyboardDevice) {
        // Ideas: invoke "Alt + Left" keystroke (see: https://askubuntu.com/a/422448)
        //  or potentially "Esc", depending on context/active window/window type

        props.virtualKeyboardDevice.notify_keyval(Clutter.get_current_event_time() * 1000,
            Clutter.KEY_Back, Clutter.KeyState.PRESSED);
        props.virtualKeyboardDevice.notify_keyval(Clutter.get_current_event_time() * 1000,
            Clutter.KEY_Back, Clutter.KeyState.RELEASED);

        return null;
    }

    return false;
}


export function moveToWorkspace(direction: 'left' | 'right') {
    const wm = global.workspaceManager;

    if (direction == 'left' && wm.get_active_workspace_index() == 0) return;
    if (direction == 'right' && wm.get_active_workspace_index() == wm.get_n_workspaces() - 1) return;

    const ws = wm.get_active_workspace().get_neighbor(
        direction == 'left'
            ? Meta.MotionDirection.LEFT
            : Meta.MotionDirection.RIGHT
    );

    if (!ws.active) {
        ws.activate(global.get_current_time());
    }
}

