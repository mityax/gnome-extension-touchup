import * as esbuild from "esbuild";
import GjsPlugin from "esbuild-gjs";
import copy from "esbuild-plugin-copy";
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';
import {sassPlugin} from 'esbuild-sass-plugin'
import * as fs from "fs";
import gsettingsSchemaPlugin from "./build_scripts/generate_settings_schema.js";
import disallowImportsPlugin from "./build_scripts/disallow_imports.js";
import move from "./build_scripts/move.js";
import createZip from "./build_scripts/create_zip.js";
import compileGSchemas from "./build_scripts/compile_gschemas.js";
import compileGResources from "./build_scripts/compile_gresources.js";
import addTopComment from "./build_scripts/add_top_comment.js";


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

// Whether to strip debugging code out of the build or keep it:
const IS_DEBUG_MODE = !process.argv.includes('--release');


const BUILD_OPTIONS = {
    sourceRoot: rootDir,
    outdir: 'dist/output',
    entryPoints: [
        "src/extension.ts",
        "src/prefs.ts",
        "src/sass/stylesheet-light.sass",
        "src/sass/stylesheet-dark.sass",
    ],
    dropLabels: [
        IS_DEBUG_MODE ? null : 'DEBUG',
        IS_DEBUG_MODE ? null : 'BETA',
    ].filter(e=>e),
    pure: IS_DEBUG_MODE ? [] : ['debugLog'],  // FIXME: this is apparently ignored by esbuild (?)
    target: "firefox128", // Spider Monkey 128  (find out current one using `gjs --jsversion`)
    format: "esm",
    bundle: true,
    treeShaking: false,  // tree-shaking appears to wrongly remove the `repr` function from utils/logging.ts in release builds and doesn't add much benefit
    plugins: [
        GjsPlugin({}),

        // Compile sass to css and move it to the root output file:
        sassPlugin({
            filter: /.*\.sass/,
            embedded: true,
        }),
        move({
            pattern: 'sass/*',
            to: '.',
            deleteEmptySourceDirs: true,
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
            schemaPath: '/org/gnome/shell/extensions/gnometouch/',
            validate: true,
        }),
        compileGSchemas({
            schemasDir: 'schemas',
        }),

        // Compile gresources:
        compileGResources({
            inputFile: 'src/assets/assets.gresource.xml',
            outputFile: 'assets.gresource'
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

        // Add reviewer comment to top of extension.js:
        !IS_DEBUG_MODE
            ? addTopComment({
                file: 'extension.js',
                comment:
                    'To reviewers of this code:\n\n' +
                    'I highly recommend starting your code review with the [PatchManager] class since it is used all\n' +
                    'around the extension – briefly, it allows to define a nested tree of [PatchManager] instances that\n' +
                    'each are responsible for applying and cleaning up patches to Gnome Shell code. A patch can be\n' +
                    'anything, for example overwriting a method in some prototype, connecting to a signal or adding an\n' +
                    'actor to the shell. [PatchManager] allows to easily define a patch and the necessary cleanup\n' +
                    'in-place, which allows for a good overview and mitigates the risk of forgetting to clean something\n' +
                    'up/to unapply a patch.\n\n' +
                    'Next, it\'s probably best to start with the main [GnomeTouchExtension] class since this is where\n' +
                    'the root PatchManager is defined – all other [PatchManagers] are children of this [PatchManager]\n' +
                    'and are automatically destroyed/unapplied when the root [PatchManager] is.',
                style: 'block',
                indent: 2,
            }) : null,

        createZip({
            input: '.',  // relative to output dir
            zipFilename: `../${metadata.uuid}.zip`,  // relative to output dir
        }),
    ].filter(e=>e),
};


async function build() {
    console.log(`Building Gnome Touch extension in ${IS_DEBUG_MODE ? 'debug' : 'release'} mode...`);

    await esbuild.build(BUILD_OPTIONS)
        .then(() => console.log(`✅ Build completed.\n`))
        .catch(async error => {
            if (error?.errors?.length > 0) {
                for (let msg of await esbuild.formatMessages(error.errors, { kind: 'error' })) {
                    console.error("");
                    console.error(msg);
                }
            }

            console.error("❌ Build failed.");
        });
}

async function watch() {
    console.log(`Serving Gnome Touch extension in ${IS_DEBUG_MODE ? 'debug' : 'release'} mode...`);

    // Log a success/error message on each rebuild:
    let buildCounter = 0;
    BUILD_OPTIONS.plugins.push({ name: 'rebuild-notifier', setup: (build) => build.onEnd(_ => {
        if (buildCounter++ > 0) console.log(_.errors.length === 0
            ? "✅ Rebuilt extension."
            : "❌ Errors occurred during rebuilding."
        );
    })})

    const ctx = await esbuild.context(BUILD_OPTIONS);
    await ctx.watch();
    const serve = await ctx.serve({
        port: 9876,
        servedir: BUILD_OPTIONS.outdir,
        onRequest: args => console.log(`Request ${args.method} ${args.path}: ${args.status}`),
    });
    console.log(`Serving on http://${serve.host}:${serve.port}`);

    const onKill = async () => {
        console.log("Stopping watch mode.")
        await ctx.dispose();
    };

    process.on('SIGINT', onKill);
    process.on('SIGTERM', onKill);
    process.on('SIGABRT', onKill);
    process.on('SIGTSTP', onKill);
}


if (process.argv.includes("--watch")) {
    watch();  // note: do NOT use `await` here (see https://stackoverflow.com/a/75784438)
} else {
    await build();
}
