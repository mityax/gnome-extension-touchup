import Adw from "gi://Adw";
import GObject from "gi://GObject";
import {settings} from "$src/settings";
import {buildPreferencesGroup, buildSwitchRow, buildToggleButtonRow} from "$src/features/preferences/uiUtils";
import Gtk from "gi://Gtk";
import Gdk from "gi://Gdk";
import {SettingsType} from "$src/features/preferences/backend";
import Gio from "gi://Gio";
import {AssetIcon} from "$src/utils/ui/assetIcon";
import {debounce} from "$src/utils/debounce";
import {DisplayConfigState} from "$src/utils/monitorDBusUtils";
import PropagationPhase = Gtk.PropagationPhase;


export class NavigationBarPage extends Adw.PreferencesPage {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super({
            name: 'navigation-bar',
            title: "Navigation Bar",
            icon_name: "computer-apple-ipad-symbolic",
        });

        this.add(buildPreferencesGroup({
            title: "Navigation Bar",
            description: "Configure the behavior and appearance of the navigation bar",
            children: [
                buildSwitchRow({
                    title: "Enable Navigation Bar",
                    subtitle: "Toggle to enable or disable the navigation bar feature",
                    setting: settings.navigationBar.enabled,
                }),
                buildToggleButtonRow<'gestures' | 'buttons'>({
                    title: "Navigation Bar Mode",
                    subtitle: "Choose which kind of navigation experience you prefer",
                    items: [
                        { label: "Gestures", value: "gestures" },
                        { label: "Buttons", value: "buttons" },
                    ],
                    setting: settings.navigationBar.mode,
                }),
                this.buildAlwaysShowOnMonitorRow({
                    title: "Always show on monitor",
                    subtitle: "Select a monitor to always show the navigation bar on",
                    tooltipText: "When a monitor is selected, the navigation bar is shown on it regardless of " +
                        "whether Gnome's \"touch mode\" is enabled or supported on this device. You can select the " +
                        "built-in monitor to make the navigation bar always show up.",
                    setting: settings.navigationBar.alwaysShowOnMonitor,
                }),
                buildSwitchRow({
                    title: "Primary monitor follows navigation bar",
                    subtitle: "Change the primary monitor to the one the navigation bar appears on, whenever it's visible",
                    setting: settings.navigationBar.primaryMonitorFollowsNavbar,
                }),
            ]
        }));

        this.add(buildPreferencesGroup({
            title: "Gestures Navigation Bar",
            children: [
                buildSwitchRow({
                    title: "Reserve Space",
                    subtitle: "Keep space available for the navigation bar to avoid overlaying windows. If disabled, " +
                        "the navigation bar is shown on top of overlapping windows and adjusts its color dynamically.",
                    setting: settings.navigationBar.gesturesReserveSpace,
                }),
            ],
            // Only show this group when mode is set to "gestures":
            onCreated: (group) => {
                const id = settings.navigationBar.mode.connect("changed", (mode) => group.visible = mode === 'gestures');
                group.connect('destroy', () => settings.navigationBar.mode.disconnect(id));
                group.visible = settings.navigationBar.mode.get() === 'gestures'
            },
        }));

