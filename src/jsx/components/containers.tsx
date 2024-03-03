import St from "@girs/st-13";
import {JSXComponent} from "../jsx-runtime";


export class Row extends JSXComponent<
    St.BoxLayout,
    Omit<St.BoxLayout.ConstructorProperties, 'vertical'>
> {
    render() {
        const box = new St.BoxLayout({
            vertical: false,
            ...this.props,
        });

        for (let child of this.children) {
            box.add_child(child);
        }

        return box;
    }
}


export class Column extends JSXComponent<
    St.BoxLayout,
    Omit<St.BoxLayout.ConstructorProperties, 'vertical'>
> {
    render() {
        const box = new St.BoxLayout({
            vertical: true,
            ...this.props,
        });

        for (let child of this.children) {
            box.add_child(child);
        }

        return box;
    }
}


export class Bin extends JSXComponent<
    St.Bin,
    St.Bin.ConstructorProperties
> {
    render() {
        const widget = new St.Bin({
            ...this.props,
        });

        if (this.children.length > 0) {
            widget.set_child(this.children[0]);
        }

        return widget;
    }
}


export class ScrollView extends JSXComponent<
    St.ScrollView,
    St.ScrollView.ConstructorProperties
> {
    render() {
        const widget = new St.ScrollView({
            ...this.props,
        });

        if (this.children.length > 0) {
            if (typeof this.children[0].hadjustment === 'undefined') {
                const viewport = new St.Viewport();
                viewport.add_child(this.children[0]);
                widget.add_actor(viewport);
            } else {
                widget.add_actor(this.children[0]);
            }
        }

        return widget;
    }
}

