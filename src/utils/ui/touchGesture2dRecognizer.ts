import Clutter from "@girs/clutter-14";
import St from "@girs/st-14";
import Stage = Clutter.Stage;
import {debugLog} from "$src/utils/logging";


export type SwipePattern = {
    type: 'swipe',
    deltaX: number,
    deltaY: number,
    swipeDistance: number,
    swipeAngle: number,
    swipeSpeed: number,
    swipeDirection: 'up' | 'down' | 'left' | 'right',
    totalTime: number,
};
export type HoldPattern = {
    type: 'hold',
    x: number,
    y: number,
    duration: number
}
export type Pattern = SwipePattern | HoldPattern;


export class TouchGesture2dRecognizer {
    static readonly SIGNIFICANT_ANGLE_CHANGE = 30; // degrees
    static readonly PAUSE_TOLERANCE = 12; // delta_pixels
    static readonly SIGNIFICANT_PAUSE = 1000; // milliseconds

    private scaleFactor = St.ThemeContext.get_for_stage(global.stage as Stage).scaleFactor;

    private recordedPatterns: Pattern[] = [];
    private lastEvent: Clutter.Event | null = null;
    private initialAngle = -1;
    private totalDx = 0;
    private totalDy = 0;
    private totalDt = 0;
    private pauseTime = 0;
    private pauseDx = 0;
    private pauseDy = 0;


    addEvent(event: Clutter.Event) {
        // Reset if event is the beginning of a sequence:
        if (event.type() == Clutter.EventType.TOUCH_BEGIN ||
            event.type() == Clutter.EventType.BUTTON_PRESS) {
            this.recordedPatterns = [];
            this.lastEvent = null;
            this.initialAngle = -1;
            this.totalDx = 0;
            this.totalDy = 0;
            this.totalDt = 0;
            this.pauseTime = 0;
            this.pauseDx = 0;
            this.pauseDy = 0;
        }

        this.processEvent(event);
        this.lastEvent = event;
    }

    getPatterns() {
        return [...this.recordedPatterns];
    }

    private processEvent(event: Clutter.Event) {
        // Calculate initial angle (between first and second event of a sequence):
        if (this.initialAngle === -1 && this.lastEvent !== null) {
            // @ts-ignore
            this.initialAngle = this.angleBetween(
                event.get_coords()[0] - this.lastEvent.get_coords()[0],
                event.get_coords()[1] - this.lastEvent.get_coords()[1],
            );
        }

        if (this.lastEvent !== null) {
            // Compute deltas:
            const dx = event.get_coords()[0] - this.lastEvent.get_coords()[0],
                  dy = event.get_coords()[1] - this.lastEvent.get_coords()[1],
                  dt = event.get_time() - this.lastEvent.get_time();
            const d = Math.sqrt(dx ** 2 + dy ** 2);

            debugLog(`event: \tdx=${dx.toFixed(1)}\tdy=${dy.toFixed(1)}\tdt=${dt} ms\t|\t` +
                `speed=${(d / dt).toFixed(4)} px/ms\tangle=${this.angleBetween(dx, dy).toFixed(1)} deg`)

            // If there is absolutely no movement and no time since last event, skip event (e.g. touch-release event):
            if (dt === 0 && dx === 0 && dy === 0) return;

            // Check for a significant pause ("hold"):
            // @ts-ignore
            if (this.checkForSignificantPause(dt, dx, dy, event.get_coords()[0], event.get_coords()[1])) return;

            // Check for significant angle change (if there's enough movement in this event):
            if (this.pauseTime === 0 && d > TouchGesture2dRecognizer.PAUSE_TOLERANCE * this.scaleFactor) {
                if (this.checkForSignificantAngleChange(dx, dy, dt)) return;
            }

            this.totalDx += dx;
            this.totalDy += dy;
            this.totalDt += dt;

            // If the swipe has ended with a pause, we don't fire:
            if (this.totalDx == 0 && this.totalDy == 0) return;

            this.pushPattern({
                type: 'swipe',
                deltaX: this.totalDx,
                deltaY: this.totalDy,
                swipeDistance: Math.sqrt(this.totalDx ** 2 + this.totalDy ** 2),
                swipeAngle: this.angleBetween(this.totalDx, this.totalDy),
                swipeSpeed: Math.sqrt(this.totalDx ** 2 + this.totalDy ** 2) / this.totalDt,
                swipeDirection: this.directionForAngle(this.angleBetween(this.totalDx, this.totalDy)),
                totalTime: this.totalDt,
            });
        }
    }

    private checkForSignificantAngleChange(dx: number, dy: number, dt: number) {
        const currentAngle = this.angleBetween(dx, dy);
        const angleDiff = currentAngle - this.initialAngle;

        this.initialAngle = currentAngle;

        if (Math.abs(angleDiff) > TouchGesture2dRecognizer.SIGNIFICANT_ANGLE_CHANGE) {
            // Significant angle change detected
            debugLog(`  - angle change! (${angleDiff} deg, dx=${dx}, dy=${dy})`)
            this.totalDx = dx;
            this.totalDy = dy;
            this.totalDt = dt;
            return true;
        }

        return false;
    }

    private checkForSignificantPause(dt: number, dx: number, dy: number, x: number, y: number) {
        if (Math.sqrt(this.pauseDx ** 2 + this.pauseDy ** 2) <= TouchGesture2dRecognizer.PAUSE_TOLERANCE * this.scaleFactor) {
            this.pauseTime += dt;
            this.pauseDx += dx;
            this.pauseDy += dy;
        } else {
            this.pauseTime = 0;
            this.pauseDx = 0;
            this.pauseDy = 0;
        }

        if (this.pauseTime >= TouchGesture2dRecognizer.SIGNIFICANT_PAUSE) {
            this.totalDx = this.totalDy = this.totalDt = 0; // Significant pause detected
            debugLog(`  - significant pause! (${this.pauseTime} ms > ${TouchGesture2dRecognizer.SIGNIFICANT_PAUSE} ms; d=${Math.sqrt(this.pauseDx ** 2 + this.pauseDy ** 2)})`)
            this.pushPattern({
                type: 'hold',
                x: x,
                y: y,
                duration: this.pauseTime,
            });
            return true;
        }

        return false;
    }

    private pushPattern(pattern: Pattern) {
        const lastPattern = this.recordedPatterns.at(-1);
        if (lastPattern && pattern.type === 'hold' && lastPattern.type === 'hold') {
            (this.recordedPatterns.at(-1) as HoldPattern).duration += pattern.duration;
        } else {
            this.recordedPatterns.push(pattern);
        }
    }

    // up = 0, right = 90, down = 180, left = 270
    private angleBetween(dx: number, dy: number) {
        return (Math.atan2(dy, dx) * 180 / Math.PI + 450) % 360;
    }

    private directionForAngle(angle: number) {
        if (315 <= angle || angle <= 45) {
            return 'up';
        } else if (45 <= angle && angle <= 135) {
            return 'right';
        } else if (135 <= angle && angle <= 225) {
            return 'down'
        } else {
            return 'left';
        }
    }
}
