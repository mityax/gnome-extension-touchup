import * as ts from 'typescript';
import fs from 'fs';
import path from 'path';

/**
 * A (primitive) rollup plugin that automatically generates a gsettings schema from a
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
        buildStart() {
            const source = fs.readFileSync(inputFile, 'utf-8');
            const sourceFile = ts.createSourceFile(inputFile, source, ts.ScriptTarget.ESNext, true);

            const schemaEntries = [];

            function visit(node) {
                if (ts.isPropertyAssignment(node)) {
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

            const xmlSchema = dedent(`
              <?xml version="1.0" encoding="UTF-8"?>
              <schemalist>
                <schema id="${schemaId}" path="${schemaPath}">
                  {{ SCHEMA_ENTRIES }}
                </schema>
              </schemalist>
            `).replace('{{ SCHEMA_ENTRIES }}', schemaEntries.join('\n'));

            const resolvedOutputFile = path.resolve(outputFile);
            fs.mkdirSync(path.dirname(resolvedOutputFile), { recursive: true });
            fs.writeFileSync(resolvedOutputFile, xmlSchema, 'utf-8');
        },
    };
}


// Convert a single setting to its XML schema counterpart:
function generateXMLForSetting(node, sourceFile, source) {
    const settingType = node.initializer.expression.getText(sourceFile);
    const settingName = node.initializer.arguments[0]?.getText(sourceFile)
        .replace(/['"]/g, "");

    if (!/[a-z0-9]+(-[a-z0-9]+)*/.test(settingName)) {
        throw new Error(`Invalid setting name: "${settingName}": Should be lower-camel-case a string of nonzero length.`)
    }

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
    } else if (settingType === 'StringSetting') {
        gtype = 's';
        defaultValue = node.initializer.arguments[1]?.getText(sourceFile) || '""';
    } else if (settingType === "StringListSetting") {
        gtype = 's';
        // We use JSON.stringify to easily escape quotes in the code and automatically add surrounding quotes, i.e.
        // to convert ["a-value"] to "[\"a-value\"]":
        defaultValue = JSON.stringify(node.initializer.arguments[1]?.getText(sourceFile) || '[]');
        try {
            JSON.parse(JSON.parse(defaultValue));  // throw an error if the default value is not valid json
        } catch (e) {
            throw Error(`The default value of StringListSetting "${settingName}" is not valid JSON: ${defaultValue}`, {cause: e})
        }
    } else if (settingType === 'JSONSetting') {
        gtype = 's';
        // We use JSON.stringify to easily escape quotes in the code and automatically add surrounding quotes, i.e.
        // to convert ["a-value"] to "[\"a-value\"]":
        defaultValue = JSON.stringify(node.initializer.arguments[1]?.getText(sourceFile) || 'null');
        try {
            JSON.parse(JSON.parse(defaultValue));  // throw an error if the default value is not valid json
        } catch (e) {
            throw Error(`The default value of JSONSetting "${settingName}" is not valid JSON: ${defaultValue}`, {cause: e})
        }
    } else {
        throw Error(`Unknown settings type ${settingType} - you need to implement this type in the settings schema generator.`);
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
