import { writeFileSync, mkdirSync } from 'fs';
import { renderSync } from 'sass';
import {dirname} from "path";


/**
 * Rollup plugin to compile a .sass file into a .css file.
 *
 * @param {Object} options
 * @param {string} options.input - Path to the .sass source file.
 * @param {string} options.output - Path to the desired .css output file.
 *
 * This plugin runs during the build start phase and writes the compiled CSS
 * to the specified output location. It ensures the output directory exists.
 * Only supports indented .sass syntax (not .scss).
 */
export default function sassWriter({ input, output }) {
    return {
        name: 'sass-writer',
        buildStart() {
            try {
                const result = renderSync({
                    file: input,
                    indentedSyntax: true, // Because we're using .sass, not .scss
                });

                // Ensure the output directory exists
                const outDir = dirname(output);
                mkdirSync(outDir, { recursive: true });

                // Write the result
                writeFileSync(output, result.css);
                console.log(`[sass-writer] Compiled ${input} → ${output}`);
            } catch (error) {
                console.error(`[sass-writer] Error compiling ${input}:`, error.message);
                this.error(error);
            }
        },
    };
}
