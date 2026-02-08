import Clutter from "gi://Clutter";
import EventEmitter from "$src/utils/eventEmitter";
import {assert} from "$src/core/logging";
import St from "gi://St";


const MOVEMENT_THRESHOLD = 8;  // in logical pixels
const STRONG_MOVEMENT_THRESHOLD = 25;  // in logical pixels
const MIN_HOLD_TIME_US = 500 * 1000;  // in microseconds (1000us = 1ms)
const MIN_MOTION_DIRECTION_DETECTION_DISTANCE = 6;  // in logical pixels; must be <= MOVEMENT_THRESHOLD


DEBUG: assert(MIN_MOTION_DIRECTION_DETECTION_DISTANCE <= MOVEMENT_THRESHOLD,
    'MIN_MOTION_DIRECTION_DETECTION_DISTANCE must be less than or equal to MOVEMENT_THRESHOLD');


export enum EventType {
    start = 's',
    motion = 'm',
    end = 'e',
}

export class GestureRecognizerEvent {
    readonly x: number;
    readonly y: number;
    readonly slot: number;
    readonly timeUS: number;
    readonly type: EventType;
    readonly isPointerEvent: boolean;
    readonly isCancelEvent: boolean;

    constructor(props: {
        x: number, y: number, slot: number, time_us: number, type: EventType, isPointerEvent: boolean,
        isCancelEvent: boolean
    }) {
        this.x = props.x;
        this.y = props.y;
        this.slot = props.slot;
        this.timeUS = props.time_us;
        this.type = props.type;
        this.isPointerEvent = props.isPointerEvent;
        this.isCancelEvent = props.isCancelEvent;
    }

    static fromClutterEvent(event: Clutter.Event) {
        let type: EventType;

        switch (event.type()) {
            case Clutter.EventType.TOUCH_BEGIN:
            case Clutter.EventType.BUTTON_PRESS:
                type = EventType.start;
                break;
            case Clutter.EventType.TOUCH_UPDATE:
            case Clutter.EventType.MOTION:
                type = EventType.motion;
                break;
            case Clutter.EventType.TOUCH_END:
            case Clutter.EventType.TOUCH_CANCEL:
            case Clutter.EventType.BUTTON_RELEASE:
                type = EventType.end;
                break;
            default:
                throw Error(`Unsupported Clutter.EventType: ${event.type()}`);
        }

        const isPointerEvent = GestureRecognizerEvent.isPointer(event);

        return new GestureRecognizerEvent({
            type,
            x: event.get_coords()[0],
            y: event.get_coords()[1],
            slot: isPointerEvent ? -1 : event.get_event_sequence().get_slot(),
            time_us: event.get_time_us(),
            isPointerEvent,
            isCancelEvent: event.type() === Clutter.EventType.TOUCH_CANCEL,
        });
    }

    get coords(): [number, number] {
        return [this.x, this.y];
    }

    toString(): string {
        return `<Event '${this.isPointerEvent ? 'pointer-' : ''}${this.type}' at ${this.coords} (slot: ${this.slot})>`;
    }

    static isPointer(event: Clutter.Event) {
        switch (event.type()) {
            case Clutter.EventType.BUTTON_PRESS:
            case Clutter.EventType.BUTTON_RELEASE:
            case Clutter.EventType.MOTION:
            case Clutter.EventType.PAD_BUTTON_PRESS:
            case Clutter.EventType.PAD_BUTTON_RELEASE:
                return true;
            default:
                return false;
        }
    }

    static isTouch(event: Clutter.Event) {
        switch (event.type()) {
            case Clutter.EventType.TOUCH_BEGIN:
            case Clutter.EventType.TOUCH_UPDATE:
            case Clutter.EventType.TOUCH_END:
            case Clutter.EventType.TOUCH_CANCEL:
                return true;
            default:
                return false;
        }
    }
}


export type Direction = 'up' | 'down' | 'left' | 'right';
export type Axis = 'horizontal' | 'vertical';

