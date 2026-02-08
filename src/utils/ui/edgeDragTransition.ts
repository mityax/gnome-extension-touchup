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
        const initialProg = this.initialExtent / this.fullExtent;
        const unboundedProg = (extent / this.fullExtent) + initialProg;
        const prog = clamp(unboundedProg, 0, 1);

        let scale = prog * 0.3 + 0.7;

        let opacity = Math.min((prog - initialProg) / (1 - initialProg), 1);
        let translation = Math.min(-this.fullExtent * scale * (1-prog), 0);

        const overshoot = Math.max(Math.log(unboundedProg), 0);

        if (this.overshootMode === OvershootMode.translation) {
            translation += overshoot * 20;
        } else if (this.overshootMode === OvershootMode.scale) {
            scale += overshoot * 0.05;
        }

        return {
            translation: translation,
            opacity: opacity * 255,
            scale: scale,
        }
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

