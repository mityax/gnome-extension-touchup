import {execSync} from 'child_process';
import path from 'path';

/**
 * Compile a .gresource.xml file into a .gresource file.
 *
 * @param inputFile The path to the .gresource.xml file (relative to the build's source root)
 * @param outputFile The path to the output .gresource file (relative to the build's output directory)
 * @param sourcesRoot The root directory that all paths inside the inputFile are relative to.
 */
export default function compileGResources({ inputFile, outputFile, sourcesRoot }) {
    return {
        name: 'compile-gresources',
        writeBundle(options) {
            // Fall back to process.cwd() if no source/output directories are explicitly given
            const inputPth = path.resolve(process.cwd(), inputFile);
            const sourceDirPth = path.resolve(
                '.',
                sourcesRoot ?? path.dirname(inputPth)
            );
            const outputPth = path.resolve(
                options.dir || '.',
                outputFile ?? 'resources.gresource'
            );

            try {
                execSync(
                    `glib-compile-resources --target "${outputPth}" --sourcedir "${sourceDirPth}" "${inputPth}"`
                );
            } catch (e) {
                throw new Error(
                    `Compiling the gresource file ${inputFile} failed with exit code ${e.status}: ` +
                    `${e.stderr?.toString() ?? e.stdout?.toString()}`
                );
            }
        },
    };
}
