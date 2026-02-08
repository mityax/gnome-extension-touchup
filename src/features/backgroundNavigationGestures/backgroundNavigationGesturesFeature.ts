import ExtensionFeature from "$src/core/extensionFeature";
import {PatchManager} from "$src/core/patchManager";
import {settings} from "$src/settings";


export class BackgroundNavigationGesturesFeature extends ExtensionFeature {
    constructor(pm: PatchManager) {
        super(pm);

        this.defineSubFeature({
            name: 'desktop-background-gestures',
            create: async pm => {
                const m = await import("$src/features/backgroundNavigationGestures/_desktopBackgroundGestures");
                return new m.DesktopBackgroundGesturesFeature(pm);
            },
            setting: settings.backgroundNavigationGestures.desktopBackgroundGesturesEnabled,
        });

        this.defineSubFeature({
            name: 'overview-background-gestures',
            create: async pm => {
                const m = await import("$src/features/backgroundNavigationGestures/_overviewBackgroundGestures");
                return new m.OverviewBackgroundGesturesFeature(pm);
            },
            setting: settings.backgroundNavigationGestures.overviewBackgroundGesturesEnabled,
        });

        this.defineSubFeature({
            name: 'window-preview-gestures',
            create: async pm => {
                const m = await import("$src/features/backgroundNavigationGestures/_windowPreviewGestures");
                return new m.WindowPreviewGestureFeature(pm);
            },
            setting: settings.backgroundNavigationGestures.windowPreviewGesturesEnabled,
        });
    }
}
