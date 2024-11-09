import {findActorByName} from "$src/utils/utils";
import ExtensionFeature from "$src/utils/extensionFeature";
import {settings} from "$src/features/preferences/settings";
import St from "@girs/st-15";
import GnomeTouchExtension from "$src/extension";
import {log} from "$src/utils/logging";

export class DashToDockIntegration extends ExtensionFeature {
    constructor() {
        super();

        this.connectTo(settings.navigationBar.enabled, 'changed', this.onNavigationBarEnabledChanged.bind(this));
        this.connectTo(settings.navigationBar.mode, 'changed', this.update.bind(this));
        this.onNavigationBarEnabledChanged(settings.navigationBar.enabled.get());
    }

    private update() {
        const actor = findActorByName(global.stage, 'dashtodockContainer') as St.Widget;

        actor.remove_style_class_name("gnometouch-margin-bottom-buttons");
        actor.remove_style_class_name("gnometouch-margin-bottom-gestures");

        if (GnomeTouchExtension.instance?.navigationBar?.isVisible) {
            actor.add_style_class_name(`gnometouch-margin-bottom-${settings.navigationBar.mode.get()}`);
        }

        log("Style class names: ", actor.style_class);
    }

    private onNavigationBarEnabledChanged(enabled: boolean) {
        if (enabled) {
            this.connectTo(GnomeTouchExtension.instance!.navigationBar!.onVisibilityChanged, 'changed', this.update.bind(this));
        }
        this.update();
    }
}