export type Hold = {
    x: number,
    y: number,
    durationUS: number,
}

export type MotionDirection = {
    dx: number,
    dy: number,
    angle: number,
    axis: Axis,
    direction: Direction,
}


export class GestureRecognizer extends EventEmitter<{
    'gesture-started': [GestureState, GestureRecognizerEvent, Clutter.Event | null],
    'gesture-progress': [GestureState, GestureRecognizerEvent, Clutter.Event | null],
    'gesture-completed': [GestureState, GestureRecognizerEvent, Clutter.Event | null],
    'gesture-canceled': [GestureState, GestureRecognizerEvent, Clutter.Event | null],
    'gesture-ended': [GestureState, GestureRecognizerEvent, Clutter.Event | null],
}> {
    private _state: GestureState;
    private readonly _scaleFactor: number;

    constructor(props?: {
        scaleFactor?: number,
        onGestureStarted?: (state: GestureState, event: GestureRecognizerEvent, rawEvent: Clutter.Event | null) => void,
        onGestureProgress?: (state: GestureState, event: GestureRecognizerEvent, rawEvent: Clutter.Event | null) => void,
        onGestureCompleted?: (state: GestureState, event: GestureRecognizerEvent, rawEvent: Clutter.Event | null) => void,
        onGestureCanceled?: (state: GestureState, event: GestureRecognizerEvent, rawEvent: Clutter.Event | null) => void,
        onGestureEnded?: (state: GestureState, event: GestureRecognizerEvent, rawEvent: Clutter.Event | null) => void,
    }) {
        super();

        this._scaleFactor = props?.scaleFactor ?? St.ThemeContext.get_for_stage(global.stage as Clutter.Stage).scaleFactor;
        this._state = GestureState.initial({
            scaleFactor: this._scaleFactor,
        });

        if (props?.onGestureStarted)   this.connect('gesture-started', props.onGestureStarted);
        if (props?.onGestureProgress)  this.connect('gesture-progress', props.onGestureProgress);
        if (props?.onGestureCompleted) this.connect('gesture-completed', props.onGestureCompleted);
        if (props?.onGestureCanceled)  this.connect('gesture-canceled', props.onGestureCanceled);
        if (props?.onGestureEnded)  this.connect('gesture-ended', props.onGestureEnded);
    }

    push(event: GestureRecognizerEvent | Clutter.Event): GestureState {
        let rawEvent: Clutter.Event | null = null;
        if (event instanceof Clutter.Event) {
            rawEvent = event;
            event = GestureRecognizerEvent.fromClutterEvent(event);
        }

        if (!this._state.isDuringGesture) {
            this._state = GestureState.initial({
                firstEvent: event,
                scaleFactor: this._scaleFactor
            });
            this.emit('gesture-started', this._state, event, rawEvent);
        } else {
            this._state = this._state.copyWith(event);

            if (this._state.isDuringGesture) {
                this.emit('gesture-progress', this._state, event, rawEvent);
            } else {
                this.emit('gesture-ended', this._state, event, rawEvent);
                this.emit(event.isCancelEvent ? 'gesture-canceled' : 'gesture-completed', this._state, event, rawEvent);
            }
        }

        return this._state;
    }

    get currentState(): GestureState {
        return this._state;
    }

    /**
     * Emit an `end` event with `isCancelEvent: true`. This effectively cancels the
     * entire active gesture and results in the [GestureRecognizer] calling the
     * appropriate canceled and ended callbacks.
     */
    cancel() {
        const lastEvent = this._state.events.at(-1);
        this.push(new GestureRecognizerEvent({
            type: EventType.end,
            x: lastEvent?.x ?? -1,
            y: lastEvent?.y ?? -1,
            slot: lastEvent?.slot ?? -1,
            time_us: Clutter.get_current_event_time(),
            isPointerEvent: lastEvent?.isPointerEvent ?? false,
            isCancelEvent: true,
        }));
    }

    /**
     * Emit `end` events for all active slots. Effectively this manually commits a gesture
     * and will emit the appropriate completed and ended callbacks.
     */
    ensureEnded() {
        for (const e of this._state._eventsBySlots) {
            if (e.at(-1)?.type !== EventType.end) {
                this.push(new GestureRecognizerEvent({
                    type: EventType.end,
                    x: e.at(-1)!.x ?? -1,
                    y: e.at(-1)!.y ?? -1,
                    slot: e.at(-1)!.slot ?? -1,
                    time_us: Clutter.get_current_event_time(),
                    isPointerEvent: e.at(-1)!.isPointerEvent ?? false,
                    isCancelEvent: false,
                }));
            }
        }
    }

    /**
     * Create a [Clutter.PanGesture] that forwards all events to this [GestureRecognizer].
     */
    createPanGesture(props?: Partial<Clutter.PanGesture.ConstructorProps>): Clutter.PanGesture {
        const gesture = new Clutter.PanGesture(props);
        gesture.connect('pan-update', () => {
            this.push(Clutter.get_current_event());
        });
        gesture.connect('end', () => {
            this.push(Clutter.get_current_event());
            this.ensureEnded();
        });
        gesture.connect("cancel", () => {
            this.cancel();
        });
        return gesture;
    }
}