        this.add(buildPreferencesGroup({
            title: 'Buttons Navigation Bar',
            children: [
                this.buildButtonsRow(),
            ],
            // Only show this group when mode is set to "buttons":
            onCreated: (group) => {
                const id = settings.navigationBar.mode.connect("changed", (mode) => group.visible = mode === 'buttons');
                group.connect('destroy', () => settings.navigationBar.mode.disconnect(id));
                group.visible = settings.navigationBar.mode.get() === 'buttons';
            },
        }));
    }

    private buildButtonsRow() {
        type OptionId = SettingsType<typeof settings.navigationBar.buttonsLeft>[0];
        type Option = {id: OptionId, icon: Gio.Icon};

        // TODO: Add some typescript logic to assert exhaustiveness:
        const allButtons: Option[] = [
            { id: 'keyboard' as OptionId,           icon: Gio.ThemedIcon.new('input-keyboard-symbolic') },
            { id: 'workspace-previous' as OptionId, icon: Gio.ThemedIcon.new('go-previous-symbolic') },
            { id: 'workspace-next' as OptionId,     icon: Gio.ThemedIcon.new('go-next-symbolic') },
            { id: 'overview' as OptionId,           icon: new AssetIcon('box-outline-symbolic') },
            { id: 'apps' as OptionId,               icon: new AssetIcon('grid-large-symbolic') },
            { id: 'back' as OptionId,               icon: new AssetIcon('arrow2-left-symbolic') },
            { id: 'spacer' as OptionId,             icon: Gio.ThemedIcon.new('content-loading-symbolic') },
        ];

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 10
        });

        const leftButtonsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 10,
            hexpand: true,
            halign: Gtk.Align.START,
            cssClasses: ['navigation-bar-page__drop-target'],
        });
        createDropTarget(leftButtonsBox);

        const middleButtonsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 10,
            hexpand: true,
            halign: Gtk.Align.CENTER,
            cssClasses: ['navigation-bar-page__drop-target'],
        });
        createDropTarget(middleButtonsBox);

        const rightButtonsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 10,
            hexpand: true,
            halign: Gtk.Align.END,
            cssClasses: ['navigation-bar-page__drop-target'],
        });
        createDropTarget(rightButtonsBox);

        const unusedBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 10,
            hexpand: true,
            cssClasses: ['navigation-bar-page__drop-target', 'navigation-bar-page__drop-target--unused']
        });
        createDropTarget(unusedBox);

        const navbarBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 5,
        })

        navbarBox.append(leftButtonsBox);
        navbarBox.append(middleButtonsBox);
        navbarBox.append(rightButtonsBox);

        box.append(new Gtk.Label({
            label: "Navigation Bar Layout",
            halign: Gtk.Align.START,
        }));
        box.append(new Gtk.Label({
            label: "Configure your navigation bar layout by dragging buttons into the left, middle or right box.",
            halign: Gtk.Align.START,
            cssClasses: ['subtitle']
        }));
        box.append(navbarBox);
        box.append(new Gtk.Label({
            label: "Place buttons you don't want to use in the navigation bar in this box:",
            halign: Gtk.Align.START,
            cssClasses: ['subtitle']
        }));
        box.append(unusedBox);

        function createDragSource(parent: Gtk.Box, o: Option) {
            const dragSource = new Gtk.DragSource({
                actions: Gdk.DragAction.MOVE,
                content: Gdk.ContentProvider.new_for_value(o.id),
                propagationPhase: PropagationPhase.CAPTURE,
            });
            const but = new Gtk.Box({
                cssClasses: ['navigation-bar-page__drop-target__item'],
                tooltipText: o.id,
            });
            // @ts-ignore
            but._optionId = o.id;
            but.append(new Gtk.Image({ gicon: o.icon }))
            dragSource.connect('drag-end', (_source, drag, delete_data) => {
                if (delete_data && !(o.id === 'spacer' && parent === unusedBox)) parent.remove(but);
                return true;
            });
            but.add_controller(dragSource);

            // We need to mark the child as a drop target too, such that others can be dropped on top of it. The
            // dropping logic is still handled by the outer drop zone though:
            but.add_controller(new Gtk.DropTarget());

            return but;
        }

        function createDropTarget(parent: Gtk.Box) {
            const target = new Gtk.DropTarget({
                actions: Gdk.DragAction.MOVE,
                formats: Gdk.ContentFormats.new_for_gtype(GObject.TYPE_STRING),
                preload: true,
                propagationPhase: PropagationPhase.CAPTURE,
            });
            parent.add_controller(target);

            target.connect('accept', (_source, drop) => true);
            target.connect('drop', (_source, value: OptionId, x, y) => {
                if (!(value === 'spacer' && parent === unusedBox)) {
                    let prevChild = null;
                    for (let child = parent.get_first_child(); !!child; child = child?.get_next_sibling() ?? null) {
                        if (x >= child.get_allocation().x + child.get_allocated_width() / 2) {
                            prevChild = child;
                        }
                    }
                    parent.insert_child_after(createDragSource(parent, allButtons.find(b => b.id === value)!), prevChild);
                }
                onChanged();
                return true;
            });
            return target;
        }

        for (let o of settings.navigationBar.buttonsLeft.get()) {
            leftButtonsBox.append(createDragSource(leftButtonsBox, allButtons.find(b => b.id === o)!));
        }
        for (let o of settings.navigationBar.buttonsMiddle.get()) {
            middleButtonsBox.append(createDragSource(middleButtonsBox, allButtons.find(b => b.id === o)!));
        }
        for (let o of settings.navigationBar.buttonsRight.get()) {
            rightButtonsBox.append(createDragSource(rightButtonsBox, allButtons.find(b => b.id === o)!));
        }

        const usedButtons = [
            ...settings.navigationBar.buttonsLeft.get(),
            ...settings.navigationBar.buttonsMiddle.get(),
            ...settings.navigationBar.buttonsRight.get()
        ]
        for (let o of allButtons.filter(b => !usedButtons.includes(b.id) || b.id === 'spacer')) {
            unusedBox.append(createDragSource(unusedBox, o));
        }

        const onChanged = debounce(() => {
            const leftButtons = [],
                  middleButtons = [],
                  rightButtons = [];

            for (let child = leftButtonsBox.get_first_child(); !!child; child = child?.get_next_sibling()) {
                // @ts-ignore
                leftButtons.push(child._optionId);
            }
            for (let child = middleButtonsBox.get_first_child(); !!child; child = child?.get_next_sibling()) {
                // @ts-ignore
                middleButtons.push(child._optionId);
            }
            for (let child = rightButtonsBox.get_first_child(); !!child; child = child?.get_next_sibling()) {
                // @ts-ignore
                rightButtons.push(child._optionId);
            }

            settings.navigationBar.buttonsLeft.set(leftButtons);
            settings.navigationBar.buttonsMiddle.set(middleButtons);
            settings.navigationBar.buttonsRight.set(rightButtons);
        }, 250);

        return new Adw.PreferencesRow({
            title: "Navigation Bar Buttons",
            child: box,
            cssClasses: ['navigation-bar-page__buttons-bar-layout']
        });
    }

    private buildAlwaysShowOnMonitorRow(props: {
        title: string,
        subtitle: string,
        tooltipText?: string,
        setting: typeof settings.navigationBar.alwaysShowOnMonitor,
    }) {
        let monitors: ({name: string, id: string} | null)[] = [];
        const initiallySelected = props.setting.get();
        const model = new Gtk.StringList();

        const row = new Adw.ComboRow({
            title: props.title,
            subtitle: props.subtitle,
            tooltipText: props.tooltipText,
            model: model,
        });

        const onChangeHandlerId = row.connect('notify::selected-item', ()  => {
            const monitor = monitors[row.selected];
            props.setting.set(monitor);
        });

        const refreshButton = new Gtk.Button({
            iconName: 'view-refresh-symbolic',
            valign: Gtk.Align.CENTER,
            marginStart: 10
        });
        refreshButton.connect('clicked', () => updateMonitors());
        row.add_suffix(refreshButton);

        async function updateMonitors() {
            const state = await DisplayConfigState.getCurrent();

            row.block_signal_handler(onChangeHandlerId);

            // Keep track of the originally selected item:
            const selected = row.selected !== Gtk.INVALID_LIST_POSITION
                ? monitors[row.selected]
                : initiallySelected;

            const newMonitors: typeof monitors = [ null ];  // `null` is the "None" value

            // Add the initially selected monitor in case it is not connected right now:
            if (initiallySelected && !state.monitors.some(m => m.constructMonitorId() === initiallySelected.id)) {
                newMonitors.push(initiallySelected);
            }

            // Add all currently connected monitors:
            for (let monitor of state.monitors) {
                newMonitors.push({
                    name: `${monitor.vendorName} (${monitor.productSerial})`,
                    id: monitor.constructMonitorId(),
                })
            }

            // Derive a list of dropdown item labels from the monitors:
            const newComboboxItems: string[] = [];
            for (let monitor of newMonitors) {
                if (monitor === null) {
                    newComboboxItems.push("None");
                } else if (!state.monitors.some(m => m.constructMonitorId() === monitor.id)) {
                    newComboboxItems.push(`${monitor.name} (disconnected)`);
                } else if (state.monitors.find(m => m.constructMonitorId() === monitor.id)?.isBuiltin) {
                    newComboboxItems.push(`Built-in display`);
                } else {
                    newComboboxItems.push(monitor.name);
                }
            }

            // Replace all dropdown items with the new ones:
            model.splice(0, model.get_n_items(), newComboboxItems);
            monitors = newMonitors;

            // Restore the originally selected item:
            const newSelectedIdx = newMonitors.findIndex(m => m?.id === selected?.id);
            row.set_selected(newSelectedIdx === -1 ? 0 : newSelectedIdx);

            row.unblock_signal_handler(onChangeHandlerId);
        }

        // Perform initial update:
        updateMonitors().then(() => {});

        return row;
    }
}
