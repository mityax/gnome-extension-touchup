import Clutter from "gi://Clutter";
import {assert} from "../logging";


const MAX_HOLD_MOVEMENT = 10;  // in logical pixels
const MIN_HOLD_TIME_US = 500 * 1000;  // in microseconds (1000us = 1ms)
const SWIPE_ANGLE_CHANGE_TOLERANCE = 20;  // in degrees (0° - 360°)
const MIN_SWIPE_DISTANCE = 4;  // in logical pixels


export enum EventType {
    start = 's',
    motion = 'm',
    end = 'e'
}

export class GestureRecognizerEvent {
    readonly x: number;
    readonly y: number;
    readonly slot: number;
    readonly timeUS: number;
    readonly type: EventType;
    readonly isPointerEvent: boolean;

    constructor(props: {x: number, y: number, slot: number, time_us: number, type: EventType, isPointerEvent: boolean}) {
        this.x = props.x;
        this.y = props.y;
        this.slot = props.slot;
        this.timeUS = props.time_us;
        this.type = props.type;
        this.isPointerEvent = props.isPointerEvent;
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

        const isPointerEvent = [
            Clutter.EventType.BUTTON_PRESS, Clutter.EventType.BUTTON_RELEASE,
            Clutter.EventType.MOTION, Clutter.EventType.PAD_BUTTON_PRESS,
            Clutter.EventType.PAD_BUTTON_RELEASE,
        ].includes(event.type());

        return new GestureRecognizerEvent({
            type,
            x: event.get_coords()[0],
            y: event.get_coords()[1],
            slot: isPointerEvent ? -1 : event.get_event_sequence().get_slot(),
            time_us: event.get_time_us(),
            isPointerEvent,
        });
    }

    get coords(): [number, number] {
        return [this.x, this.y];
    }

    toString(): string {
        return `<Event '${this.isPointerEvent ? 'pointer-' : ''}${this.type}' at ${this.coords} (slot: ${this.slot})>`;
    }
}


export type Direction = 'up' | 'down' | 'left' | 'right';
export type Axis = 'horizontal' | 'vertical';

type _BasePattern = {
    type: string,
    durationUS: number,
    fingerCount: number,
}

export type SwipePattern = _BasePattern & {
    type: 'swipe',
    dX: number,
    dY: number,
    distance: number,
    angle: number,
    speed: number,
    direction: Direction,
    axis: Axis,
};

export type HoldPattern = _BasePattern & {
    type: 'hold',
    x: number,
    y: number,
}

export type Pattern = SwipePattern | HoldPattern;



export class GestureRecognizer {
    private _state: GestureState;
    private readonly _scaleFactor: number;
    private readonly _patternMatchers: PatternMatcher<any>[];

    constructor(props: {scaleFactor: number, patternMatchers?: PatternMatcher<any>[]}) {
        this._scaleFactor = props.scaleFactor;
        this._patternMatchers = props.patternMatchers ?? [
            new HoldPatternMatcher({scaleFactor: this._scaleFactor}),
            new SwipePatternMatcher({scaleFactor: this._scaleFactor}),
        ];
        this._state = GestureState.initial({
            patternMatchers: this._patternMatchers,
        });
    }

    push(event: GestureRecognizerEvent): GestureState {
        if (this._state.isGestureCompleted) {
            this._state = new GestureState({
                events: [event],
                patternMatchers: this._patternMatchers,
            });
        } else {
            this._state = new GestureState({
                events: [...this._state.events, event],
                patternMatchers: this._patternMatchers,
            });
        }

        return this._state;
    }

    get currentState(): GestureState {
        return this._state;
    }
}


export class GestureState {
    private readonly _events: GestureRecognizerEvent[] = [];
    private readonly _patternMatchers: PatternMatcher<any>[] = [];

    constructor(props: {events?: GestureRecognizerEvent[], patternMatchers: PatternMatcher<any>[]}) {
        DEBUG: assert(props.patternMatchers.length > 0, "Need at least one pattern matcher");

        if (props.events) {
            this._events = [...props.events];
        }
        this._patternMatchers = [...props.patternMatchers];
    }

    static initial(props: {patternMatchers: PatternMatcher<any>[]}): GestureState {
        return new GestureState(props);
    }

    get firstPattern(): Pattern | null {
        return this.patterns.next().value;
    }

    get lastPattern(): Pattern | null {
        return [...this.patterns].at(-1) ?? null;
    }

    first<T extends Pattern['type']>(type: T): Pattern & {type: T} | null {
        for (let pattern of this.patterns) {
            if (pattern.type === type) {
                return pattern as Pattern & {type: T};
            }
        }

        return null;
    }