export class GestureState {
    private readonly _cacheMap = new Map<string, any>();
    private readonly _events: GestureRecognizerEvent[] = [];
    private readonly _scaleFactor: number;

    private constructor(props: {events: GestureRecognizerEvent[], scaleFactor: number}) {
        this._events = props.events;
        this._scaleFactor = props.scaleFactor;
    }

    static initial(props: {firstEvent?: GestureRecognizerEvent, scaleFactor: number}): GestureState {
        return new GestureState({
            events: props.firstEvent ? [props.firstEvent] : [],
            scaleFactor: props.scaleFactor
        });
    }

    copyWith(newEvent: GestureRecognizerEvent) {
        return new GestureState({
            events: [...this._events, newEvent],
            scaleFactor: this._scaleFactor,
        });
    }

    /**
     * Returns true if the gesture is a tap (short hold with minimal movement).
     */
    get isTap(): boolean {
        return this._cachedValue(
            'is-tap',
            () => {
                if (this._events.length < 2 || !this.hasGestureJustEnded || this.totalFingerCount != 1) {
                    return false;
                }

                const hold = _matchHold(this._events, {
                    maxMovement: MOVEMENT_THRESHOLD * this._scaleFactor,
                    minTimeUS: 0,
                });

                if (!hold) return false;

                return this._events.at(-1)!.timeUS - this._events[0].timeUS < MIN_HOLD_TIME_US
                    && hold.lastIncludedEventIdx + 1 === this._events.length;
            }
        );
    }

    /**
     * Returns true if the gesture is a long tap (hold with minimal movement).
     */
    get isLongTap(): boolean {
        return this._cachedValue(
            'is-long-tap',
            () => {
                if (this._events.length < 2 || !this.hasGestureJustEnded || this.totalFingerCount !== 1) {
                    return false;
                }

                const hold = _matchHold(this._events, {
                    maxMovement: MOVEMENT_THRESHOLD * this._scaleFactor,
                });

                if (!hold) return false;

                return hold.lastIncludedEventIdx + 1 === this._events.length;
            }
        );
    }

    /**
     * Returns the position where the first event of this gesture occurred.
     */
    get pressCoordinates(): {x: number, y: number} {
        return {
            x: this.events[0].x,
            y: this.events[0].y,
        }
    }

    /**
     * Returns true if it's certain already that this gesture involves motion – use this to decide whether to
     * start animations like actor-following.
     */
    get hasMovement(): boolean {
        return this._cachedValue(
            'has-movement',
            () => {
                if (this._events.length < 2) return false;

                const hold = _matchHold(this._events, {
                    maxMovement: MOVEMENT_THRESHOLD * this._scaleFactor,
                    minTimeUS: 0,
                });

                if (!hold) return true;

                return hold.lastIncludedEventIdx + 1 < this._events.length;
            }
        );
    }

