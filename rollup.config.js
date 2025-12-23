import path from 'path';
import {fileURLToPath} from 'url';
import * as fs from "fs";
import typescript from 'rollup-plugin-typescript2';
import strip from "@rollup/plugin-strip";
import * as dotenv from "dotenv";
import {execSync} from "child_process";

import sassWriter from "./tools/rollup_plugins/rollup_plugin_sass_writer.js";
import gsettingsSchemaPlugin from "./tools/rollup_plugins/rollup_plugin_generate_settings_schema.js";
import validateGSchemas from "./tools/rollup_plugins/rollup_plugin_compile_gschemas.js";
import compileGResources from "./tools/rollup_plugins/rollup_plugin_compile_gresources.js";
import disallowImportsPlugin from "./tools/rollup_plugins/rollup_plugin_disallow_imports.js";
import createZip from "./tools/rollup_plugins/rollup_plugin_create_zip.js";
import reloadSSENotifier from "./tools/rollup_plugins/rollup_plugin_reload_sse_notifier.js";
import writeJsonPlugin from "./tools/rollup_plugins/rollup_plugin_write_json.js";
import yaml from "js-yaml";

dotenv.config();


/**
 * The directory this file is located in.
 */
const rootDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = 'dist/output'


/**
 * Whether to create a debug or release build
 */
const IS_DEBUG_MODE = !['yes', 'y', '1', 'true'].includes(process.env.RELEASE_MODE?.toLowerCase());


/**
 * Whether rollup is running in watch mode
 */
const IS_WATCH_MODE = !!process.env.ROLLUP_WATCH || process.argv.includes('-w') || process.argv.includes('--watch');


/**
 * Whether to preserve modules or bundle all JS
 */
const PRESERVE_MODULES = !IS_WATCH_MODE && !['yes', 'y', '1', 'true'].includes(process.env.DISABLE_CHECK?.toLowerCase());


/**
 * Whether to skip type checking during build, resulting in a much faster build time.
 */
const DISABLE_CHECK = ['yes', 'y', '1', 'true'].includes(process.env.DISABLE_CHECK?.toLowerCase());


/**
 * The extension metadata
 */
const meta = yaml.load(fs.readFileSync(path.join(rootDir, 'metadata.yml')).toString());
const metadataRelease = meta.release;
const metadataDebug = meta.debug;
const metadata = IS_DEBUG_MODE ? metadataDebug : metadataRelease;


// Update metadata with build details:
metadataDebug['version-name'] ??= `${metadataRelease['version-name']}.debug`;
try {
    metadataDebug['commit-sha'] = metadataRelease['commit-sha'] = execSync('git rev-parse --short HEAD').toString().trim();
} catch (err) {
    console.warn(`WARNING: Unable to retrieve Git commit SHA: ${err.message}`);
}


// Clear up/remove previous build:
if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true });
}


export default {
    input: [
        'src/extension.ts',
        'src/prefs.ts',
    ],
    treeshake: {
        moduleSideEffects: false, // 'no-external'
    },
    external: [/gi:\/\/.*/, /resource:\/\/.*/],
    output: {
        dir: outDir,
        preserveModules: PRESERVE_MODULES,
    },
    plugins: [
        typescript({
            tsconfig: 'tsconfig.json',
            check: !DISABLE_CHECK,
        }),

        // Strip out debug-only/release-only code depending on build mode:
        strip({
            labels: [
                IS_DEBUG_MODE ? null   : 'DEBUG',
                IS_DEBUG_MODE ? null   : 'BETA',
                IS_DEBUG_MODE ? 'PROD' : null,
            ].filter(e => !!e),
            functions: [
                IS_DEBUG_MODE ? null : 'logger.debug',
                IS_DEBUG_MODE ? null : 'assert',
            ].filter(e => !!e),
            include: [
                '**/*.js',
                '**/*.ts',
            ],
        }),

        // Compile stylesheets:
        sassWriter({
            input: 'src/sass/stylesheet-dark.sass',
            output: `${outDir}/stylesheet-dark.css`,
        }),
        sassWriter({
            input: 'src/sass/stylesheet-light.sass',
            output: `${outDir}/stylesheet-light.css`,
        }),

        // Generate the GSettings schema from our settings.ts file:
        gsettingsSchemaPlugin({
            inputFile: 'src/settings.ts',
            outputFile: `${outDir}/schemas/org.gnome.shell.extensions.touchup.gschema.xml`,
            schemaId: 'org.gnome.shell.extensions.touchup',
            schemaPath: '/org/gnome/shell/extensions/touchup/',
            validate: true,
        }),
        validateGSchemas({
            schemasDir: 'schemas',
        }),

        // Compile GResources:
        compileGResources({
            inputFile: 'src/assets/assets.gresource.xml',
            outputFile: 'assets.gresource'
        }),

        // Ensure that no disallowed modules are imported in extension.js as per the review guidelines:
        // https://gjs.guide/extensions/review-guidelines/review-guidelines.html#do-not-import-gtk-libraries-in-gnome-shell
        disallowImportsPlugin({
            include: `src/extension.ts`,
            blacklist: ['gi://Gdk', 'gi://Gtk', 'gi://Adw'],
        }),

        // Compile preferences stylesheets:
        sassWriter({
            input: 'src/sass/prefs-dark.sass',
            output: `${outDir}/prefs-dark.css`,
        }),
        sassWriter({
            input: 'src/sass/prefs-light.sass',
            output: `${outDir}/prefs-light.css`,
        }),

        // Ensure that no disallowed modules are imported in prefs.js as per the review guidelines:
        // https://gjs.guide/extensions/review-guidelines/review-guidelines.html#do-not-import-gtk-libraries-in-gnome-shell
        disallowImportsPlugin({
            include: `src/prefs.ts`,
            blacklist: ['gi://Clutter', 'gi://Meta', 'gi://St', 'gi://Shell'],
        }),

        // Add metadata.json:
        writeJsonPlugin({
            fileName: 'metadata.json',
            content: metadata
        }),

        createZip({
            zipFilename: `../${metadata.uuid.replaceAll(/\W/g, '')}.v${metadata['version-name']}.shell-extension.zip`,  // relative to `outDir`
        }),

        IS_WATCH_MODE
            ? reloadSSENotifier({
                  port: process.env.TOUCHUP_WATCH_PORT ? Number.parseInt(process.env.TOUCHUP_WATCH_PORT) : 35729
              })
            : null,
    ].filter(p => p != null),  // filter out `null` to allow conditionals in the list
};
