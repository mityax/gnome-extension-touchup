import fs from 'fs';
import path, {join} from 'path';


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
        setup: function (build) {
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
                        if (blacklist.some(specifier => module.startsWith(specifier))) {
                            let sourceInfo = null;
                            if (currentSourceFile !== null) {
                                sourceInfo = searchRegexInFile(
                                    join(build.initialOptions.sourceRoot || '.', currentSourceFile),
                                    new RegExp(`^\\s*import\\b.*from\\s+['"\`]${module}['"\`]`),
                                );
                            }

                            errors.push({
                                line: index + 1,
                                module,
                                content: line,
                                source: {
                                    file: currentSourceFile,
                                    line: sourceInfo?.lineNumber || null,
                                    lineContent: sourceInfo?.lineContent || null,
                                }
                            });
                        }

                        return;
                    }

                    currentSourceFile = null;
                });

                // If errors were found, throw an exception
                if (errors.length > 0) {
                    return {
                        errors: errors.map(error => formatError(error, outputFileName, outputFilePath)),
                    };
                }
            });
        }
    };
};


function formatError(error, outputFileName, outputFilePath) {
    let notes = [];
    if (error.source.file) {
        notes.push({
            text: `This import is not allowed here since it will be transpiled into the output file ${outputFileName}, in which imports of ${error.module} are forbidden.`,
            location: {
                file: outputFilePath,
                line: error.line,
                lineText: error.content,
            }
        });
    }

    return {
        id: 'disallowed-import',
        text: error.source.file
            ? `Disallowed import found: "${error.module}" in ${error.source.file}`
            : `Disallowed import found: "${error.module}" at ${outputFilePath}:${error.line}:\n  ${error.content}`,
        location: {
            file: error.source.file || outputFilePath,
            line: error.source.file ? error.source.line : error.line,
            lineText: error.source.file ? error.source.lineContent : error.content,
        },
        notes,
    };
}


/**
 * Search for a regex in a file and return the line number and content of the first match.
 * @param {string} filePath - Path to the file.
 * @param {RegExp} regex - Regular expression to search for.
 * @returns {{lineNumber: number, lineContent: string} | null} - Result object or null if no match found.
 */
function searchRegexInFile(filePath, regex) {
    const fileContent = fs.readFileSync(filePath, 'utf-8');  // Read the file content synchronously
    const lines = fileContent.split('\n');  // Split content into lines

    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
        const line = lines[lineNumber];
        if (regex.test(line)) {
            return { lineNumber: lineNumber + 1, lineContent: line };  // Line numbers are 1-based
        }
    }

    return null;  // No match found
}


