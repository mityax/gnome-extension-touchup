import {exec} from "child_process";
import util from "node:util";
import path from "path";

util.promisify(exec);

export default function compileGSchemas({ schemasDir }) {
    return {
        name: 'compile-gschemas',
        setup(build) {
            const pth = path.resolve(build.initialOptions.outdir || '.', schemasDir);

            build.onEnd(async () => {
                const {stdout, stderr} = await exec(`glib-compile-schemas "${pth}"`);
                const err = stderr.read();
                if (err) {
                    throw Error(`Compiling the schemas failed: ${err}`)
                }
            })
        }
    }
}
