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


const MAX_LOG_HISTORY = 500;


export class DevelopmentLogDisplayButton extends DevToolToggleButton {
    static {
        GObject.registerClass(this);
    }

    private logDisplays: St.Widget[] = [];
    private readonly logAddedCallbacks: LogCallback[] = [];
    private readonly logCallbackId: number;

    constructor(props?: {initialValue?: boolean, onPressed?: (value: boolean) => void, ref?: Widgets.Ref<DevelopmentLogDisplayButton>}) {
        super({
            label: 'Show log display',
            icon: 'format-justify-left-symbolic',
            onPressed: (value) => {
                this._onPressed(value);
                props?.onPressed?.(value);
            },
            ref: props?.ref,
        });
        this.value = props?.initialValue ?? true;

        this.logCallbackId = addLogCallback((t) => {
            this.addLogItem(t);
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

        display.updateAllocation();

        const id = global.backend.get_monitor_manager().connect('monitors-changed', () => display.updateAllocation());
        display.connect('destroy', () => global.backend.get_monitor_manager().disconnect(id));
    }

    private _createLogDisplay(): LogDisplay {
        const display = new LogDisplay();
        const cb = (msg: LogCallbackArguments) => display.addLogMessage(msg);

        this.logAddedCallbacks.push(cb);

        display.connect('destroy', () => {
            this.logAddedCallbacks.splice(this.logAddedCallbacks.findIndex(c => c === cb), 1);
            this.logDisplays.splice(this.logDisplays.findIndex(d => d === display), 1);
        });

        this.logDisplays.push(display);

        return display;
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

    public addLogItem(item: LogCallbackArguments) {
        this.logAddedCallbacks.forEach((c) => c(item));
    }
}


class LogDisplay extends Widgets.Column {
    static {
        GObject.registerClass(this);
    }

    private logMsgContainer: Ref<Widgets.Column>;
    private scrollView: Ref<Widgets.ScrollView>;
    private searchEntry: Ref<Widgets.Entry>;

    constructor() {
        const logMsgColumn = new Ref<Widgets.Column>();
        const scrollView = new Ref<Widgets.ScrollView>();
        const searchEntry = new Ref<Widgets.Entry>();

        const sf = St.ThemeContext.get_for_stage(global.stage as Stage).scaleFactor;

        super({
            style: css({
                backgroundColor: 'rgba(0,0,0,0.7)',
                color: 'white',
                padding: '15px',
                borderRadius: '10px',
            }),
            children: [
                new Widgets.Row({
                    style: css({ paddingBottom: '5px' }),
                    children: [
                        new Widgets.Entry({
                            ref: searchEntry,
                            notifyText: () => this._applySearch(searchEntry.current!.text),
                            width: 350 * sf,
                            hintText: "Search…",
                            primaryIcon: new Widgets.Icon({
                                iconName: 'folder-saved-search-symbolic',
                                iconSize: 16,
                            }),
                            secondaryIcon: new Widgets.Button({
                                child: new Widgets.Icon({
                                    iconName: 'edit-clear-symbolic',
                                    iconSize: 16,
                                }),
                                onClicked: () => this.searchEntry.current!.text = "",
                            }),
                        }),
                        new Widgets.Bin({
                            xExpand: true,
                        }),
                        new Widgets.Button({
                            child: new Widgets.Icon({
                                iconName: 'folder-download-symbolic',
                                iconSize: 16,
                            }),
                            width: 30 * sf,
                            style: css({ padding: '5px' }),
                            onClicked: () => scrollView.apply((sv) => {
                                sv.vadjustment.ease(sv.vadjustment.upper, {
                                    duration: 200,
                                })
                            }),
                        }),
                        new Widgets.Button({
                            child: new Widgets.Icon({
                                iconName: 'user-trash-symbolic',
                                iconSize: 16,
                            }),
                            width: 30 * sf,
                            style: css({ padding: '5px' }),
                            onClicked: () => this.logMsgContainer.current?.destroy_all_children(),
                        }),
                    ],
                }),
                new Widgets.ScrollView({
                    ref: scrollView,
                    child: new Widgets.Column({
                        ref: logMsgColumn,
                    }),
                    hscrollbarPolicy: PolicyType.AUTOMATIC,
                    vscrollbarPolicy: PolicyType.AUTOMATIC,
                })
            ],
        });

        this.logMsgContainer = logMsgColumn;
        this.scrollView = scrollView;
        this.searchEntry = searchEntry;
    }

    addLogMessage(msg: LogCallbackArguments) {
        // Check whether the log display is scrolled to the bottom and schedule auto-scroll down if so:
        const a = this.scrollView.current?.get_vadjustment();
        if (a && a.value < a.upper - this.scrollView.current!.contentBox.get_height() - 25 * this._scaleFactor) {
            Delay.ms(100).then(() => {
                if (this.scrollView.current) a.set_value(a.upper);
            });
        }

        // Remove first log message if there are too many:
        if ((this.logMsgContainer.current?.get_n_children() ?? 0) > MAX_LOG_HISTORY) {
            this.logMsgContainer.current!.remove_child(this.logMsgContainer.current!.get_child_at_index(0)!);
        }

        if (this.logMsgContainer.current?.get_last_child() != null) {
            const text = findActorBy(this.logMsgContainer.current.get_last_child()!,
                e => (e as St.Widget).styleClass === 'log-item__text') as Widgets.Label;
            const counter = findActorBy(this.logMsgContainer.current.get_last_child()!,
                e => (e as St.Widget).styleClass === 'log-item__duplicates-counter') as Widgets.Label;

            if (text.text === msg.formattedMessage) {
                counter.text = `${Number.parseInt(counter.text) + 1}`;
                counter.show();

                return;
            }
        }

        // Add the log message:
        this.logMsgContainer.current?.add_child(this._buildNewLogMessage(msg));
        this._applySearch(this.searchEntry.current!.text, {from: (this.logMsgContainer.current?.get_n_children() ?? 1) - 1});
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

    private get _scaleFactor() {
        return St.ThemeContext.get_for_stage(global.stage as Stage).scaleFactor;
    }

    private _applySearch(query: string, opts?: {from?: number, to?: number}) {
        query = query.trim().toLowerCase();

        const children = this.logMsgContainer.current!
            .get_children()
            .slice(opts?.from, opts?.to);

        if (query.length === 0) {
            children.forEach(child => child.show());
        } else {
            for (const child of children) {
                const label = findActorBy(child,
                    e => (e as St.Widget).styleClass === 'log-item__text') as Widgets.Label;
                const text = label.text;

                if (!text.toLowerCase().includes(query)) {
                    child.hide();
                } else {
                    child.show();
                }
            }
        }
    }

    updateAllocation() {
        const margin = 15 * St.ThemeContext.get_for_stage(global.stage as Stage).scaleFactor;
        const monitor = Main.layoutManager.primaryMonitor! ?? Main.layoutManager.monitors[0];

        if (monitor !== undefined) {
            this.set_position(monitor.x + margin, monitor.y + Main.panel.height + margin);
            this.set_size(
                clamp(monitor.width * 0.5, 500, 1800),
                clamp(monitor.height * 0.5, 500, 1800),
            );
        }
    }
}

