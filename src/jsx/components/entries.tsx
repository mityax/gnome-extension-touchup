import '@girs/gjs';

import St from "@girs/st-13";
import {JSXComponent, Ref} from "../jsx-runtime";
import * as Main from "@girs/gnome-shell/ui/main";

import {ScrollView} from './containers';
import Pango from "@girs/pango-1.0";
import Clutter from "@girs/clutter-13";
import WrapMode = Pango.WrapMode;


export class Entry extends JSXComponent<
    St.Entry,
    St.Entry.ConstructorProperties
> {
    render() {
        const widget = new St.Entry(this.props);
        this.setupEventHandlers(widget);
        return widget;
    }
}


export interface TextAreaProperties {
    'on:activate'?: (e: any) => void;
    natural_width?: number;
    text?: string;
    entryRef?: Ref<St.Entry>;
    hintText?: string;
}


export class TextArea extends JSXComponent<
    St.Widget,
    TextAreaProperties
> {
    render() {
        const theme = this.getTheme();
        const borderColor = theme.get_foreground_color().copy();
        borderColor.alpha = 100;

        const entryRef = this.props.entryRef || new Ref<St.Entry>();

        const widget = (
            <ScrollView
                overlay_scrollbars={true}
                style={{
                    background: theme.get_background_color(),
                    border: [theme.get_border_width(St.Side.TOP) + 'px', theme.get_border_color(St.Side.TOP), 'solid'],
                    borderRadius: '99px',
                    transition: "border-radius 0.3s"
                }}
                can_focus={false}>
                <Entry
                    name="promptEntry"
                    ref={entryRef}
                    natural_width={this.props.natural_width || null}
                    width={this.props.natural_width || null}
                    text={this.props.text || null}
                    style={{
                        background: 'transparent',
                        border: 'none !important',
                        color: theme.get_foreground_color()
                    }}
                    can_focus={true}
                    hint_text={this.props.hintText || null}
                    reactive={true}
                    track_hover={true}
                    x_expand={true}
                    y_expand={true} />
            </ScrollView>
        );

        entryRef.value.clutterText.singleLineMode = false;
        entryRef.value.clutterText.lineWrap = true;
        entryRef.value.clutterText.lineWrapMode = WrapMode.WORD_CHAR;
        entryRef.value.clutterText.activatable = true;

        entryRef.value.clutterText.connect("text-changed", (w) => {
            const newRadius = w.text!.split(/\r\n|\r|\n/).length == 1 ? "99px" : "10px";
            widget.value.style = widget.value.style!.replaceAll(
                /(?<=(\W|^))border-radius:.*?;/g,
                `border-radius: ${newRadius};`,
            );
        })

        // The following are attempts to fix the missing reactivity that sometimes occurs
        // when one tries to click the area of the entry that is not filled with text:
        // FIXME
        entryRef.value.clutterText.xExpand = true;
        entryRef.value.clutterText.yExpand = true;
        entryRef.value.clutterText.contentGravity = Clutter.ContentGravity.RESIZE_FILL;
        entryRef.value.contentGravity = Clutter.ContentGravity.RESIZE_FILL;

        this.setupEventHandlers(entryRef.value.clutterText);

        return widget;
    }

    private getTheme() {
        const ctx= St.ThemeContext.get_for_stage(Main.panel.get_stage());

        return St.ThemeNode.new(
            ctx,
            Main.panel.statusArea.quickSettings.get_theme_node(), /* parent node */
            ctx.get_theme(),
            St.Entry,
            '', /* id */
            'search-entry', /* class */
            '', /* pseudo class */
            '',
        );
    }
}

