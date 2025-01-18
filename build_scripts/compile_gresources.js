import {execSync} from "child_process";
import path from "path";


/**
 * Compile a .gresource.xml file into a .gresource file.
 *
 * @param inputFile The path to the .gresource.xml file (relative to the builds sources root)
 * @param outputFile The path to the output .gresource file (relative to the builds output directory)
 * @param sourcesRoot The root directory that all paths inside the [inputFile] are relative to. Defaults
 *                    to the directory where [inputFile] is located.
 */
export default function compileGResources({ inputFile, outputFile, sourcesRoot }) {
    return {
        name: 'compile-gresources',
        setup(build) {
            const inputPth = path.resolve(build.initialOptions.sourceRoot || '.', inputFile);
            const sourceDirPth = path.resolve(build.initialOptions.sourceRoot || '.', sourcesRoot ?? path.dirname(inputPth));
            const outputPth = path.resolve(build.initialOptions.outdir || '.', outputFile ?? 'resources.gresource');

            build.onEnd(async () => {
                try {
                    execSync(
                        `glib-compile-resources --target "${outputPth}" --sourcedir "${sourceDirPth}" "${inputPth}"`
                    );
                } catch (e) {
                    throw Error(
                        `Compiling the gresource file ${inputFile} failed with exit code ${e.status}: ` +
                        `${e.stderr?.toString() ?? e.stdout?.toString()}`
                    )
                }
            })
        }
    }
}
