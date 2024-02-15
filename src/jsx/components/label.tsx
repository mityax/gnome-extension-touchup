import St from "@girs/st-13";
import {JSXComponent} from "../jsx-runtime";

export class Label extends JSXComponent<
    St.Label,
    St.Label.ConstructorProperties
> {
    render() {
        return new St.Label({
            text: this.textContent,
            ...this.props,
        });
    }
}
