// SPDX-FileCopyrightText: 2026 mityax, 2026
//
// SPDX-License-Identifier: GPL-3.0-only

import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

/**
 * Rollup plugin to create a zip archive of the output directory or subfolder.
 *
 * @param {Object} options
 * @param {string} options.input - Subfolder inside the output directory to zip.
 * @param {string} options.zipFilename - Name of the resulting zip file.
 */
export default function createZip({ input, zipFilename }) {
    return {
        name: 'create-zip',

        writeBundle(outputOptions) {
            const outputDir = outputOptions.dir || '.';
            const folderToZip = path.resolve(outputDir, input || '.');
            const zipOutputPath = path.resolve(outputDir, zipFilename);

            if (!fs.existsSync(folderToZip)) {
                this.warn(`⚠️  The folder to zip "${input}" does not exist at ${folderToZip}`);
                return;
            }

            const zip = new AdmZip();
            zip.addLocalFolder(folderToZip);
            zip.writeZip(zipOutputPath);

            console.log(`📦 Zip archive created at: ${path.relative(process.cwd(), zipOutputPath)}`);
        }
    };
}
