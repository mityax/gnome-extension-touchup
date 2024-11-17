import * as esbuild from "esbuild";
import GjsPlugin from "esbuild-gjs";
import copy from "esbuild-plugin-copy";
import {dirname, join, resolve} from 'path';
import {fileURLToPath} from 'url';
import AdmZip from "adm-zip";
import metadata from "./src/metadata.json" with {type: "json"};
import {sassPlugin} from 'esbuild-sass-plugin'
import * as fs from "fs";
import mv from "mv";
import gsettingsSchemaPlugin from "./build_scripts/generate_settings_schema.js";
import disallowImports from "./build_scripts/disallow_imports.js";


const __dirname = dirname(fileURLToPath(import.meta.url));


await esbuild.build({
    entryPoints: ["src/extension.ts", "src/prefs.ts", "src/sass/stylesheet-light.sass", "src/sass/stylesheet-dark.sass"],
    target: "firefox115", // Spider Monkey 115  (find out current one using `gjs --jsversion`)
    format: "esm",
    bundle: true,
    plugins: [
        GjsPlugin({}),
        copy({
            assets: {
                from: ['src/metadata.json'],
                to: ['metadata.json'],
            }
        }),
        sassPlugin({
            filter: /.*\.sass/,
        }),
        gsettingsSchemaPlugin({
            inputFile: 'src/features/preferences/settings.ts',
            outputFile: 'dist/schemas/org.gnome.shell.extensions.gnometouch.gschema.xml',
            schemaId: 'org.gnome.shell.extensions.gnometouch',
            schemaPath: '/org/gnome/shell/extensions/gnometouch/'
        }),

        // Ensure that no disallowed modules are imported in either extension.js or prefs.js
        // as per the review guidelines: https://gjs.guide/extensions/review-guidelines/review-guidelines.html#do-not-import-gtk-libraries-in-gnome-shell
        disallowImports({
            outputFileName: 'extension.js',
            blacklist: ['gi://Gdk', 'gi://Gtk', 'gi://Adw'],
        }),
        disallowImports({
            outputFileName: 'prefs.js',
            blacklist: ['gi://Clutter', 'gi://Meta', 'gi://St', 'gi://Shell'],
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
}).then(async () => {
    const zipFilename = `${metadata.uuid}.zip`;
    const zipDist = resolve(__dirname, `dist/${zipFilename}`);

    const zip = new AdmZip();
    await zip.addLocalFolderPromise(resolve(__dirname, "dist"), {});
    await zip.writeZipPromise(zipDist, {overwrite: true});

    console.log(`✅ Build completed successfully. Zip file: dist/${zipFilename}\n`);
});
