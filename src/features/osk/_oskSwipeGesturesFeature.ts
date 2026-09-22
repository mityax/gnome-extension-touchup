//@ts-ignore
import * as Keyboard from 'resource:///org/gnome/shell/ui/keyboard.js';
//@ts-ignore
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import St from "gi://St";

import ExtensionFeature from "$src/core/extensionFeature";
import {PatchManager} from "$src/core/patchManager";
import {settings} from "$src/settings";
import {clamp} from "$src/utils/utils";
import {isKeyboardKey} from "$src/features/osk/_oskUtils";


type KeyboardKey = Keyboard.Key & St.BoxLayout;  // the `Key` class is not exported by the Shell

/** The key a swipe can start on. */
type SwipeKind = 'space' | 'delete';

/** Minimum horizontal drag before a swipe takes over from the key's normal behaviour. */
const MIN_DRAG_DISTANCE = 12;  // in logical pixels
/** How many characters a full slide across the space bar covers. */
const SPACE_CHARS_ACROSS = 30;
const SPACE_MIN_STEP = 12;  // in logical pixels
/** How many words a full slide across the backspace key covers. */
const DELETE_WORDS_ACROSS = 8;
const DELETE_MIN_STEP = 20;  // in logical pixels

const TERMINAL_WORD_DELETE_KEYVAL = Clutter.KEY_w;  // readline's word-rubout


type SwipeGesture = {
    key: KeyboardKey;
    kind: SwipeKind;
    slot: number | null;
    startX: number;
    /** Pixels of horizontal drag per cursor step (space) / deleted word (backspace). */
    step: number;
    appliedSteps: number;
    dragging: boolean;
    /** Space bar only: whether a second-finger tap turned on text selection. */
    selecting: boolean;
    /** Backspace only: whether the key's long-press repeat has been stopped. */
    longPressStopped: boolean;
};


/**
 * Gboard/iOS-style swipes on the OSK:
 *
 *  - sliding across the space bar moves the text cursor; tapping anywhere with a second
 *    finger while sliding toggles text selection, so the swiped range becomes selected;
 *  - sliding left across the backspace key selects whole words and deletes the selection
 *    when the swipe is released.
 *
 * A tap on either key keeps its normal behaviour (a space / a one-character delete).
 *
 * This is implemented on the keyboard's captured event stream rather than with
 * [Clutter.PanGesture]s on the keys, because:
 *  - the two-finger tap can land on any key, so it has to be observed keyboard-wide;
 *  - the OSK keys consume raw touch events, which conflicts with per-key gestures.
 */
export class OskSwipeGesturesFeature extends ExtensionFeature {
    private subpm: PatchManager | null = null;
    private keyboard: Keyboard.Keyboard | null = null;
    private readonly virtualKeyboard: Clutter.VirtualInputDevice;
    private gesture: SwipeGesture | null = null;
    /** Slots of extra fingers whose events we swallowed and still need to swallow. */
    private readonly straySlots = new Set<number>();

    constructor(pm: PatchManager, keyboard: Keyboard.Keyboard | null) {
        super(pm);

        this.virtualKeyboard = global.stage.context
            .get_backend()
            .get_default_seat()
            .create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);

        if (keyboard != null) {
            this.onNewKeyboard(keyboard);
        }

