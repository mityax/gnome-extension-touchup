import {execSync} from 'child_process';
import path from 'path';

export default function compileGSchemas({ schemasDir }) {
    return {
        name: 'compile-gschemas',
        writeBundle(options) {
            const pth = path.resolve(options.dir || '.', schemasDir);

            try {
                execSync(`glib-compile-schemas "${pth}"`);
            } catch (e) {
                throw new Error(
                    `Compiling gschemas in ${schemasDir} failed with exit code ${e.status}: ` +
                    `${e.stderr?.toString() ?? e.stdout?.toString()}`
                );
            }
        }
    };
}
