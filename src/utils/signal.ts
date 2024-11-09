
export default class Signal<T> {
    private readonly listeners: Map<number, (args: T) => void> = new Map();

    emit(args: T) {
        for (let l of this.listeners.values()) {
            l(args);
        }
    }

    // Add a dummy signal name to keep this signature compatible with GObjects:
    connect(signal: 'changed' | string, handler: (args: T) => void): number {
        console.assert(signal === 'changed', 'The only supported signal for now is `changed`');
        let id = Date.now() + Math.random();
        this.listeners.set(id, handler);
        return id;
    }

    disconnect(id: number) {
        this.listeners.delete(id);
    }
}
