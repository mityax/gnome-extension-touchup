import ExtensionFeature from "$src/utils/extensionFeature";
import {PatchManager} from "$src/utils/patchManager";
import {
    OverviewBackgroundGesturesFeature
} from "$src/features/backgroundNavigationGestures/_overviewBackgroundGestures";
import {WindowPreviewGestureFeature} from "$src/features/backgroundNavigationGestures/_windowPreviewGestures";
import {DesktopBackgroundGesturesFeature} from "$src/features/backgroundNavigationGestures/_desktopBackgroundGestures";
import {settings} from "$src/settings";


export class BackgroundNavigationGesturesFeature extends ExtensionFeature {
    constructor(pm: PatchManager) {
        super(pm);

        this.addSubFeature(
            'desktop-background-gestures',
            pm => new DesktopBackgroundGesturesFeature(pm),
            settings.backgroundNavigationGestures.desktopBackgroundGesturesEnabled,
        );

        this.addSubFeature(
            'overview-background-gestures',
            pm => new OverviewBackgroundGesturesFeature(pm),
            settings.backgroundNavigationGestures.overviewBackgroundGesturesEnabled,
        )

        this.addSubFeature(
            'window-preview-gestures',
            pm => new WindowPreviewGestureFeature(pm),
            settings.backgroundNavigationGestures.windowPreviewGesturesEnabled,
        )
    }
}