    last<T extends Pattern['type']>(type: T): Pattern & {type: T} | null {
        for (let pattern of [...this.patterns].reverse()) {
            if (pattern.type === type) {
                return pattern as Pattern & {type: T};
            }
        }

        return null;
    }

    /**
     * Returns a generator to lazily compute all patterns in the current event sequence in order.
     *
     * This method will skip any unclassifiable segments within the event sequence.
     */
    get patterns(): Generator<Pattern> {
        // TODO: cache this
        function* generator(remainingEvents: GestureRecognizerEvent[], matchers: PatternMatcher<any>[]) {
            while(remainingEvents.length > 0) {
                for (let m of matchers) {
                    const end = m.matchLeading(remainingEvents);
                    if (end !== null) {
                        yield m.constructPattern(remainingEvents.splice(0, end));
                    } else {
                        remainingEvents.shift();
                    }
                }
            }
        }

        return generator([...this._events], [...this._patternMatchers]);
    }

    get isTap(): boolean {
        const p = new HoldPatternMatcher({
            scaleFactor: this._patternMatchers[0].scaleFactor,
            minTimeUS: 0,
        });

        return this.isGestureCompleted
            && this._events.at(-1)!.timeUS - this._events[0].timeUS < MIN_HOLD_TIME_US
            && p.matchLeading(this._events) === this._events.length;
    }

    get isLongTap(): boolean {
        const p = new HoldPatternMatcher({
            scaleFactor: this._patternMatchers[0].scaleFactor,
        });

        return p.matchLeading(this._events) === this._events.length;
    }

    get isCertainlyMovement(): boolean {
        const p = new HoldPatternMatcher({
            scaleFactor: this._patternMatchers[0].scaleFactor,
            minTimeUS: 0,
        });
        return p.matchLeading(this._events) !== this.events.length;
    }

    get isTouchGesture(): boolean {
        return !this._events.some((e) => e.isPointerEvent);
    }

    get totalFingerCount(): number {
        return _nSlots(this._events);
    }

    get currentFingerCount(): number {
        return _eventsBySlots(this.events)
            .filter(seq => seq.at(-1)!.type !== EventType.end)
            .length;
    }

    /**
     * Retrieve the total motion delta between the first and the last event.
     *
     * If multiple touch points where present during this gesture, the largest
     * motion delta of those individual touch points is returned.
     */
    get totalMotionDelta(): {x: number, y: number} {
        return _eventsBySlots(this._events)
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
            );
    }

    /**
     * Returns the current motion delta, that is, the distance in both axes between
     * the most recent event and the one before it that belongs to the same slot.
     */
    get currentMotionDelta(): {x: number, y: number} {
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
     * Returns true if all event sequences (= all touch points or the mouse pointer) have ended.
     */
    get isGestureCompleted(): boolean {
        return !_eventsBySlots(this._events)
            .some((seq) => seq.at(-1)!.type !== EventType.end);
    }

    /**
     * Returns true if there is at least one event present but the gesture is not yet completed.
     */
    get isDuringGesture(): boolean {
        return this._events.length > 0 && !this.isGestureCompleted;
    }

    /**
     * Returns a human-readable representation of the recorded patterns
     */
    toString() {
        let s: string[] = []

        for (let p of this.patterns) {
            switch (p.type) {
                case "hold":
                    s.push(`hold ${(p.durationUS / 1000 / 1000).toFixed(2)}s`);
                    break;
                case "swipe":
                    s.push(`swipe ${p.direction} (${Math.round(p.angle)}°, ${Math.round(p.distance)}px)`)
            }
        }

        return `<${this.constructor.name} ` +
            `(gesture ${this.isDuringGesture ? 'ongoing' : 'completed'}` +
            `${this.isLongTap ? ', is-long-tap' : this.isTap ? ', is-tap' : ''}) ` +
            `patterns: [ ${s.join(' • ')} ]>`;
    }
}


export abstract class PatternMatcher<T extends Pattern> {
    readonly scaleFactor: number;

    constructor(props: {scaleFactor: number}) {
        this.scaleFactor = props.scaleFactor;
    }

    /**
     * Construct an instance of this matchers pattern type from the given events:
     */
    abstract constructPattern(events: GestureRecognizerEvent[]): T;

    /**
     * Try to match this pattern type against the beginning of the given events and,
     * if the pattern can be matched, return the index of the first item that can no
     * longer be part of this pattern.
     */
    abstract matchLeading(events: GestureRecognizerEvent[]): number | null;

    /**
     * Try to match this pattern type against the end of the given events and, if
     * the pattern can be matched, return the index of the first item that is part
     * of this pattern.
     */
    matchTrailing(events: GestureRecognizerEvent[]): number | null {
        const revIdx = this.matchLeading([...events].reverse());
        return revIdx !== null ? events.length - revIdx : null;
    }
}


