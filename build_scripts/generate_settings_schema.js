import * as ts from 'typescript';
import fs from 'fs';
import path from 'path';

/**
 * A (primitive) esbuild plugin that automatically generates a gsettings schema from a
 * settings typescript file, of the structure specific to this project.
 *
 * The purposes of this plugin are:
 *  - having a single source of truth for the settings schema,
 *  - avoiding the extra work of keeping the schema in sync with the.ts side, and therefore
 *  - having a lower hurdle to implement new settings.
 *
 * This plugin uses the typescript compiler API to parse the given settings file - thus there
 * is no extra dependency to incorporate an additional typescript parser, and we achieve more
 * flexibility and correctness than even more primitive approaches such as regular expressions.
 */
export default function gsettingsSchemaPlugin({ inputFile, outputFile, schemaId, schemaPath }) {
    return {
        name: 'gsettings-schema-plugin',
        setup(build) {
            // Step 1: Hook into the build start
            build.onStart(() => {
                // Step 2: Parse the TypeScript file
                const source = fs.readFileSync(inputFile, 'utf-8');
                const sourceFile = ts.createSourceFile(inputFile, source, ts.ScriptTarget.ESNext, true);

                // XML schema structure
                const schemaEntries = [];

                // Step 3: Traverse AST to extract settings
                function visit(node) {
                    if (ts.isPropertyAssignment(node)) {
                        // Check for the initializer to determine the setting type
                        if (ts.isNewExpression(node.initializer)) {
                            const xml = generateXMLForSetting(node, sourceFile, source, schemaEntries);
                            if (xml) {
                                schemaEntries.push(xml);
                            }
                        }
                    }
                    ts.forEachChild(node, visit);
                }

                ts.forEachChild(sourceFile, visit);

                // Step 4: Build XML schema structure
                const xmlSchema = dedent(`
                  <?xml version="1.0" encoding="UTF-8"?>
                  <schemalist>
                    <schema id="${schemaId}" path="${schemaPath}">
                      {{ SCHEMA_ENTRIES }}
                    </schema>
                  </schemalist>
                `).replace('{{ SCHEMA_ENTRIES }}', schemaEntries.join('\n'));

                // Step 5: Write XML schema to output file
                fs.mkdirSync(path.dirname(outputFile), { recursive: true });
                fs.writeFileSync(outputFile, xmlSchema, 'utf-8');
                console.debug(`GSettings schema written to ${outputFile}`);
            });
        },
    };
}


// Convert a single setting to its XML schema counterpart:
function generateXMLForSetting(node, sourceFile, source) {
    const settingType = node.initializer.expression.getText(sourceFile);
    const settingName = node.initializer.arguments[0]?.getText(sourceFile)
        .replace(/['"]/g, "");

    let gtype, defaultValue = '', additionalXml = '', summary = '';

    // Extract documentation comments (summary)
    const comments = ts.getLeadingCommentRanges(source, node.pos) || [];
    for (const comment of comments) {
        const commentText = source.slice(comment.pos, comment.end)
            .replace(/^\/\*\*|\*\/$/g, '')  // remove "//**" and "*/"
            .replace(/\s*\n\s*\*\s*/g, ' ')  // remove leading asterisk in each line
            .trim();
        summary += commentText;
    }

    // Determine GSetting type based on setting initializer type
    if (settingType === 'BoolSetting') {
        gtype = 'b';
        defaultValue = node.initializer.arguments[1]?.getText(sourceFile) || 'false';
    } else if (settingType === 'IntSetting') {
        gtype = 'i';
        defaultValue = node.initializer.arguments[1]?.getText(sourceFile) || '0';
    } else if (settingType === 'EnumSetting') {
        gtype = 's';
        defaultValue = node.initializer.arguments[1]?.getText(sourceFile).replace(/^'|'$/g, '"') || '';
    } else if (settingType === 'DoubleSetting') {
        gtype = 'd';
        defaultValue = node.initializer.arguments[1]?.getText(sourceFile) || '0.0';
        if (node.initializer.arguments.length >= 4) {
            const min = node.initializer.arguments[2]?.getText(sourceFile) || '0';
            const max = node.initializer.arguments[3]?.getText(sourceFile) || '1';
            additionalXml = `<range min="${min}" max="${max}"/>`;
        }
    }

    return `
      <key name="${settingName}" type="${gtype}">
        <summary>${summary}</summary>
        <default>${defaultValue}</default>
        ${additionalXml}
      </key>
    `;
}



// utils
function dedent(text) {
    const re_whitespace = /^([ \t]*)(.*)\n/gm;
    let l, m, i;

    while ((m = re_whitespace.exec(text)) !== null) {
        if (!m[2]) continue;

        if (l = m[1].length) {
            i = (i !== undefined) ? Math.min(i, l) : l;
        } else break;
    }

    if (i)
        text = text.replace(new RegExp('^[ \t]{' + i + '}(.*\n)', 'gm'), '$1');

    return text;
}
