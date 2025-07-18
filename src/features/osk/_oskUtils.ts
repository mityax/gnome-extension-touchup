//@ts-ignore
import * as Keyboard from 'resource:///org/gnome/shell/ui/keyboard.js';

import {findActorBy} from "../../utils/utils";


/**
 * Extracts the prototype of [Keyboard.Key] from the given [Keyboard.Keyboard] instance
 * since it is not exported.
 */
export function extractKeyPrototype(keyboard: Keyboard.Keyboard) {
    if (_keyProtoCache != null) return _keyProtoCache;

    let r = findActorBy(
        keyboard._aspectContainer,
        a => a.constructor.name === 'Key' && !!Object.getPrototypeOf(a),
    );

    _keyProtoCache = r !== null
        ? Object.getPrototypeOf(r)
        : null;

    return _keyProtoCache;
}
let _keyProtoCache: any = null;