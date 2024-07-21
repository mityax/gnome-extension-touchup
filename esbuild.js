import * as esbuild from "esbuild";
import GjsPlugin from "esbuild-gjs";
import copy from "esbuild-plugin-copy";
import { dirname, resolve, join } from 'path';
import { fileURLToPath } from 'url';
import AdmZip from "adm-zip";
import metadata from "./src/metadata.json" assert { type: 'json' };
import {sassPlugin} from 'esbuild-sass-plugin'
import * as fs from "fs";
import mv from "mv";


const __dirname = dirname(fileURLToPath(import.meta.url));


await esbuild.build({
    entryPoints: ["src/extension.ts", "src/sass/stylesheet-light.sass", "src/sass/stylesheet-dark.sass"],
    target: "firefox115", // Spider Monkey 115  (find out current one using `gjs --jsversion`)
    format: "esm",
    bundle: true,
    plugins: [
        GjsPlugin({}),
        copy({
            assets: {
                from: ['./src/metadata.json'],
                to: ['metadata.json'],
            }
        }),
        sassPlugin({
            filter: /.*\.sass/,
        }),
    ],
    outdir: 'dist',
    treeShaking: true,
}).then(async () => {
    const sassDist = resolve(__dirname, `dist/sass`);
    for (let fn of fs.readdirSync(sassDist)) {
        await mv(join(sassDist, fn), resolve(__dirname, `dist/${fn}`), {mkdirp: false}, console.error);
    }
    fs.rmSync(sassDist, {recursive: true});
}).then(() => {
    const zipFilename = `${metadata.uuid}.zip`;
    const zipDist = resolve(__dirname, `dist/${zipFilename}`);

    const zip = new AdmZip();
    zip.addLocalFolder(resolve(__dirname, "dist"));
    zip.writeZip(zipDist);

    console.log(`Build complete. Zip file: dist/${zipFilename}\n`);
    console.log(`Install with: gnome-extensions install dist/${zipFilename}`)
    console.log(`Update with: gnome-extensions install --force dist/${zipFilename}`)
    console.log(`Enable with: gnome-extensions enable ${metadata.uuid}`)
    console.log('');
    console.log(`Disable with: gnome-extensions disable ${metadata.uuid}`)
    console.log(`Remove with: gnome-extensions uninstall ${metadata.uuid}`)
    console.log('');
    console.log('To check if the extension has been recognized, you can execute the following: gnome-extensions list.')
    console.log(`If ${metadata.uuid} is listed in the output, you should be able to activate the extension.`);
    console.log('Otherwise, you will need to restart the GNOME Shell.');
});
