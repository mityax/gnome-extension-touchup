import fs from "fs";
import path from "path";

/**
 * An esbuild plugin to add a comment to the top of a specified output file.
 *
 * @param {string} comment - The comment to add.
 * @param {string} file - The file path to add the comment to. Relative to the builds outdir.
 * @param commentStyle - The comment style to use, one of 'line', 'block' and 'doc'
 * @param indent - Specify how much the comments content is indented. Defaults to 4 for block comments
 *                 and to 0 for doc and line comments.
 */
export default function addTopComment({comment, file, style: commentStyle = 'block', indent = null}) {
    if (!comment) throw new Error("The 'comment' option is required.");
    if (!file) throw new Error("The 'file' option is required.");
    if (commentStyle && !['block', 'line', 'doc'].includes(commentStyle)) {
        throw new Error(`Invalid value for option 'style': '${commentStyle}'. Choose one of 'line', 'block' and 'doc'.`);
    }
    if (indent && typeof indent !== 'number') throw Error("Option 'indent' must be numeric");
    if ((indent === null || indent === undefined) && commentStyle === 'blcok') indent = 4;

    let formattedComment = comment.replaceAll(/^|\r?\n/g, `$&${' '.repeat(indent)}`)

    formattedComment = commentStyle === 'block'
        ? `/*\n${formattedComment}\n*/`
        : commentStyle === 'doc'
        ? `/**\n${formattedComment.replaceAll(/^|\r?\n/g, '$& * ')}\n*/`
        : formattedComment.replaceAll(/^|\r?\n/g, '$&// ')

    return {
        name: 'add-top-comment',
        setup(build) {
            build.onEnd(async (result) => {
                const outputFilePath = path.resolve(build.initialOptions.outdir || '.', file);

                if (fs.existsSync(outputFilePath)) {
                    const originalContent = fs.readFileSync(outputFilePath, 'utf8');
                    const newContent = `${formattedComment}\n\n${originalContent}`;

                    await fs.writeFileSync(outputFilePath, newContent, 'utf8');
                } else {
                    throw Error(`File '${outputFilePath}' not found.`);
                }
            });
        },
    };
}
