import St from "gi://St";
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Widgets from "$src/utils/ui/widgets";
import Clutter from "gi://Clutter";
import {clamp, findActorBy} from "$src/utils/utils";
import {css} from "$src/utils/ui/css";
import {addLogCallback, LogCallback, LogCallbackArguments, removeLogCallback} from "$src/utils/logging";
import GObject from "gi://GObject";
import {DevToolToggleButton} from "$src/features/developmentTools/developmentToolButton";
import {Delay} from "$src/utils/delay";
import Pango from "gi://Pango";
import Cogl from "gi://Cogl";
import Stage = Clutter.Stage;
import PolicyType = St.PolicyType;
import Ref = Widgets.Ref;
import ActorAlign = Clutter.ActorAlign;


export class DevelopmentLogDisplayButton extends DevToolToggleButton {
    static readonly MAX_LENGTH = 500;

    static {
        GObject.registerClass(this);
    }

    private logDisplays: St.Widget[] = [];
    private readonly logAddedCallbacks: LogCallback[] = [];
    private readonly logCallbackId: number;

    constructor(props?: {initialValue?: boolean, onPressed?: (value: boolean) => void}) {
        super({
            label: 'Show log display',
            icon: 'format-justify-left-symbolic',
            onPressed: (value) => {
                this._onPressed(value);
                props?.onPressed?.(value);
            },
        });
        this.value = props?.initialValue ?? true;

        this.logCallbackId = addLogCallback((t) => {
            this.logAddedCallbacks.forEach((c) => c(t))
        });

        this._addDisplays();

        this._onPressed(props?.initialValue ?? true);  // update initial visibility
    }

    private _addDisplays() {
        // At the moment we only create one log display and keep it on the primary monitor, however
        // should one want to add multiple log displays mirroring the same content, this is the
        // only method that needs to be changed.

        const display = this._createLogDisplay();
        global.window_group.add_child(display);
        // @ts-ignore
        global.window_group.set_child_above_sibling(display, Main.layoutManager._backgroundGroup);

        const updatePos = () => {
            const monitor = Main.layoutManager.primaryMonitor!;
            const margin = 15 * St.ThemeContext.get_for_stage(global.stage as Stage).scaleFactor;

            display.set_position(monitor.x + margin, monitor.y + Main.panel.height + margin);
        }

        updatePos();

        const id = global.backend.get_monitor_manager().connect('monitors-changed', () => updatePos());
        display.connect('destroy', () => global.backend.get_monitor_manager().disconnect(id));
    }

    private _createLogDisplay(): St.Widget {
        const scaleFactor = St.ThemeContext.get_for_stage(global.stage as Stage).scaleFactor;

        const col = new Ref<Widgets.Column>();
        const display = new Widgets.ScrollView({
            child: new Widgets.Column({
                ref: col,
            }),
            width: clamp(global.screenWidth * 0.5, 250 * scaleFactor, 900 * scaleFactor),
            height: clamp(global.screenHeight * 0.5, 250 * scaleFactor, 900 * scaleFactor),
            hscrollbarPolicy: PolicyType.AUTOMATIC,
            vscrollbarPolicy: PolicyType.AUTOMATIC,
            style: css({
                backgroundColor: 'rgba(0,0,0,0.7)',
                color: 'white',
                padding: '15px',
                borderRadius: '10px',
            }),
        });

        const callback: LogCallback = (msg) => {
            // Check whether the log display is scrolled to the bottom and schedule auto-scroll down if so:
            const a = display.get_vadjustment();
            if (a.value < a.upper - display.contentBox.get_height() - 25 * scaleFactor) {
                Delay.ms(100).then(() => {
                    if (this.logDisplays.includes(display)) a.set_value(a.upper);
                });
            }

            // Remove first log message if there are too many:
            if ((col.current?.get_n_children() ?? 0) > DevelopmentLogDisplayButton.MAX_LENGTH) {
                col.current!.remove_child(col.current!.get_child_at_index(0)!);
            }

            if (col.current?.get_last_child() != null) {
                const text = findActorBy(col.current.get_last_child()!,
                    e => (e as St.Widget).styleClass === 'log-item__text') as Widgets.Label;
                const counter = findActorBy(col.current.get_last_child()!,
                    e => (e as St.Widget).styleClass === 'log-item__duplicates-counter') as Widgets.Label;

                if (text.text === msg.formattedMessage) {
                    counter.text = `${Number.parseInt(counter.text) + 1}`;
                    counter.visible = true;

                    return;
                }
            }

            // Add the log message:
            col.current?.add_child(this._buildNewLogMessage(msg));
        };

        this.logAddedCallbacks.push(callback);
        display.connect('destroy', () => {
            this.logAddedCallbacks.splice(this.logAddedCallbacks.findIndex(c => c === callback), 1);
            this.logDisplays.splice(this.logDisplays.findIndex(d => d === display), 1);
        });

        this.logDisplays.push(display);

        return display;
    }

    private _buildNewLogMessage(msg: LogCallbackArguments) {
        return new Widgets.Row({
            xAlign: ActorAlign.FILL,
            style: css({
                backgroundColor: {
                    'debug': "rgba(255,255,255,0.2)",
                    'info': "rgba(180,255,255,0.2)",
                    'warn': "rgba(255,255,180,0.2)",
                    'error': "rgba(255,180,180,0.2)",
                }[msg.level],
                borderRadius: "7px",
                padding: "7px",
                marginTop: "7px",
                fontFamily: "monospace",
                fontSize: '9pt',
                color: {
                    'debug': 'white',
                    'info': 'aqua',
                    'warn': 'orange',
                    'error': 'salmon',
                }[msg.level]
            }),
            styleClass: ['log-item', `log-item--${msg.level}`],
            children: [
                new Widgets.Label({
                    xExpand: true,
                    text: msg.formattedMessage,
                    styleClass: 'log-item__text',
                    onCreated: (l) => {
                        l.clutterText.lineWrap = true;
                        l.clutterText.lineWrapMode = Pango.WrapMode.WORD_CHAR;
                        l.clutterText.ellipsize = Pango.EllipsizeMode.NONE;
                        l.clutterText.selectable = true;
                        l.clutterText.reactive = true;
                        l.clutterText.selectionColor = Cogl.Color.from_string('rgba(255,255,255,0.3)')[1];
                    },
                }),
                new Widgets.Label({
                    text: '1',
                    styleClass: 'log-item__duplicates-counter',
                    visible: false,
                    xAlign: Clutter.ActorAlign.END,
                    yAlign: Clutter.ActorAlign.START,
                    style: css({
                        fontSize: '7pt',
                        fontWeight: 'bold',
                        backgroundColor: 'white',
                        color: 'black',
                        padding: '1px 5px',
                        borderRadius: '50px',
                        marginRight: '5px',
                    }),
                }),
                new Widgets.Label({
                    text: new Date().toLocaleTimeString(),
                    style: css({fontSize: '7pt'}),
                    xAlign: ActorAlign.END,
                }),
            ],
        });
    }

    private _onPressed(value: boolean) {
        for (let d of this.logDisplays) {
            d.visible = value;
        }
    }

    vfunc_destroy() {
        removeLogCallback(this.logCallbackId);
        this.logDisplays.forEach((d) => d.destroy());
        this.logDisplays = [];
        super.destroy();
    }
}
