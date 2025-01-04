
# Contributing

I'm always open to and very thankful for contributions by anyone!

Before you start working on big changes or new features though, please
make sure to read this document. Also, if you intend to do more then
tiny bug fixes, **please open an issue upfront** telling me about your 
plans, so I can make sure your work is not for nothing and potentially
help you out, should it be needed.

## Development Workflow

### Running natively (recommended)

The extension can best be [run natively](https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/docs/building-and-running.md#native) as
there are some difficulties with touch events in nested shells. To make
this smooth, open a TTY (using `Ctrl + Alt + F3` for example) and run
this command:

```bash
npm run dev-tty
```

- To **rebuild and restart**, just click the reload icon in the top bar
- To **exit** the shell, press `Alt + F2` and type `debugexit`.
- To **view logs** live in your IDE, use `npm run logs`

Therefore, a typical development workflow would be to switch between
the first TTY (the one where your IDE is) and the second – whenever you 
make changes in your IDE, just save them, switch back to the second TTY, 
and hit the restart button.

### Running in a nested shell
You can also run the extension in a nested instance of Gnome Shell. While
this might cause issues in specific cases, it can be sufficient when working
on unaffected features. To do so, just run

```bash
npm run dev
```

### Live-Reloading

There is an experimental implementation for automatic live-reloading
during development. This means, that whenever a source code file or
a stylesheet is changed on disk, the extension is automatically
rebuilt and reloaded in the running gnome shell instance.

To use live-relaoding, do:

```bash
npm run watch  # - or in a tty: `npm run watch-tty`
```

**Note:** While live-reloading can significantly improve the development
experience, please be aware that it is a very unstable practice due to
the nature of gnome extensions. When there is a problem during
extension unloading/disabling, for example, effects of the previous extension
instance may still be present in the gnome shell instance. In this case,
a full shell restart (using the restart icon in the top bar, for example)
will put the shell in a clean state before loading the extension.


## Coding

### Utilities

There are some utilities that I encourage you to use where applicable.
Here, I can only provide brief information, but there is more extensive
documentation in the source code for each utility.

 - **Logging** – use `log("Hello")` or `debugLog("Hello!")` to print any 
    messages. These functions accept multiple arguments and try to best
    serialize complex types for readability.
 - **Delay** – schedule simple one-off callbacks after a delay. Callbacks
    can be cancelled and will be automatically cancelled at extension 
    disabling. Example:
    ```js
    await Delay.ms(500).then(() => debugLog("Delay is over!"));
    ```
 - **Intervals** – the `IntervalRunner` class provides a very friendly
    and easy interface to have functions ran repeatedly, at a dynamic
    interval and to stop or pause when needed. Also check out `IdleRunner`
    which does the same but calls the function as often as possible when
    the shell is idle.
 - **ExtensionFeature** – subclass this class when developing a new,
    independent feature for the extension. It provides some utilities 
    for patching parts of gnome shell and to simplify cleanup upon extension
    disabling. Take a look at the existing features to see how it is used.
 - **Widgets** – the `Widgets` namespace provides subclasses for most 
    `St.Widget`s, that offer a way easier, briefer and more elegant way
    to create complex user interfaces:
    ```js
    const myWidget = Widgets.Column({
      children: [
        Widgets.Label("Hello World"),
        Widgets.Bin({height: 10}),   // some spacing
        Widgets.Button({
          label: "Clicke me please!",
          style: css({
            color: 'red',
            borderRadius: '10px',
          }),
          onClick: () => debugLog("I've been clicked!")
        }),
        Widgets.Icon({
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
 - **Debug-only code** – if you, for whatever reason, want or need to
   write code that is not included in release builds of the extension,
   prefix it with the `DEBUG` label, like this:
   ```js
   // This is included in release builds:
   log("Hello World!");
   
   // And this is stripped out of releases:
   DEBUG: for (let i=0; i<10; i++) {
     someDebugOnlyAction(i);
   }
   ```
 - **Others** – there are many more utils in `src/utils` (especially 
   in `utils.ts`), which may be helpful for you.

