import * as esbuild from "esbuild";
import GjsPlugin from "esbuild-gjs";
import copy from "esbuild-plugin-copy";
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import AdmZip from "adm-zip";
import metadata from "./src/metadata.json" assert { type: 'json' };


const __dirname = dirname(fileURLToPath(import.meta.url));


await esbuild.build({
    entryPoints: ["src/extension.ts"],
    target: "firefox68", // Spider Monkey 68
    format: "esm",
    bundle: true,
    outfile: "dist/extension.js",
    plugins: [
        GjsPlugin({}),
        copy({
            assets: {
                from: ['./src/metadata.json'],
                to: ['metadata.json'],
            }
        }),
        copy({
            assets: {
                from: ['./src/stylesheet.css'],
                to: ['stylesheet.css'],
            }
        }),
    ],
    treeShaking: true,
    jsx: 'automatic',
    jsxImportSource: "$src/jsx",
    jsxFactory: "jsx",
}).then(() => {
    const zipFilename = `${metadata.uuid}.zip`;
    const zipDist = resolve(__dirname, `dist/${zipFilename}`);

    const zip = new AdmZip();
    zip.addLocalFolder(resolve(__dirname, "dist"));
    zip.writeZip(zipDist);

    console.log(`Build complete. Zip file: ${zipFilename}\n`);
    console.log(`Install with: gnome-extensions install ${zipFilename}`)
    console.log(`Update with: gnome-extensions install --force ${zipFilename}`)
    console.log(`Enable with: gnome-extensions enable ${metadata.uuid}`)
    console.log('');
    console.log(`Disable with: gnome-extensions disable ${metadata.uuid}`)
    console.log(`Remove with: gnome-extensions uninstall ${metadata.uuid}`)
    console.log('');
    console.log('To check if the extension has been recognized, you can execute the following: gnome-extensions list.')
    console.log(`If ${metadata.uuid} is listed in the output, you should be able to activate the extension.`);
    console.log('Otherwise, you will need to restart the GNOME Shell.');
});
