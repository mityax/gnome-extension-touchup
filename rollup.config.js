import path from 'path';
import {fileURLToPath} from 'url';
import * as fs from "fs";
import typescript from '@rollup/plugin-typescript';
import {nodeResolve} from '@rollup/plugin-node-resolve';
import copy from 'rollup-plugin-copy';
import strip from "@rollup/plugin-strip";

import sassWriter from "./build_plugins/rollup_plugin_sass_writer.js";
import gsettingsSchemaPlugin from "./build_plugins/rollup_plugin_generate_settings_schema.js";
import compileGSchemas from "./build_plugins/rollup_plugin_compile_gschemas.js";
import compileGResources from "./build_plugins/rollup_plugin_compile_gresources.js";
import disallowImportsPlugin from "./build_plugins/rollup_plugin_disallow_imports.js";
import createZip from "./build_plugins/rollup_plugin_create_zip.js";
import reloadSSENotifier from "./build_plugins/rollup_plugin_reload_sse_notifier.js";
import * as dotenv from "dotenv";

dotenv.config();


/**
 * The directory this file is located in.
 */
const rootDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = 'dist/output'


/**
 * Whether to create a debug or release build
 */
const IS_DEBUG_MODE = !['yes', 'y', '1', 'true'].includes(process.env.RELEASE_MODE);


/**
 * Whether rollup is running in watch mode
 */
const IS_WATCH_MODE = !!process.env.ROLLUP_WATCH || process.argv.includes('-w') || process.argv.includes('--watch');


/**
 * Whether to preserve modules or bundle all JS
 */
const PRESERVE_MODULES = !IS_WATCH_MODE && process.env.BUNDLE_JS !== 'true';

/**
 * The extension metadata
 */
const metadataFile = path.join(rootDir, 'src', IS_DEBUG_MODE ? 'metadata-debug.json' : 'metadata.json');
const metadata = JSON.parse(fs.readFileSync(metadataFile).toString());


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
        moduleSideEffects: false, //'no-external'
    },
    external: [/gi:\/\/.*/, /resource:\/\/.*/],
    output: {
        dir: outDir,
        preserveModules: PRESERVE_MODULES,
    },
    plugins: [
        nodeResolve({
            preferBuiltins: false,
        }),
        typescript({
            tsconfig: './tsconfig.json',
        }),
        strip({
            labels: [
                IS_DEBUG_MODE ? null : 'DEBUG',
                IS_DEBUG_MODE ? null : 'BETA',
            ].filter(e => !!e),
            functions: [
                IS_DEBUG_MODE ? null : 'debugLog',
            ].filter(e => !!e),
            include: [
                '**/*.js',
                '**/*.ts',
            ],
        }),

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
        compileGSchemas({
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

        copy({
            targets: [
                {
                    src: metadataFile,
                    dest: outDir,
                    rename: 'metadata.json'
                },
            ],
        }),

        createZip({
            zipFilename: `../${metadata.uuid}.zip`,  // relative to `outDir`
        }),

        IS_WATCH_MODE
            ? reloadSSENotifier({
                  port: process.env.TOUCHUP_WATCH_PORT ? Number.parseInt(process.env.TOUCHUP_WATCH_PORT) : 35729
              })
            : null,
    ].filter(p => p != null),  // filter out `null` to allow conditionals in the list
};
