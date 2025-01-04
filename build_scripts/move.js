import fs from "fs";
import path from "path";
import {Glob} from "glob";


export default function move({ pattern, to, deleteEmptySourceDirs }) {
    return {
        name: 'move',
        setup(build) {
            build.onEnd(async () => {
                const outputDir = build.initialOptions.outdir;

                for await (const file of new Glob(`${outputDir}/${pattern}`, {})) {
                    const targetPath = path.resolve(outputDir, to, path.basename(file));

                    // Ensure the target directory exists
                    const targetDirectory = path.dirname(targetPath);
                    if (!fs.existsSync(targetDirectory)) {
                        fs.mkdirSync(targetDirectory, { recursive: true });
                    }

                    // Move the file
                    if (fs.existsSync(file)) {
                        fs.renameSync(file, targetPath);

                        if (deleteEmptySourceDirs === true) {
                            if (fs.readdirSync(path.dirname(file)).length === 0) {
                                fs.rmdirSync(path.dirname(file));
                            }
                        }
                    } else {
                        console.warn(`${file} does not exist, skipping move.`);
                    }
                }
            });
        },
    };
}