        // Recreate our patches whenever the keyboard is rebuilt:
        const self = this;
        this.pm.appendToMethod(Keyboard.Keyboard.prototype, '_init', function (this: Keyboard.Keyboard) {
            self.onNewKeyboard(this);
        });
    }

    public onNewKeyboard(keyboard: Keyboard.Keyboard) {
        this.keyboard = keyboard;
        this._patchKeyboard();
    }

    private _patchKeyboard() {
        // Use a separate [PatchManager] per keyboard, destroyed here, so we never patch a
        // keyboard twice:
        this.subpm?.destroy();
        this.subpm = this.pm.fork();

        this.gesture = null;
        this.straySlots.clear();

        // Note: this handler is connected after the one from [OSKGesturesFeature] (which is
        // defined before this feature), so swallowing an event here does not rob it of the
        // event it needs for its own bookkeeping.
        this.subpm.connectTo(this.keyboard!, 'captured-event', (_: unknown, evt: Clutter.Event) =>
            this._onCapturedEvent(evt));
    }

    private _onCapturedEvent(evt: Clutter.Event): boolean {
        const type = evt.type();
        const isBegin = type === Clutter.EventType.TOUCH_BEGIN || type === Clutter.EventType.BUTTON_PRESS;
        const isUpdate = type === Clutter.EventType.TOUCH_UPDATE || type === Clutter.EventType.MOTION;
        const isEnd = type === Clutter.EventType.TOUCH_END || type === Clutter.EventType.BUTTON_RELEASE;
        const isCancel = type === Clutter.EventType.TOUCH_CANCEL;

        if (!isBegin && !isUpdate && !isEnd && !isCancel) return Clutter.EVENT_PROPAGATE;

        const slot = this._slotOf(evt);

        // A second finger we already swallowed: keep swallowing its tail (updates, release),
        // so the key it landed on never sees a stray release and triggers its action.
        if (slot !== null && this.straySlots.has(slot)) {
            if (isEnd || isCancel) this.straySlots.delete(slot);
            return Clutter.EVENT_STOP;
        }

        const gesture = this.gesture;

        if (gesture) {
            const sameFinger = gesture.slot === null || slot === null || slot === gesture.slot;

            if (!sameFinger) {
                // Events from another finger while a drag is in progress: swallow them so the
                // key underneath is never pressed. On a space swipe the tap toggles selection.
                if (gesture.dragging) {
                    if (isBegin && slot !== null) {
                        this.straySlots.add(slot);
                        if (gesture.kind === 'space') this._toggleSelection(gesture);
                    }
                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;
            }

            if (isUpdate) {
                this._updateGesture(evt);
                return Clutter.EVENT_PROPAGATE;
            }

            if (isCancel) {
                this._endGesture(false);
                return Clutter.EVENT_PROPAGATE;
            }

            if (isEnd) {
                const dragging = gesture.dragging;
                this._endGesture(true);
                // Swallow the release so the key does not also act on it.
                return dragging ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
            }

            return Clutter.EVENT_PROPAGATE;
        }

        if (!isBegin) return Clutter.EVENT_PROPAGATE;

        const key = this._keyAt(evt);
        if (key == null) return Clutter.EVENT_PROPAGATE;

        const kind = this._kindOf(key);
        if (kind == null) return Clutter.EVENT_PROPAGATE;

        if (kind === 'space' && settings.osk.swipeGestures.spaceAction.get() !== 'cursor') {
            return Clutter.EVENT_PROPAGATE;
        }
        if (kind === 'delete' && !settings.osk.swipeGestures.backspace.get()) {
            return Clutter.EVENT_PROPAGATE;
        }

        const [x] = evt.get_coords();
        this.gesture = {
            key,
            kind,
            slot,
            startX: x,
            step: this._stepFor(key, kind),
            appliedSteps: 0,
            dragging: false,
            selecting: false,
            longPressStopped: false,
        };

        // Let the key handle the press itself (active state, long press). Only a drag takes
        // the gesture over.
        return Clutter.EVENT_PROPAGATE;
    }

    private _slotOf(evt: Clutter.Event): number | null {
        try {
            const sequence = evt.get_event_sequence();
            return sequence ? sequence.get_slot() : null;
        } catch {
            return null;
        }
    }

    /** Returns the OSK key the event was aimed at, if any. */
    private _keyAt(evt: Clutter.Event): KeyboardKey | null {
        const [x, y] = evt.get_coords();
        let actor: Clutter.Actor | null = (global.stage as Clutter.Stage)
            .get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);

        while (actor != null && actor !== this.keyboard) {
            if (isKeyboardKey(actor)) return actor as KeyboardKey;
            actor = actor.get_parent();
        }

        return null;
    }

    private _kindOf(key: KeyboardKey): SwipeKind | null {
        if (key.keyButton.label === ' ') return 'space';
        // The backspace key is the only key using this icon in every shipped OSK layout:
        if ((key as any)._icon?.icon_name === 'osk-delete-symbolic') return 'delete';
        return null;
    }

    /** Pixels of horizontal drag per step (cursor character / deleted word). */
    private _stepFor(key: KeyboardKey, kind: SwipeKind): number {
        let keyWidth = 0;
        try {
            [keyWidth] = key.get_transformed_size();
        } catch {
            keyWidth = 0;
        }
        if (!keyWidth) keyWidth = key.width || 0;

        const [minStep, unitsAcross] = kind === 'delete'
            ? [DELETE_MIN_STEP, DELETE_WORDS_ACROSS]
            : [SPACE_MIN_STEP, SPACE_CHARS_ACROSS];

        const base = keyWidth > 0 ? Math.max(minStep, keyWidth / unitsAcross) : minStep;
        const sensitivity = clamp(settings.osk.swipeGestures.sensitivity.get(), 1, 10);

        return base * (5 / sensitivity);
    }

    private _updateGesture(evt: Clutter.Event) {
        const gesture = this.gesture;
        if (gesture == null) return;

        const [x] = evt.get_coords();
        const totalDx = x - gesture.startX;

        // Ignore jitter before the swipe starts; until then a release still acts like a tap.
        if (gesture.appliedSteps === 0 && Math.abs(totalDx) < MIN_DRAG_DISTANCE) return;

        // Holding the backspace key starts its own character-repeat after 250ms; stop that so
        // it cannot fight the swipe.
        if (gesture.kind === 'delete' && !gesture.longPressStopped) {
            gesture.longPressStopped = true;
            this._stopDeleteRepeat(gesture.key);
        }

        if (gesture.kind === 'delete') {
            // Only leftward movement selects, and the selection never grows back when the
            // finger returns to the right of the furthest point reached.
            const steps = Math.max(0, Math.trunc(-totalDx / gesture.step));
            const delta = steps - gesture.appliedSteps;
            if (delta === 0) return;

            gesture.dragging = true;
            gesture.appliedSteps = steps;
            this._extendWordSelection(delta);
            return;
        }

        const steps = Math.trunc(totalDx / gesture.step);
        const delta = steps - gesture.appliedSteps;
        if (delta === 0) return;

        gesture.dragging = true;
        gesture.appliedSteps = steps;

        if (gesture.selecting) {
            const keyval = delta > 0 ? Clutter.KEY_Right : Clutter.KEY_Left;
            this._sendKeys([Clutter.KEY_Shift_L, keyval], Math.abs(delta));
        } else {
            const keyval = delta > 0 ? Clutter.KEY_Right : Clutter.KEY_Left;
            this._sendKeys([keyval], Math.abs(delta));
        }
    }

    /**
     * A second finger tapped the keyboard while the space-bar swipe is active: toggle between
     * moving the cursor and selecting text.
     *
     * Turning selection on rewinds the cursor to where the swipe started and re-applies the
     * same movement with Shift held, so everything swiped so far becomes selected and the
     * caret stays under the finger. Turning it off collapses the selection without moving the
     * caret.
     */
    private _toggleSelection(gesture: SwipeGesture) {
        const steps = gesture.appliedSteps;

        if (gesture.selecting) {
            if (steps !== 0) {
                const collapse = steps > 0 ? Clutter.KEY_Right : Clutter.KEY_Left;
                this._sendKeys([collapse], 1);
            }
            gesture.selecting = false;
            return;
        }

        if (steps !== 0) {
            const rewind = steps > 0 ? Clutter.KEY_Left : Clutter.KEY_Right;
            const forward = steps > 0 ? Clutter.KEY_Right : Clutter.KEY_Left;
            this._sendKeys([rewind], Math.abs(steps));
            this._sendKeys([Clutter.KEY_Shift_L, forward], Math.abs(steps));
        }

        gesture.selecting = true;
    }

    private _endGesture(commit: boolean) {
        const gesture = this.gesture;
        this.gesture = null;
        if (gesture == null || !gesture.dragging) return;

        // The key is still pressed because the release is swallowed; cancel it so it does not
        // act later. Clearing `_pressed` is what stops the commit (`Key._release()` checks it)
        // — `cancel()` alone does not.
        try {
            (gesture.key as any)._pressed = false;
            gesture.key.cancel();
            gesture.key.keyButton.remove_style_pseudo_class('active');

            if (gesture.kind === 'delete') {
                this._stopDeleteRepeat(gesture.key);

                if (commit) this._commitWordSelection(gesture);
                else this._cancelWordSelection(gesture);

                (this.keyboard as any)?._updateLevelFromHints?.(true);
            }
        } catch {
            // The key (or keyboard) may already be destroyed.
        }
    }

    /** Stop the backspace key's long-press character repeat. */
    private _stopDeleteRepeat(key: KeyboardKey) {
        try {
            const internal = key as any;

            if (internal._pressTimeoutId) {
                GLib.source_remove(internal._pressTimeoutId);
                internal._pressTimeoutId = 0;
            }

            const controller = (this.keyboard as any)?._keyboardController;
            if (controller?._deleteEnabled) controller.toggleDelete(false);
        } catch {
            // Key already destroyed.
        }
    }

    private _isTerminal(): boolean {
        return Main.inputMethod?.contentPurpose === Clutter.InputContentPurpose.TERMINAL;
    }

    /**
     * Extend (delta > 0) or shrink (delta < 0) the whole-word selection to the left of the
     * cursor. The client renders the selection, so the words highlight while swiping;
     * releasing then deletes them.
     *
     * Terminals have no keyboard-driven selection here, so they keep the plain
     * "delete a word per step" behaviour instead.
     */
    private _extendWordSelection(delta: number) {
        if (delta === 0) return;

        if (this._isTerminal()) {
            this._sendKeys([Clutter.KEY_Control_L, TERMINAL_WORD_DELETE_KEYVAL], Math.abs(delta));
            return;
        }

        const keyval = delta > 0 ? Clutter.KEY_Left : Clutter.KEY_Right;
        this._sendKeys([Clutter.KEY_Control_L, Clutter.KEY_Shift_L, keyval], Math.abs(delta));
    }

    /** Delete the selection built up during the swipe (called on release). */
    private _commitWordSelection(gesture: SwipeGesture) {
        if (this._isTerminal() || gesture.appliedSteps <= 0) return;

        this._sendKeys([Clutter.KEY_BackSpace], 1);
    }

    /** Abandon the swipe (touch cancelled): collapse the selection instead of deleting it. */
    private _cancelWordSelection(gesture: SwipeGesture) {
        if (this._isTerminal() || gesture.appliedSteps <= 0) return;

        this._sendKeys([Clutter.KEY_Right], 1);
    }

    /**
     * Send `count` press/release cycles of a key combination through the virtual keyboard
     * device. `notify_keyval()` wants a microsecond timestamp, while
     * `Clutter.get_current_event_time()` is in milliseconds.
     */
    private _sendKeys(keyvals: number[], count: number) {
        if (count <= 0) return;

        const time = Clutter.get_current_event_time() * 1000;

        for (let i = 0; i < count; i++) {
            for (const keyval of keyvals) {
                this.virtualKeyboard.notify_keyval(time, keyval, Clutter.KeyState.PRESSED);
            }
            for (const keyval of [...keyvals].reverse()) {
                this.virtualKeyboard.notify_keyval(time, keyval, Clutter.KeyState.RELEASED);
            }
        }
    }
}
