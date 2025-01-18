import {execSync} from "child_process";
import path from "path";


export default function compileGSchemas({ schemasDir }) {
    return {
        name: 'compile-gschemas',
        setup(build) {
            const pth = path.resolve(build.initialOptions.outdir || '.', schemasDir);

            build.onEnd(async () => {
                try {
                    execSync(`glib-compile-schemas "${pth}"`);
                } catch (e) {
                    throw Error(
                        `Compiling gschemas in ${schemasDir} failed with exit code ${e.status}: ` +
                        `${e.stderr?.toString() ?? e.stdout?.toString()}`
                    )
                }
            })
        }
    }
}
