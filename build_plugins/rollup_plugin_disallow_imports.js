import { createFilter } from '@rollup/pluginutils';
import path from 'path';
import fs from 'fs';


/**
 * Disallow Imports rollup plugin: ensure specific modules are not imported in the output file, or in any
 * of the files imported by it (recursively).
 *
 * @param {string} filePattern - The output file name to check (relative to output/build dir root)
 * @param {string[]} blacklist - List of blacklisted module specifiers, e.g., "gi://Gtk"
 * @returns rollup plugin.
 */
export default function disallowImports({ blacklist = [], include, exclude }) {
    const filter = createFilter(include, exclude);

    return {
        name: 'disallow-imports',

        async buildEnd() {
            const visited = new Set();

            for (const id of this.getModuleIds()) {
                if (!filter(id)) continue;
                await checkModuleRecursively.call(this, id, blacklist, visited);
            }
        }
    };
}

async function checkModuleRecursively(id, blacklist, visited, importerStack = []) {
    if (visited.has(id)) return;
    visited.add(id);

    const info = this.getModuleInfo(id);
    if (!info) return;

    for (const dep of info.importedIds) {
        const depInfo = this.getModuleInfo(dep);
        if (!depInfo) continue;

        const specifier = getImportSpecifier(id, dep); // optional enhancement
        if (blacklist.some(b => dep.startsWith(b) || specifier?.startsWith(b))) {
            const from = importerStack[importerStack.length - 1] || id;
            const message = from === id
                ? `Disallowed import "${dep}" found in ${path.relative(process.cwd(), from)}`
                : `Disallowed import "${dep}" found in ${path.relative(process.cwd(), id)}, imported by ${path.relative(process.cwd(), from)}`;

            this.error({
                id: from,
                message,
            });
        }

        await checkModuleRecursively.call(this, dep, blacklist, visited, [...importerStack, id]);
    }
}

// Optional helper for resolving bare specifiers more clearly
function getImportSpecifier(from, to) {
    try {
        if (to.startsWith('.') || path.isAbsolute(to)) return undefined;
        const content = fs.readFileSync(from, 'utf-8');
        const match = content.match(new RegExp(`import[^'"]+['"](${to})['"]`));
        return match?.[1];
    } catch {
        return undefined;
    }
}
