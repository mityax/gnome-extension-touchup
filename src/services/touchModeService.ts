import ExtensionFeature from "$src/utils/extensionFeature";
import {PatchManager} from "$src/utils/patchManager";
import Signal from "$src/utils/signal";
import Clutter from "gi://Clutter";


export class TouchModeService extends ExtensionFeature {
    private _enforceTouchMode: boolean = false;
    readonly onChanged: Signal<boolean> = new Signal<boolean>();

    constructor(pm: PatchManager) {
        super(pm);

        this.pm.connectTo(
            Clutter.get_default_backend().get_default_seat(),
            'notify::touch-mode',
            () => this._onChanged(),
        );
    }

    private _onChanged() {
        this.onChanged.emit(this.isTouchModeActive);
    }

    get isTouchModeActive(): boolean {
        return this.enforceTouchMode || Clutter.get_default_backend().get_default_seat().touchMode;
    }

    get enforceTouchMode(): boolean {
        return this._enforceTouchMode;
    }

    set enforceTouchMode(value: boolean) {
        this._enforceTouchMode = value;
        this._onChanged();
    }
}