export class SwipePatternMatcher extends PatternMatcher<SwipePattern> {
    matchLeading(events: GestureRecognizerEvent[]): number | null {
        // FIXME: This method does at the moment not properly end the swipe gesture
        //   match when a hold comes after a swipe, i.e. when the movement stops

        if (events.length < 2) return null;

        let idx: number | null = null;
        let maxDist: number = 0;

        for (let sequence of _eventsBySlots(events)) {
            let totalAngle: number | null = null;

            for (let i = 1; i < sequence.length; i++) {
                const dist = _distBetween(sequence[i].coords, sequence[i - 1].coords);
                const angle = _angleBetween(
                    sequence[i].x - sequence[i - 1].x,
                    sequence[i].y - sequence[i - 1].y,
                );
                const avgAngleSoFar = (totalAngle ?? angle) / i;

                if (dist > 1 && Math.abs(_angleDifference(avgAngleSoFar, angle)) > SWIPE_ANGLE_CHANGE_TOLERANCE) {
                    const originalIndex = events.indexOf(sequence[i]);
                    idx = Math.max(idx ?? 0, originalIndex);
                    maxDist = Math.max(maxDist, _distBetween(sequence[0].coords, sequence[i - 1].coords));
                }

                totalAngle = totalAngle !== null ? totalAngle + angle : angle;
            }
        }

        if (idx != null && maxDist >= MIN_SWIPE_DISTANCE * this.scaleFactor) {
            return idx;
        }

        return null;
    }

    constructPattern(events: GestureRecognizerEvent[]): SwipePattern {
        DEBUG: assert(events.length >= 2, 'Cannot create a swipe pattern with less than two events.');

        const eventsBySlots = _eventsBySlots(events);

        let dX = 0;
        let dY = 0;
        let durationUS = 0;
        let distance = 0;
        let angle = 0;

        for (let sequence of eventsBySlots) {
            dX = Math.max(sequence.at(-1)!.x - sequence[0].x);
            dY = Math.max(sequence.at(-1)!.y - sequence[0].y);
            durationUS = Math.max(durationUS, sequence.at(-1)!.timeUS - sequence[0].timeUS);
            distance = Math.max(distance, _distBetween(sequence[0].coords, sequence.at(-1)!.coords));
            angle += _angleBetween(dX, dY);
        }

        angle = angle / eventsBySlots.length;

        const direction = _directionForAngle(angle);

        return {
            type: 'swipe',
            dX,
            dY,
            durationUS,
            distance,
            speed: distance / durationUS,
            angle,
            direction: direction,
            axis: _axisForDirection(direction),
            fingerCount: eventsBySlots.length,
        };
    }
}


export class HoldPatternMatcher extends PatternMatcher<HoldPattern> {
    private readonly minTimeUS: number;

    constructor(props: {scaleFactor: number, minTimeUS?: number}) {
        super({scaleFactor: props.scaleFactor});
        this.minTimeUS = props.minTimeUS ?? MIN_HOLD_TIME_US;
    }

    matchLeading(events: GestureRecognizerEvent[]): number | null {
        let idx: number | null = null;

        for (let sequence of _eventsBySlots(events)) {
            for (let i = 1; i < sequence.length; i++) {
                if (_distBetween(sequence[0].coords, sequence[i].coords) < MAX_HOLD_MOVEMENT * this.scaleFactor) {
                    let originalEventIndex = events.indexOf(sequence[i]);
                    idx = Math.max(idx ?? 0, originalEventIndex);
                }
            }
        }
        if (idx !== null && events.length > 1 && events.at(idx)!.timeUS - events.at(0)!.timeUS >= this.minTimeUS) {
            return idx + 1;
        }
        return null;
    }

    constructPattern(events: GestureRecognizerEvent[]): HoldPattern {
        DEBUG: assert(events.length >= 2, 'Cannot create a hold pattern with less than two events.');

        return {
            type: 'hold',
            x: events[0].x,
            y: events[0].y,
            durationUS: events.at(-1)!.timeUS - events[0].timeUS,
            fingerCount: _nSlots(events),
        };
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

/**
 * The shortest (signed) distance from a1 to a2, such that:
 *
 * ```
 * a1 + _angleDifference(a1, a2) == a2
 * ```
 */
function _angleDifference(a1: number, a2: number): number {
    // Make `a` the lesser of (a1, a2) and `b` the greater one:
    const [a, b] = a1 > a2 ? [a2, a1] : [a1, a2];

    let diff = b - a;
    if (diff > 180) {
        diff = 360 - diff;
        return a1 > a2 ? diff : -diff;
    } else {
        return a1 > a2 ? -diff : diff;
    }
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