    /**
     * Returns true if it's certain already that this gesture involves motion, using a higher
     * threshold for motion detection than [hasMovement] – use this on actors that could be
     * tapped also.
     */
    get hasStrongMovement(): boolean {
        return this._cachedValue(
            'has-movement',
            () => {
                if (this._events.length < 2) return false;

                const hold = _matchHold(this._events, {
                    maxMovement: STRONG_MOVEMENT_THRESHOLD * this._scaleFactor,
                    minTimeUS: 0,
                });

                if (!hold) return false;

                return hold.lastIncludedEventIdx + 1 < this._events.length;
            }
        );
    }

    /**
     * Returns the hold pattern at the beginning of the gesture, if it starts with a
     * hold/long press.
     */
    get initialHold(): Hold | null {
        return this._cachedValue(
            `initial-hold`,
            () => _matchHold(this._events, {
                maxMovement: MOVEMENT_THRESHOLD * this._scaleFactor,
            })?.pattern ?? null,
        );
    }

    /**
     * Returns the hold pattern at the end of the gesture, if it ends with a hold/long
     * press.
     */
    get finalHold(): Hold | null {
        return this._cachedValue(
            `final-hold`,
            () => _matchHold(this._events, {
                maxMovement: MOVEMENT_THRESHOLD * this._scaleFactor,
                matchFromEnd: true,
            })?.pattern ?? null,
        );
    }

    /**
     * Returns true if the gesture starts with a hold/long press.
     */
    get startsWithHold(): boolean {
        return this.initialHold !== null;
    }

    /**
     * Returns true if the gesture ends with a hold/long press.
     */
    get endsWithHold(): boolean {
        return this.finalHold !== null;
    }

    /**
     * Returns the direction of the first detected motion in the gesture, if there is any.
     */
    get firstMotionDirection(): MotionDirection | null {
        return this._cachedValue(
            'first-motion-direction',
            () => {
                return _findInitialMotionDirection(this._events, {
                    minDist: MIN_MOTION_DIRECTION_DETECTION_DISTANCE * this._scaleFactor,
                });
            }
        );
    }

    /**
     * Returns the direction of the last detected motion in the gesture, if there is any.
     */
    get lastMotionDirection(): MotionDirection | null {
        return this._cachedValue(
            'last-motion-direction',
            () => {
                return _findInitialMotionDirection(this._events, {
                    minDist: MIN_MOTION_DIRECTION_DETECTION_DISTANCE * this._scaleFactor,
                    matchFromEnd: true,
                });
            }
        );
    }

    /**
     * Returns the direction of the initial motion if the gesture starts with a motion
     * immediately.
     */
    get initialMotionDirection(): MotionDirection | null {
        return this.startsWithMotion ? this.firstMotionDirection : null;
    }

    /**
     * Returns the direction of the final motion if the gesture ends with a motion (as
     * opposed to a hold/long press).
     */
    get finalMotionDirection(): MotionDirection | null {
        return this.endsWithMotion ? this.lastMotionDirection : null;
    }

    /**
     * Returns true if the gesture starts with a motion immediately (as opposed to a
     * hold/long press).
     */
    get startsWithMotion(): boolean {
        return !this._eventsBySlots.some(seq => seq.length < 2)
            && !this.startsWithHold;
    }

    /**
     * Returns true if the gesture ends with a motion (as opposed to a hold/long press).
     */
    get endsWithMotion(): boolean {
        return this.hasGestureJustEnded && !this.endsWithHold;
    }

    /**
     * Returns true if the gesture only involves touch events (no pointer events).
     */
    get isTouchGesture(): boolean {
        return this._cachedValue(
            'is-touch-gesture',
            () => !this._events.some((e) => e.isPointerEvent),
        );
    }

