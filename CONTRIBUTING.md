
# Contributing

I'm always open to and very thankful for contributions by anyone!

Before you start working on big changes or new features though, please
make sure to read this document. Also, if you intend to do more than
tiny bug fixes, **please open an issue upfront** telling me about your 
plans, so I can make sure your work is not for nothing and potentially
help you out, should it be needed.

## Development Workflow

### Running on the host vs. in a container
Running the extension can be done using the host system's gnome-shell 
installation or inside a toolbox/podman container – more details are
available [here](https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/docs/building-and-running.md).
TouchUp contains some developer tools to make this trivial; in the following
those are introduced. By default, the shell is run inside a container – 
commands ending with ":host" are the run-on-host counterpart.

The major difference between host and container (apart from isolation) is that
inside the container, the latest upstream shell code is pulled and compiled 
whereas the host (most likely) runs an older/stable version of the shell.
Therefore, please test bigger developments using the container to ensure they 
are compatible with the current upstream shell. For smaller fixes or debugging 
however, running on the host might be enough for you – then, there's no need
to wait for the container being set up, which can take quite some time.

### Running natively (recommended)

The extension can best be [run natively](https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/docs/building-and-running.md#native) 
as there are some difficulties with touch events in nested shells. To make
this smooth, open a TTY (using `Ctrl + Alt + F3` for example) and run
this command:

```bash
npm run dev  # or `npm run dev:host`
```

- To **rebuild and restart**, just click the reload icon in the top bar
- To **exit** the shell, press `Alt + F2` and type `debugexit`.
- To **view logs** live in your IDE, use `npm run logs`

Therefore, a typical development workflow would be to switch between
the first TTY (the one where your IDE is) and the second – whenever you 
make changes in your IDE, just save them, switch back to the second TTY, 
and hit the restart button.

**Note:** Though running natively yields the overall best experience, there
is at the moment no way to see uncaught exceptions. Should you entertain 
suspicion that an error might occurr in a certain scenario, try running
a nested shell – uncaught errors are then logged to its stdout.

### Running in a nested shell
You can also run the extension in a nested instance of Gnome Shell. While
this might cause issues in specific cases, it can be sufficient when working
on unaffected features. To do so, just run the same command from within a 
normal terminal instead of a TTY:

```bash
npm run dev  # - or: npm run dev:host
```

**Tip:** To see more logs in case anything unexpected happens, run the 
command like this:

```bash
npm run dev -- --verbose  # - or: npm run dev:host -- --verbose
```

### Live-Reloading

There is an experimental implementation for automatic live-reloading
during development. This means, that whenever a source code file or
a stylesheet is changed on disk, the extension is automatically
rebuilt and reloaded in the running gnome shell instance.

To use live-relaoding, do:

```bash
npm run watch  # - or: `npm run watch:host`
```

**Note:** While live-reloading can significantly improve the development
experience, please be aware that it is a very unstable practice due to
the nature of gnome extensions. When there is a problem during
extension unloading/disabling, for example, effects of the previous extension
instance may still be present in the gnome shell instance. In this case,
a full shell restart (using the restart icon in the top bar, for example)
will put the shell in a clean state before loading the extension.


## Coding

### Basic Architecture

#### Extension Features
The extension is divided into distinct features, that can be enabled and 
disabled separately, based on a setting. Each feature can have multiple
sub-features. A very basic `ExtensionFeature` can be implemented like this:

```typescript
// features/rotateStage/rotateStage.ts

import * as Main from "resource:///org/gnome/shell/ui/main.js";

import ExtensionFeature from "$src/utils/extensionFeature";
import {PatchManager} from "./patchManager";

/** Rotates the stage by 45° */
class RotateStageFeature extends ExtensionFeature {
    constructor(pm: PatchManager) {
        super(pm);

        this.pm.setProperty(Main.layoutManager.uiGroup, 'rotationAngleZ', 45);
    }
}
```

Each feature receives a dedicated [`PatchManager`](src/core/patchManager.ts)
instance upon initialization; use this whenever possible to automatically 
clean up changes to the Shell when the feature is disabled. Just have a look 
at the `PatchManager` source code and its various usages across the 
extension to see what it can help you do, and how to use it cleanly.
In rare cases where using the `PatchManager` makes code more complicated, it is 
also possible to override `ExtensionFeature.destroy()` to free resources.

All features are declared in the main `TouchUpExtension` class, like so:

```typescript
// extension.ts

class TouchUpExtension extends Extension {
    // ...
    
    private async defineFeatures() {
        this.defineFeature(
            // Feature name:
            'rotate-stage',
            
            // Feature initializer:
            async pm => {
                const m = (await import('$src/features/rotateStage/rotateStage.ts'));
                return new m.RotateStageFeature(pm);
            },
            
            // Optionally, synchronise with a setting:
            settings.rotateStage.enabled,
        );
        
        // ...
    }
}
```

Features are imported dynamically, and only when enabled. This allows the 
extension to stay as slim as the users wants, and to be compatible with more 
environments.

A feature can access other features to facilitate interoperability. To do so, 
use this pattern:

```typescript
const rotateStage = TouchUpExtension.instance.getFeature(RotateStageFeature);
```

#### Settings

There is a single source-of-truth for the extension settings schema, located in
[`settings.ts`](src/settings.ts). Upon extension building, a GSettings schema
is automatically derived from this file.

To add new settings, just add them to the appropriate place in the file. Be 
aware that each extension feature has its own subsection. You can access a 
setting from anywhere in the codebase like so:

```typescript
import {settings} from "$src/settings";

// Read the current value:
const enabled = settings.navigationBar.enabled.get();

// Listen to changes:
settings.navigationBar.enabled.connect((val) => logger.info(`Changed: ${val}`))
```

Should you need a setting type that is not yet available, you can easily create
a new one [here](src/features/preferences/backend.ts); be sure to update the
GSettings schema generator 
[here](tools/rollup_plugins/rollup_plugin_generate_settings_schema.js) too.

The settings user interface ("preferences") is located in 
[`src/features/preferences/prefs.ts`](src/features/preferences).

#### Styles

Style sheets are written in SASS, and located in [`src/sass`](src/sass):

 - [`stylesheet-dark.sass`](src/sass/stylesheet-dark.sass) – the default
   extension style sheet that is loaded into the Shell when the extension is
   enabled.
 - [`stylesheet-light.sass`](src/sass/stylesheet-light.sass) – this is 
   merged into the default extension stylesheet when the Shell is in light 
   theme; this stylesheet should specify nothing but color overrides.
 - [`prefs-light.sass`](src/sass/prefs-light.sass) – the default preferences 
   dialog stylesheet.
 - [`prefs-dark.sass`](src/sass/prefs-dark.sass) – merged into the default 
   preferences stylesheet when the preferences window is in dark mode. 
   Should not specify anything but color overrides.


### Utilities

There are some utilities that I encourage you to use where applicable.
Here, I can only provide brief information, but there is more extensive
documentation in the source code for each utility.

 - **Logging** – use `logger.info("Hello")` or `logger.debug("Hello!")` to 
    print any messages. These functions accept multiple arguments and try to
    best serialize complex types for readability.
 - **ExtensionFeature** – subclass this class when developing a new,
    independent feature for the extension. It provides a `PatchManager`
    instance that you can access using `this.pm` out of the box.
 - **PatchManager** - provides some utilities for patching parts of 
   gnome shell with automatic cleanup upon extension or feature disabling.
   Take a look at the existing features to see how it is used and what 
   helpers it provides. This should generally be used for any code snippet
   that needs cleanup, except for the rare case where it makes code stucture
   less clean. Particularly useful:
   - `PatchManager.patch` (arbitrary callback with 
       cleanup), 
   - `PatchManager.connectTo` (connect and auto-disconnect to
       a signal), 
   - `PatchManager.patchMethod` and `PatchManager.appendToMethod` 
       (overwrite/append code to methods of any class), 
   - `PatchManager.autoDestroy` (destroy actors on cleanup)
   - `PatchManager.fork` (creates a child PM that you can pass around 
     in your code)
 - **Widgets** – the `Widgets` namespace provides subclasses for most 
    `St.Widget`s, that offer a way easier, briefer and more elegant way
    to create complex user interfaces:
    ```js
    const myWidget = new Widgets.Column({
      children: [
        new Widgets.Label("Hello World"),
        new Widgets.Bin({height: 10}),   // some spacing
        new Widgets.Button({
          label: "Clicke me please!",
          style: css({
            color: 'red',
            borderRadius: '10px',
          }),
          onClick: () => logger.debug("I've been clicked!")
        }),
        new Widgets.Icon({
          iconName: 'emblem-ok-symbolic',
          onCreated: (icon) => icon.ease({ scale: 1.5 })
        }),
      ],
    });
    ```
   Yes, I know it looks like Flutter. These classes are extensively 
   typed, thus you can just use your IDEs autocompletion to see which 
   properties and events are available for each widget. If a widget
   you'd like to use is missing, it is dead simple to add it – have a 
   look at the existing widgets to see how.
 - **Delay** – schedule simple one-off callbacks after a delay. Callbacks
   can be cancelled and will be automatically cancelled at extension
   disabling. Example:
    ```js
    await Delay.ms(500).then(() => logger.debug("Delay is over!"));
    ```
 - **Intervals** – the `IntervalRunner` class provides a very friendly
   and easy interface to have functions ran repeatedly, at a dynamic
   interval and to stop or pause when needed. Also check out `IdleRunner`
   which does the same but calls the function as often as possible when
   the shell is idle.
 - **Debug-only code** – if you, for whatever reason, want or need to
   write code that is not included in release builds of the extension,
   prefix it with the `DEBUG` label, like this:
   ```js
   // This is included in release builds:
   logger.info("I always run!");
   
   // And this is stripped out of releases:
   DEBUG: for (let i=0; i<10; i++) {
     logger.info("I only run in debug builds :/");
   }
   ```
 - **Beta-only code** – there's also a `BETA` label, which works similarly 
   to the `DEBUG` label but is intended for code that should ultimately be 
   included in release builds but is not yet ready for it; use this to mask 
   work-in-progress features until they are ready to be released.
 - **Release-only code** – should you need code that is only included in
   production releases, prefix it with the `PROD` label; only use this
   sparingly and for bulletproof, short code snippets.
 - **Others** – there are many more utils in `src/utils` (especially 
   in `utils.ts`), which may be helpful for you.

