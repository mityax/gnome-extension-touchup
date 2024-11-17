import St from "gi://St";
import GObject from "gi://GObject";
import Clutter from "gi://Clutter";
import {css} from "$src/utils/ui/css";
import * as BoxPointer from "resource:///org/gnome/shell/ui/boxpointer.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import Cogl from "gi://Cogl";
import Side = St.Side;


type DevToolButtonConstructorProps = {
    icon: string | St.Widget,
    label: string | St.Widget,
    onPressed: () => void,
};


export class DevToolButton extends St.Bin {
    static {
        GObject.registerClass(this);
    }

    public readonly icon: St.Widget;
    public readonly label: St.Widget;
    public readonly tooltip: BoxPointer.BoxPointer;

    constructor(props: DevToolButtonConstructorProps) {
        super({
            styleClass: 'panel-button',
            reactive: true,
            canFocus: true,
            xExpand: true,
            yExpand: false,
            trackHover: true,
        });

        this.icon = typeof props.icon === 'string'
            ? new St.Icon({
                iconName: props.icon,
                iconSize: 16,
            })
            : props.icon;
        this.set_child(this.icon);

        this.connect('button-release-event', props.onPressed);
        this.connect('touch-event', (_: any, e: Clutter.Event) => {
            if (e.type() === Clutter.EventType.TOUCH_END) {
                props.onPressed();
            }
        });

        this.label = typeof props.label !== 'string' ? props.label : new St.Label({
            text: props.label,
        });
        this.tooltip = new BoxPointer.BoxPointer(Side.TOP, {
            child: this.label,
            style: css({
                backgroundColor: '#1f1f1f',
                padding: '5px',
                borderRadius: '5px'
            }),
        });
        this.tooltip.setPosition(this, 0.5);
        this.tooltip.setSourceAlignment(0.5);
        this.tooltip.bin.translationY = 15;
        this.tooltip.hide();
        this.connect('notify::hover', () => {
            if (this.hover) {
                this.tooltip.open(false, () => {});
            } else {
                this.tooltip.close(false, () => {});
            }
        });
        Main.layoutManager.addTopChrome(this.tooltip);
    }

    vfunc_destroy() {
        super.destroy();
        this.tooltip.destroy();
    }
}


export class DevToolToggleButton extends DevToolButton {
    static {
        GObject.registerClass(this);
    }

    private _value: boolean = false;

    constructor(props: Omit<DevToolButtonConstructorProps, 'onPressed'> & {onPressed: (value: boolean) => void}) {
        super({
            icon: props.icon,
            label: props.label,
            onPressed: () => {
                this.value = !this.value;
                props.onPressed(this.value);
            }
        });
    }

    get value(): boolean {
        return this._value;
    }

    set value(value: boolean) {
        this._value = value;
        this.backgroundColor = value
            ? Cogl.Color.from_string('rgba(203,203,203,0.3)')[1]
            : Cogl.Color.from_string('rgba(0,0,0,0)')[1];
    }
}
