
# Gnome Touch

An extension for Gnome Shell that enhances the user experience for devices with a
touchscreen – primarily focused (and tested) on tablets.

### Roadmap &amp; Implementation Status

This is a rough overview over this extension's implemented features and goals
(in no particular order). It's a lot, and it's ever-changing, mostly due to 
new ideas or unforeseen complications – so please don't take this as a fixed 
plan but more as an idea of the direction Gnome Touch is heading.

 - [x] Navigation bar, as known from Android/iOS
   - [x] Gesture mode
   - [x] Buttons mode
 - [ ] Edge swipe actions (left/right edge: back, top/bottom edge:
       show panel and navigation bar)
 - [x] Touch gestures for Gnome Shell notifications
   - [x] Touchscreen swipe gesture
   - [ ] Touchpad two-finger gestures
 - [ ] Add "copy"/"open" button in notifications for elements like 2FA
       codes or links
 - [x] Key popups for the onscreen keyboard
- [ ] Virtual Touchpad (use device as touchpad when connected to a
  second monitor) \[WIP]
 - [x] Floating temporary screen rotation button when auto-rotation
       is disabled but device is being rotated (as in android)
 - [ ] Pattern unlock
 - [ ] Improved swipe gestures in the overview
   - [ ] Swipe up windows in overview to close them
   - [ ] Single-finger swipe left/right to switch workspace
   - [ ] Hold and move to drag and drop windows
   - [ ] Single-finger swipe up/down outside a window to app list/close overview
 - [ ] Touch-enabled volume controls
 - [ ] Voice input in onscreen keyboard
- [ ] Option to display individual windows instead of workspaces when navigating
  using gesture navigation bar

In case you'd like to suggest a feature or work on one yourself, please
don't hesitate
to [create an issue](https://github.com/mityax/gnome-touch/issues/new) so we can
discuss it!

### Why an extension?

Developing this functionality in the form of a Gnome extension allows a seamless
interplay between a touch-centered usage and one based on keyboard and mouse. It
facilitates a dual usage of devices such as tablets with removable keyboards or
convertibles, without the need to manually switch between login sessions or to
compromise on awkward user interfaces. Elements of the interface that are useful
in both, touch and non-touch mode (e.g. notification swipe gestures) will always
be active, while elements that are useless or annoying when having a keyboard
and touchpad at hand (e.g. the gesture navigation bar) will only be active in
touch mode.

This also means that users can just use their well-known and stable Gnome
Shell (with their favorite extensions) and can add the additional touch
functionality at the press of a button; There is no need to set up and get used
to a different, possibly unpolished or permanently-in-beta shell, just to have
decent touch interaction with the device.

Lastly, as the development of an extension like this one is decoupled from Gnome
Shell itself, it can make faster iterations and profit off using more modern
tooling such as Typescript (though extension review can of course also take its
time).


## Contributing

Should you want to contribute, which I'd greatly appreciate, please first
have a look at [CONTRIBUTING.md](./CONTRIBUTING.md). This is especially
important if you plan to contribute more than just a simple typo- or bugfix.

