import {clamp} from "../utils";
import {assert} from "$src/core/logging";


export enum OvershootMode {
    translation, scale, none
}

export interface TransitionValues {
    scale: number,
    translation: number,
    opacity: number,
}


export class EdgeDragTransition {
    fullExtent: number;
    initialExtent: number;
    overshootMode: OvershootMode;

    constructor(props: {
        fullExtent: number,
        initialExtent?: number,
        overshootMode?: OvershootMode,
    }) {
        assert(!props.initialExtent || props.initialExtent < props.fullExtent,
            "Initial extent must be smaller than full extent");

        this.fullExtent = props.fullExtent;
        this.initialExtent = props.initialExtent ?? props.fullExtent * 0.55;
        this.overshootMode = props.overshootMode ?? OvershootMode.scale;
    }

    interpolate(extent: number): TransitionValues {
        const initialProg   = this.initialExtent / this.fullExtent;
        const unboundedProg = (extent / this.fullExtent) + initialProg;
        const prog          = clamp(unboundedProg, 0, 1);
        const ease          = EdgeDragTransition.easeInOut(prog);

        let scale       = ease * 0.3 + 0.7;
        let translation = -this.fullExtent * (1 - ease);

        const activeRange = 1 - initialProg;
        const opacity     = activeRange > 0
            ? clamp((prog - initialProg) / activeRange, 0, 1)
            : 1;

        const excess    = Math.max(unboundedProg - 1, 0) * this.fullExtent;
        const overshoot = EdgeDragTransition.rubberBand(excess, this.fullExtent);

        if (this.overshootMode === OvershootMode.translation) {
            translation += overshoot;
        } else if (this.overshootMode === OvershootMode.scale) {
            scale += (overshoot / this.fullExtent) * 0.08;
        }

        return {
            translation,
            opacity: opacity * 255,
            scale,
        };
    }

    private static rubberBand(displacement: number, dim: number, coefficient = 0.55): number {
        if (displacement <= 0 || dim <= 0) return 0;
        return (1 - 1 / (displacement * coefficient / dim + 1)) * dim;
    }

    private static easeInOut(t: number): number {
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }

    interpolateRelative(progress: number): TransitionValues {
        return this.interpolate(progress * this.fullExtent);
    }

    get initialValues(): TransitionValues {
        return this.interpolateRelative(0);
    }

    get finalValues(): TransitionValues {
        return this.interpolateRelative(1);
    }
}


