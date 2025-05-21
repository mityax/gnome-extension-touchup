
type HandlerT<T> = (args: T) => void;


export default class Signal<T> {
    private readonly listeners: Map<number, (args: T) => void> = new Map();

    emit(args: T) {
        for (let l of this.listeners.values()) {
            l(args);
        }
    }

    connect(signal: HandlerT<T>): number
    // Add an overload with a dummy signal name to keep this signature compatible with GObjects:
    connect(signal: 'changed' | string, handler: HandlerT<T>): number
    connect(signal: string | HandlerT<T>, handler?: HandlerT<T>): number {
        console.assert(signal === 'changed', 'The only supported signal for now is `changed`');
        let id = Date.now() + Math.random();
        this.listeners.set(id, handler ?? signal as HandlerT<T>);
        return id;
    }

    disconnect(id: number) {
        this.listeners.delete(id);
    }
}
