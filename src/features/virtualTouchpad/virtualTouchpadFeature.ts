import St from "gi://St";
import {MonitorConstraint} from "resource:///org/gnome/shell/ui/layout.js";
import {PatchManager} from "$src/utils/patchManager";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import Clutter from "gi://Clutter";
import {Widgets} from "$src/utils/ui/widgets";
import {debugLog} from "$src/utils/logging";
import ExtensionFeature from "$src/utils/extensionFeature.ts";
import {VirtualTouchpadQuickSettingsItem} from "$src/features/virtualTouchpad/virtualTouchpadQuickSettingsItem.ts";
import {css} from "$src/utils/ui/css.ts";
import ActorAlign = Clutter.ActorAlign;


export class VirtualTouchpadFeature extends ExtensionFeature {
    public static readonly PATCH_SCOPE: unique symbol = Symbol('virtual-touchpad');
    private readonly actor: St.Widget;
    private readonly openButton: VirtualTouchpadQuickSettingsItem;

    constructor(pm: PatchManager) {
        super(pm);

        const buttonRef = new Widgets.Ref<Widgets.Button>();

        this.actor = new Widgets.Bin({
            name: 'gnometouch-virtual-touchpad',
            visible: false,
            reactive: true,
            trackHover: true,
            canFocus: true,
            style: css({
                backgroundColor: 'black',
            }),
            constraints: [
                new Clutter.BindConstraint({
                    source: Main.uiGroup,
                    coordinate: Clutter.BindCoordinate.ALL,
                }),
                new MonitorConstraint({
                    workArea: true,
                    primary: true,  // TODO: show on touch-enabled monitor instead of primary one
                }),
            ],
            onTouchEvent: (_, e) => {
                debugLog("Virtual touchpad touch event: ", e);
            },
            child: new Widgets.Button({
                child: new Widgets.Icon({
                    iconName: 'edit-delete-symbolic',
                    iconSize: 25,
                    style: css({ color: 'white' }),
                }),
                ref: buttonRef,
                reactive: true,
                trackHover: true,
                canFocus: true,
                xAlign: ActorAlign.END,
                yAlign: ActorAlign.START,
                onClicked: () => {
                    debugLog('Virtual Touchpad Close Button Clicked');
                    this.close();
                },
            }),
        });
        DEBUG: this.actor.opacity = 0.7 * 255;  // a little transparency in debug mode to see the logs below ;)

        this.pm.patch(() => {
            Main.layoutManager.addChrome(this.actor, {
                affectsStruts: false,
                trackFullscreen: false,
                affectsInputRegion: true,
            });
            return () => Main.layoutManager.removeChrome(this.actor);
        });

        // Add virtual touchpad open button to panel:
        this.openButton = new VirtualTouchpadQuickSettingsItem(() => this.toggle());
        this.pm.patch(() => {
            Main.panel.statusArea.quickSettings._system._systemItem.child.insert_child_at_index(
                this.openButton,
                2,  // add after battery indicator and spacer
            );
            return () => this.openButton?.destroy();
        });
    }

    open() {
        this.actor.show();
    }

    close() {
        this.actor.hide();
    }

    toggle() {
        if (this.actor.visible) {
            this.actor.hide();
        } else {
            this.actor.show();
        }
    }

    /**
     * Set whether the virtual touchpad can be opened at the moment.
     *
     * This effectively updates the visibility of the open button in the quick settings
     * menu and, if [canOpen] is `false`, closes the touchpad if it is open.
     */
    setCanOpen(canOpen: boolean) {
        this.openButton.visible = canOpen;
        if (!canOpen) this.close();
    }
}