    /**
     * Returns the total number of fingers (slots) involved during the gesture.
     */
    get totalFingerCount(): number {
        return this._cachedValue(
            'total-finger-count',
            () => _nSlots(this._events),
        );
    }

    /**
     * Returns the number of fingers (slots) currently active (not yet ended).
     */
    get currentFingerCount(): number {
        return this._cachedValue(
            'current-finger-count',
            () => this._eventsBySlots
                .filter(seq => seq.at(-1)!.type !== EventType.end)
                .length
        );
    }

    /**
     * Retrieve the total motion delta between the first and the last event.
     *
     * If multiple touch points where present during this gesture, the largest
     * motion delta of those individual touch points is returned.
     */
    get totalMotionDelta(): {x: number, y: number} {
        return this._cachedValue(
            'total-motion-delta',
            () => this._eventsBySlots
                .map(seq => {
                    if (seq.length < 2) return {x: 0, y: 0};
                    return {
                        x: seq.at(-1)!.x - seq[0].x,
                        y: seq.at(-1)!.y - seq[0].y,
                    };
                })
                .reduce(
                    (prev, d) => {
                        return Math.hypot(prev.x, prev.y) > Math.hypot(d.x, d.y) ? prev : d;
                    },
                    { x: 0, y: 0 },
                )
        );
    }

    /**
     * Returns the current motion delta, that is, the distance in both axes between
     * the most recent event and the one before it that belongs to the same slot.
     */
    get currentMotionDelta(): {x: number, y: number} {
        return this._cachedValue(
            'current-motion-delta',
            () => {
                if (this.events.length < 2) return {x: 0, y: 0};

                const lastEvent = this._events.at(-1)!;
                const prevEvent = this._events
                    .findLast(e => e !== lastEvent && e.slot === lastEvent.slot);

                if (!prevEvent) return {x: 0, y: 0};

                return {
                    x: lastEvent.x - prevEvent.x,
                    y: lastEvent.y - prevEvent.y,
                }
            }
        );
    }

    get events(): GestureRecognizerEvent[] {
        return [...this._events];
    }

    /**
     * Returns true if the first event has been pushed and no other event is present yet.
     */
    get hasGestureJustStarted(): boolean {
        return this._events.length === 1;
    }

    /**
     * Returns true if there is at least one event present but the gesture is not yet completed.
     */
    get isDuringGesture(): boolean {
        return this._events.length > 0 && !this.hasGestureJustEnded;
    }

    /**
     * Returns true if all event sequences (= all touch points or the mouse pointer) have ended.
     */
    get hasGestureJustEnded(): boolean {
        return this._cachedValue(
            'has-gesture-just-ended',
            () => {
                if (this.hasGestureBeenCanceled) return true;

                return this.events.length > 0
                    && !this._eventsBySlots
                        .some((seq) => seq.at(-1)!.type !== EventType.end);
            }
        );
    }

    /**
     * Returns true if the gesture has been canceled.
     */
    get hasGestureBeenCanceled(): boolean {
        return this._events.at(-1)?.isCancelEvent ?? false;
    }

    /**
     * Returns a human-readable representation of the recorded patterns
     */
    toString() {
        return `<${this.constructor.name} ` +
            `(gesture ${this.hasGestureJustStarted ? 'started' : this.isDuringGesture ? 'ongoing' : 'completed'}` +
            `, ${this.isLongTap ? 'is-long-tap' : this.isTap ? 'is-tap' : ''})>`;
    }

    get _eventsBySlots() {
        return this._cachedValue(
            'events-by-slots',
            () => _eventsBySlots(this._events),
        );
    }

    /**
     * Small internal utility to not do calculations multiple times with very little overhead.
     *
     * This is done since this class is immutable.
     */
    private _cachedValue<T>(key: string, computation: () => T): T {
        if (this._cacheMap.has(key)) {
            return this._cacheMap.get(key);
        } else {
            const res = computation();
            this._cacheMap.set(key, res);
            return res;
        }
    }
}


