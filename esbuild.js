import * as esbuild from "esbuild";
import {exec} from "child_process";
import GjsPlugin from "esbuild-gjs";
import copy from "esbuild-plugin-copy";
import {dirname, join, resolve} from 'path';
import {fileURLToPath} from 'url';
import AdmZip from "adm-zip";
import {sassPlugin} from 'esbuild-sass-plugin'
import * as fs from "fs";
import mv from "mv";
import gsettingsSchemaPlugin from "./build_scripts/generate_settings_schema.js";
import disallowImportsPlugin from "./build_scripts/disallow_imports.js";


/**
 * The directory this file is located in.
 */
const rootDir = dirname(fileURLToPath(import.meta.url));

/**
 * The extension metadata
 */
const metadata = JSON.parse(fs.readFileSync(join(rootDir, "src/metadata.json")).toString());

// Clear up/remove previous build:
if (fs.existsSync('dist')) fs.rmSync('dist', { recursive: true });


await esbuild.build({
    sourceRoot: rootDir,
    outdir: 'dist',
    entryPoints: [
        "src/extension.ts",
        "src/prefs.ts",
        "src/sass/stylesheet-light.sass",
        "src/sass/stylesheet-dark.sass",
    ],
    target: "firefox128", // Spider Monkey 128  (find out current one using `gjs --jsversion`)
    format: "esm",
    bundle: true,
    treeShaking: true,
    plugins: [
        GjsPlugin({}),

        sassPlugin({
            filter: /.*\.sass/
        }),

        // Copy metadata.json file:
        copy({
            assets: {
                from: ['src/metadata.json'],
                to: ['metadata.json'],
            }
        }),

        // Generate the GSettings schema from our settings.ts file:
        gsettingsSchemaPlugin({
            inputFile: 'src/settings.ts',
            outputFile: 'schemas/org.gnome.shell.extensions.gnometouch.gschema.xml',
            schemaId: 'org.gnome.shell.extensions.gnometouch',
            schemaPath: '/org/gnome/shell/extensions/gnometouch/'
        }),

        // Ensure that no disallowed modules are imported in either extension.js or prefs.js as per the review
        // guidelines: https://gjs.guide/extensions/review-guidelines/review-guidelines.html#do-not-import-gtk-libraries-in-gnome-shell
        disallowImportsPlugin({
            outputFileName: 'extension.js',
            blacklist: ['gi://Gdk', 'gi://Gtk', 'gi://Adw'],
        }),
        disallowImportsPlugin({
            outputFileName: 'prefs.js',
            blacklist: ['gi://Clutter', 'gi://Meta', 'gi://St', 'gi://Shell'],
        }),
    ],
}).then(async () => {
    const sassDist = resolve(rootDir, `dist/sass`);
    for (let fn of fs.readdirSync(sassDist)) {
        await mv(join(sassDist, fn), resolve(rootDir, `dist/${fn}`), {mkdirp: false}, console.error);
    }
    fs.rmSync(sassDist, {recursive: true});
}).then(async () => {
    exec(`glib-compile-schemas ${resolve(rootDir, 'dist/schemas/')}`, (error, stdout, stderr) => {
        if (stderr) {
            throw Error(`Compiling the schemas failed: ${stderr}`)
        }
    });
}).then(async () => {
    const zipFilename = `${metadata.uuid}.zip`;
    const zipDist = resolve(rootDir, `dist/${zipFilename}`);

    const zip = new AdmZip();
    await zip.addLocalFolderPromise(resolve(rootDir, "dist"), {});
    await zip.writeZipPromise(zipDist, {overwrite: true});

    console.log(`✅ Build completed successfully. Zip file: dist/${zipFilename}\n`);
}).catch(async error => {
    if (error?.errors?.length > 0) {
        for (let msg of await esbuild.formatMessages(error.errors, { kind: 'error' })) {
            console.error("");
            console.error(msg);
        }
    }

    console.error("❌ Build failed.");
})
