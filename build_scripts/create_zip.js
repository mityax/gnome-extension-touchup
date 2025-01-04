import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";


export default function createZip({ input, zipFilename }) {
    return {
        name: 'create-zip',
        setup(build) {
            build.onEnd(async () => {
                const outputDir = build.initialOptions.outdir;
                const zipDist = path.resolve(outputDir, zipFilename);
                const folderPath = path.resolve(outputDir, input);

                // Ensure the folder to zip exists
                if (!fs.existsSync(folderPath)) {
                    console.error(`Error: The folder '${input}' does not exist.`);
                    return;
                }

                // Create the zip file
                const zip = new AdmZip();
                zip.addLocalFolder(folderPath);  // Adds the whole folder to the zip

                // Write the zip file to the output directory
                zip.writeZip(zipDist);
                console.log(`Build successfully zipped into: ${zipDist}`);
            });
        },
    };
}