function _matchHold(events: GestureRecognizerEvent[], opts: {maxMovement: number, matchFromEnd?: boolean, minTimeUS?: number}): {lastIncludedEventIdx: number, pattern: Hold} | null {
    if (events.length < 2) return null;

    if (opts.matchFromEnd) {
        events = events.toReversed();
    }

    const sequences = _eventsBySlots(events);

    let idx: number | null = null;

    for (let sequence of sequences) {
        for (let i = 1; i < sequence.length; i++) {
            if (_distBetween(sequence[0].coords, sequence[i].coords) < opts.maxMovement) {
                let originalEventIndex = events.indexOf(sequence[i]);
                idx = Math.max(idx ?? 0, originalEventIndex);
            }
        }
    }

    if (idx === null) return null;

    const duration = Math.abs(events[idx].timeUS - events[0].timeUS);  // use `abs` to always get a positive duration, even in case of reversed events due to `opts.matchFromEnd == true`

    if (duration < (opts.minTimeUS ?? MIN_HOLD_TIME_US)) return null;

    return {
        lastIncludedEventIdx: idx,
        pattern: {
            x: events[0].x,
            y: events[0].y,
            durationUS: duration,
        }
    };
}


function _findInitialMotionDirection(events: GestureRecognizerEvent[], opts: {minDist: number, matchFromEnd?: boolean}): MotionDirection | null {
    if (opts.matchFromEnd) events = events.toReversed();

    const sequences = _eventsBySlots(events);

    const motions = sequences
        .filter(seq => seq.length >= 2)
        .map(seq => {
            const endIdx = seq.findIndex(e => _distBetween(seq[0].coords, e.coords) > opts.minDist);

            if (endIdx === -1) return null;

            return {
                x: (seq[endIdx].x - seq[0].x) * (opts.matchFromEnd ? -1 : 1),
                y: (seq[endIdx].y - seq[0].y) * (opts.matchFromEnd ? -1 : 1),
                distance: _distBetween(seq[0].coords, seq[endIdx].coords),
                idx: events.indexOf(seq[endIdx]),
            }
        })
        .filter(motion => motion !== null);

    if (motions.length === 0) return null;

    const targetMotion = motions.reduce(
        (prev, curr) => prev!.idx < curr!.idx ? prev : curr,
        motions[0],
    )!;

    const angle = _angleBetween(targetMotion.x, targetMotion.y);
    const direction = _directionForAngle(angle);
    const axis = _axisForDirection(direction);

    return {
        dx: targetMotion.x,
        dy: targetMotion.y,
        angle,
        direction,
        axis,
    }
}


function _eventsBySlots(events: GestureRecognizerEvent[]): GestureRecognizerEvent[][] {
    const map: Map<number, GestureRecognizerEvent[]> = new Map();
    for (let event of events) {
        if (!map.has(event.slot)) {
            map.set(event.slot, []);
        }
        map.get(event.slot)!.push(event);
    }
    return [...map.values()];
}


function _nSlots(events: GestureRecognizerEvent[]): number {
    return new Set(events.map((e) => e.slot)).size;
}


function _distBetween([x1, y1]: [number, number], [x2, y2]: [number, number]): number {
    return Math.hypot((x2 - x1), (y2 - y1));
}


// up = 0, right = 90, down = 180, left = 270
function _angleBetween(dx: number, dy: number) {
    return (Math.atan2(dy, dx) * 180 / Math.PI + 450) % 360;
}


function _directionForAngle(angle: number): Direction {
    if (315 <= angle || angle <= 45) {
        return 'up';
    } else if (45 <= angle && angle <= 135) {
        return 'right';
    } else if (135 <= angle && angle <= 225) {
        return 'down';
    } else {
        return 'left';
    }
}


function _axisForDirection(direction: Direction): Axis {
    if (direction === 'up' || direction === 'down') {
        return 'vertical';
    }
    return 'horizontal';
}

