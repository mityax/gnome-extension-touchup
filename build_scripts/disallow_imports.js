import fs from 'fs';
import path from 'path';

/**
 * Disallow Imports esbuild plugin: ensure specific modules are not imported in the output files.
 *
 * @param {string} outputFileName - The output file name to check (relative to output/build dir root)
 * @param {string[]} blacklist - List of blacklisted module specifiers, e.g., "gi://Gtk"
 * @returns esbuild plugin.
 */
export default function disallowImports({ outputFileName, blacklist }) {
    return {
        name: 'disallow-imports',
        setup(build) {
            build.onEnd((result) => {
                // Determine absolute path to the output file
                const outputFilePath = path.resolve(build.initialOptions.outdir || '.', outputFileName);

                if (!fs.existsSync(outputFilePath)) {
                    throw new Error(`Output file "${outputFileName}" does not exist.`);
                }

                // Read the output file
                const fileContent = fs.readFileSync(outputFilePath, 'utf8');
                const fileLines = fileContent.split('\n');

                let currentSourceFile = null; // Tracks the current source file
                const errors = []; // Stores error information

                // Process each line
                fileLines.forEach((line, index) => {
                    const trimmedLine = line.trim();

                    // Check for file comments indicating the source file
                    if (trimmedLine.startsWith('//')) {
                        const match = trimmedLine.match(/^\/\/\s*((\/?[\w.]+)(\/[\w.]+)+)$/);
                        if (match) {
                            currentSourceFile = match[1];
                        }
                        return;
                    }

                    // Match import statements
                    const importMatch = trimmedLine.match(/^\s*import\b.*from\s+['"`](.*?)['"`]/);
                    const requireMatch = trimmedLine.match(/^.*=\s+require\(['"`](.*?)['"`]\)/);

                    if (importMatch || requireMatch) {
                        const module = importMatch ? importMatch[1] : requireMatch[1];

                        // Check against the blacklist
                        if (blacklist.includes(module)) {
                            errors.push({
                                line: index + 1,
                                module,
                                content: line,
                                sourceFile: currentSourceFile,
                            });
                        }

                        return;
                    }

                    currentSourceFile = null;
                });

                // If errors were found, throw an exception
                if (errors.length > 0) {
                    let res = [];
                    for (let error of errors) {
                        res.push({

                        });
                    }
                    return {
                        errors: errors.map(error => ({
                            id: 'disallowed-import',
                            text: error.sourceFile
                                ? `Disallowed import found: "${error.module}" in file "${error.sourceFile}" (${outputFilePath}:${error.line}):\n  ${error.content}`
                                : `Disallowed import found: "${error.module}" in "${outputFilePath}" on line ${error.line}.`,
                            location: {
                                file: error.sourceFile || outputFilePath,
                                line: error.sourceFile == null ? error.line : undefined,
                                lineText: error.sourceFile == null ? error.content : undefined,
                            }
                        })),
                    };
                }
            });
        }
    };
};
