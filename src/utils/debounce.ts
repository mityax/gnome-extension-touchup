import {CancellablePromise, Delay} from "./delay";

export function debounce<T extends (...args: any[]) => void>(func: T, delay_ms: number): (...args: Parameters<T>) => void {
    let d: CancellablePromise<boolean> | null = null;

    return (...args: Parameters<T>): void => {
        d?.cancel();
        d = Delay.ms(delay_ms);
        d.then(_ => func(...args));
    };
}
