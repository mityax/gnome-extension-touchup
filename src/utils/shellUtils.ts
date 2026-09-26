import Clutter from "gi://Clutter";
import * as Config from 'resource:///org/gnome/shell/misc/config.js';


/**
 * The GNOME Shell version, as a `[major, minor]` array usable for version-gated code, e.g.
 *
 * ```ts
 * if (SHELL_VERSION > [50]) { ... }
 * if (SHELL_VERSION <= [50, 2]) { ... }
 * ```
 */
export const SHELL_VERSION = Config.PACKAGE_VERSION.split(".").map(Number);


/**
 * Recursively walks the topActor's nested children until a child is found that satisfies `test`.
 * If no such child is found, returns `null`
 */
export function findActorBy<T extends Clutter.Actor>(topActor: T, test: (actor: T) => boolean): T | null {
    for (let child of topActor.get_children()) {
        if (test(child as T)) {
            return child as T;
        } else if (child.get_n_children()) {
            let result = findActorBy(child as T, test);
            if (result) {
                return result;
            }
        }
    }

    return null;
}

/**
 * Recursively walks the topActor's nested children, collecting all actors that satisfy `test`.
 *
 * Does not descend further into the children of matching actors.
 */
export function findAllActorsBy(topActor: Clutter.Actor, test: (actor: Clutter.Actor) => boolean): Clutter.Actor[] {
    const res: Clutter.Actor[] = [];

    for (let child of topActor.get_children()) {
        if (test(child)) {
            res.push(child);
        } else if (child.get_n_children()) {
            res.push(...findAllActorsBy(child, test));
        }
    }

    return res;
}

/**
 * Recursively walks the topActor's nested children until a child with the given `name` is found.
 * If no such child is found, returns `null`
 */
export function findActorByName(topActor: Clutter.Actor, name: string): Clutter.Actor | null {
    return findActorBy(topActor, a => a.name === name);
}