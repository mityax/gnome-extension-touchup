import * as Main from "resource:///org/gnome/shell/ui/main.js";

import ExtensionFeature from "$src/utils/extensionFeature";
import {PatchManager} from "$src/utils/patchManager";
import {OverviewGestureController, WorkspaceGestureController} from "$src/utils/overviewAndWorkspaceGestureController";
import {
    OverviewBackgroundGesturesFeature
} from "$src/features/backgroundNavigationGestures/_overviewBackgroundGestures";
import {WindowPreviewGestureFeature} from "$src/features/backgroundNavigationGestures/_windowPreviewGestures";
import {DesktopBackgroundGesturesFeature} from "$src/features/backgroundNavigationGestures/_desktopBackgroundGestures";
import {settings} from "$src/settings";


export class BackgroundNavigationGesturesFeature extends ExtensionFeature {
    private readonly _overviewController: OverviewGestureController;
    private readonly _wsController: WorkspaceGestureController;

    constructor(pm: PatchManager) {
        super(pm);

        this._overviewController = new OverviewGestureController();
        this._wsController = new WorkspaceGestureController({
            monitorIndex: Main.layoutManager.primaryIndex
        });

        this.addSubFeature(
            'desktop-background-gestures',
            pm => new DesktopBackgroundGesturesFeature({
                pm,
                overviewController: this._overviewController,
                wsController: this._wsController,
            }),
            settings.backgroundNavigationGestures.desktopBackgroundGesturesEnabled,
        );

        this.addSubFeature(
            'overview-background-gestures',
            pm => new OverviewBackgroundGesturesFeature({
                pm,
                overviewController: this._overviewController,
                wsController: this._wsController,
            }),
            settings.backgroundNavigationGestures.overviewBackgroundGesturesEnabled,
        )

        this.addSubFeature(
            'window-preview-gestures',
            pm => new WindowPreviewGestureFeature(pm),
            settings.backgroundNavigationGestures.windowPreviewGesturesEnabled,
        )
    }

    destroy() {
        this._overviewController.destroy();
        this._wsController.destroy();
        super.destroy();
    }
}
