import ExtensionFeature from "$src/core/extensionFeature";
import {PatchManager} from "$src/core/patchManager";

//@ts-ignore
import * as Keyboard from 'resource:///org/gnome/shell/ui/keyboard.js';
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import Clutter from "gi://Clutter";
import * as Widgets from "$src/utils/ui/widgets";
import GLib from "gi://GLib";
import Shell from "gi://Shell";
import Meta from "gi://Meta";
import St from "gi://St";
import Pango from "gi://Pango";
import {clamp} from "$src/utils/utils";


const BUTTON_VISIBILITY_DURATION_AFTER_CLIPBOARD_CHANGE = 3 * 60;  // in seconds



export class OSKQuickPasteAction extends ExtensionFeature {
    private _lastClipboardChange: number = -1;
    private _virtualKeyboard: Clutter.VirtualInputDevice;

    constructor(pm: PatchManager, keyboard: Keyboard.Keyboard | null) {
        super(pm);

        // Listen to clipboard changes:
        const selection = Shell.Global.get().get_display().get_selection();
        this.pm.connectTo(selection, "owner-changed", (_, selectionType, sourceMemory) => {
            const isUserCaused = sourceMemory.constructor.name.includes("Wayland");

            if (selectionType === Meta.SelectionType.SELECTION_CLIPBOARD && isUserCaused) {
                this._lastClipboardChange = GLib.get_real_time();
            }
        });

        // To emit the "paste" keyboard events:
        this._virtualKeyboard = Clutter
                .get_default_backend()
                .get_default_seat()
                .create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);

        if (keyboard !== null) {
            this.onNewKeyboard(keyboard);
        }
    }

    onNewKeyboard(keyboard: Keyboard.Keyboard | null) {
        const keyboardRef = new Widgets.Ref(keyboard as Keyboard.Keyboard & Clutter.Actor);  // use a ref to only clean up if the keyboard hasn't been destroyed

        // Setup our new top bar:
        const pasteButton = new Widgets.Ref<Widgets.Button>();
        const pasteButtonLabel = new Widgets.Ref<Widgets.Label>();

        const topBar = new Widgets.Row({  // use Row for left-align
            xAlign: Clutter.ActorAlign.CENTER,
            children: [
                new Widgets.Button({
                    styleClass: "touchup-quick-paste-button keyboard-key default-key",  // inherit default keyboard key styling through `keyboard-key` and `default-key`
                    ref: pasteButton,
                    onClicked: () => {
                        void this._triggerPaste();
                        showButtonPatch.disable();
                    },
                    child: new Widgets.Row({
                        children: [
                            new Widgets.Icon({ iconName: 'edit-paste-symbolic' }),
                            new Widgets.Label({
                                ref: pasteButtonLabel,
                                onCreated: label => {
                                    label.clutterText.singleLineMode = true;
                                    label.clutterText.ellipsize = Pango.EllipsizeMode.END;
                                },
                            }),
                        ]
                    }),
                }),
            ],
        });

        this.pm.connectTo(keyboard._aspectContainer as Clutter.Actor, 'notify::allocation', (aspectContainer) => {
            topBar.width = aspectContainer.width;
        });
        this.pm.connectTo(topBar, 'notify::mapped', (aspectContainer) => {
            topBar.width = aspectContainer.width;
        });

        // Create a patch to dynamically add/remove the topBar to/from the keyboard:
        const showButtonPatch = this.pm.registerPatch(() => {
            keyboard._suggestions.clear();
            keyboard._suggestions.insert_child_at_index(topBar, 0);
            return () => {
                if (topBar.get_parent())
                    keyboardRef.current?._suggestions.remove_child(topBar);
            };
        });

        this.pm.connectTo(keyboard._suggestions as Clutter.Actor, 'child-added', () => {
            showButtonPatch.disable();
        });

        this.pm.connectTo(keyboard as Clutter.Actor, "visibility-changed", async () => {
            const lastClipboardChange = (GLib.get_real_time() - this._lastClipboardChange) / 1000 / 1000;

            if (Main.keyboard.visible && lastClipboardChange <= BUTTON_VISIBILITY_DURATION_AFTER_CLIPBOARD_CHANGE) {
                // Check whether clipboard content is marked as secret:
                const mimeTypes = St.Clipboard.get_default().get_mimetypes(St.ClipboardType.CLIPBOARD);
                const isSecret = mimeTypes.some(m => m === 'x-kde-passwordManagerHint' || m.includes('secret'));

                // If there's no plaintext in the clipboard, don't show the button:
                if (!mimeTypes.some(m => m.split(";", 1)[0] === "text/plain")) return;

                // Update the button label and show it:
                pasteButtonLabel.current!.text = this._createButtonDisplayText(await get_clipboard_text(), isSecret);
                showButtonPatch.enable();
            } else {
                // Hide the button, if it's visible:
                showButtonPatch.disable();
            }
        });
    }

    private _triggerPaste() {
        const time = Clutter.get_current_event_time();

        if (Main.inputMethod.contentPurpose === Clutter.InputContentPurpose.TERMINAL) {
            // Emit `Ctrl + Shift + Insert`
            this._virtualKeyboard.notify_keyval(time, Clutter.KEY_Control_L, Clutter.KeyState.PRESSED);
            this._virtualKeyboard.notify_keyval(time, Clutter.KEY_Shift_L, Clutter.KeyState.PRESSED);
            this._virtualKeyboard.notify_keyval(time, Clutter.KEY_Insert, Clutter.KeyState.PRESSED);
            this._virtualKeyboard.notify_keyval(time, Clutter.KEY_Insert, Clutter.KeyState.RELEASED);
            this._virtualKeyboard.notify_keyval(time, Clutter.KEY_Shift_L, Clutter.KeyState.RELEASED);
            this._virtualKeyboard.notify_keyval(time, Clutter.KEY_Control_L, Clutter.KeyState.RELEASED);
        } else {
            // Emit `Shift + Insert`
            this._virtualKeyboard.notify_keyval(time, Clutter.KEY_Shift_L, Clutter.KeyState.PRESSED);
            this._virtualKeyboard.notify_keyval(time, Clutter.KEY_Insert, Clutter.KeyState.PRESSED);
            this._virtualKeyboard.notify_keyval(time, Clutter.KEY_Insert, Clutter.KeyState.RELEASED);
            this._virtualKeyboard.notify_keyval(time, Clutter.KEY_Shift_L, Clutter.KeyState.RELEASED);
        }
    }

    private _createButtonDisplayText(text: string, isSecret: boolean): string {
        if (isSecret) {
            return "•".repeat(clamp(text.length, 5, 15));
        } else {
            // Replace everything after first line break by ellipsis:
            return text.replace(/\n.*$/s, "…");
        }
    }
}


/** A promisified wrapper around `St.Clipboard.get_default().get_text()`  */
async function get_clipboard_text(): Promise<string> {
    return new Promise((resolve) => {
        St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (clipboard, text) => {
            resolve(text);
        });
    });
}
