import {assert} from "$src/utils/logging";

type HandlerT<T> = (args: T) => void;


/**
 * @deprecated New classes should extend [EventEmitter] instead of using this class
 */
export default class Signal<T> {
    private readonly listeners: Map<number, (args: T) => void> = new Map();
    private _signalIdCounter = 0;

    emit(args: T) {
        for (let l of this.listeners.values()) {
            l(args);
        }
    }

    connect(signal: HandlerT<T>): number
    // Add an overload with a dummy signal name to keep this signature compatible with GObjects:
    connect(signal: 'changed' | string, handler: HandlerT<T>): number
    connect(signal: string | HandlerT<T>, handler?: HandlerT<T>): number {
        assert(typeof signal !== 'string' || signal === 'changed', 'The only supported signal for now is `changed`');

        let id = this._signalIdCounter++;
        this.listeners.set(id, handler ?? signal as HandlerT<T>);
        return id;
    }

    disconnect(id: number) {
        this.listeners.delete(id);
    }
}
