
# Gnome Touch

An extension for Gnome Shell that provides a better user 
experience for devices with a touchscreen.

### Features &amp; Implementation Status
 - [x] Navigation bar, similar to mobile devices
   - [x] Gesture mode
   - [ ] Buttons mode
 - [x] Touch gestures for Gnome Shell notifications
 - [x] Key popups for the onscreen keyboard
 - [ ] Virtual Touchpad (use device as touchpad when connected to a second monitor)


## Development

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
the first TTY (the one where your IDE is) and the second – whenever you make changes in your IDE, just 
save them, switch back to the second TTY, and hit the restart button.

### Running in a nested shell
You can also run the extension in a nested instance of Gnome Shell. While
this might cause issues in specific cases, it can be sufficient when working
on unaffected features. To do so, just run

```bash
npm run dev
```
