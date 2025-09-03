// rollup-plugin-write-json.js
import fs from 'fs';
import path from 'path';

export default function writeJsonPlugin({content, fileName}) {
    return {
        name: 'write-json',

        generateBundle(outputOptions, bundle, isWrite) {
            if (!isWrite) return;

            const outputDir = outputOptions.dir || path.dirname(outputOptions.file);
            const jsonPath = path.resolve(outputDir, fileName);
            const jsonContent = JSON.stringify(content, null, 2);

            this.emitFile({
                type: 'asset',
                fileName,
                source: jsonContent
            });

            // Optional: write manually too, in case output is not handled by Rollup emitFile
            fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
            fs.writeFileSync(jsonPath, jsonContent, 'utf8');
        }
    };
}
