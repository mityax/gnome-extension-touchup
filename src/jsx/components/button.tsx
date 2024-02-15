import St from "@girs/st-13";
import {JSXComponent} from "../jsx-runtime";

export class Button extends JSXComponent<
    St.Button,
    St.Button.ConstructorProperties
> {
    render() {
        const widget = new St.Button({
            label: this.textContent,
            ...this.props,
        });
        this.setupEventHandlers(widget);
        return widget;
    }
}
