import * as Config from 'resource:///org/gnome/shell/misc/config.js';


/**
 * The GNOME Shell version, as a `[major, minor]` array usable for version-gated code, e.g.
 *
 * ```ts
 * if (SHELL_VERSION > [50]) { ... }
 * if (SHELL_VERSION <= [50, 2]) { ... }
 * ```
 *
 * NOTE: This lives in its own module (instead of `utils.ts`) on purpose: it is the only
 * import of a `resource:///org/gnome/shell/...` file in the project, and that gresource is
 * only available inside the Shell process. The preferences process is a separate process
 * without it, so anything reachable from `prefs.ts` must not import this module (see the
 * `disallowImportsPlugin` blacklist in `rollup.config.js`).
 */
export const SHELL_VERSION = Config.PACKAGE_VERSION.split(".").map(Number);
