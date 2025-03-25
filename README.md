
# Gnome Touch

An extension for Gnome Shell that enhances the user experience for devices with a
touchscreen – primarily focused (and tested) on tablets.

Gnome Touch aims to provide an intuitive, configurable, clean and 
seamless interface. However, please be aware that this is not always 
possible nor easy since Gnome extension development does not come without 
challenges or limits and has a steep learning curve.

### Roadmap &amp; Implementation Status

This is a rough overview over this extension's implemented features and goals
(in no particular order). It's a lot, and it's changing, mostly due to 
new ideas or unforeseen complications – so please don't take this as a fixed 
plan but more as an idea of the direction Gnome Touch is heading. Also, I have
limited time to work on this project, so please don't expect new features 
very frequently – you can help speed up progress by [donating](#support).

 - [x] Navigation bar, as known from Android/iOS
   - [x] Gesture mode
   - [x] Buttons mode
   - [ ] Invisible gestures mode
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

## Support

Your support fuels this work and helps Gnome Touch to make Gnome an 
alternative to corporate touch operating systems. It'll also allow me to 
allocate more time to this project, thereby making progress faster. Even a 
dollar a month helps!

To donate, choose a platform below:

<a href='https://ko-fi.com/Q5Q41A9U4G' target='_blank'><img height='36' style='border:0px;height:36px;vertical-align:middle' src='https://img.shields.io/badge/Ko--fi-F16061?style=for-the-badge&logo=ko-fi&logoColor=white' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a><br />
<i>Recommended! Most payment methods, one-time or recurring donations, no sign up required.</i>

<a href='https://patreon.com/mityax' target='_blank'><img height='36' style='border:0px;height:36px;vertical-align:middle' src='https://img.shields.io/badge/Patreon-F96854?style=for-the-badge&logo=patreon&logoColor=white' border='0' alt='Buy Me a Coffee at patreon.com' /></a><br />
<i>Many payment methods, best for a recurring donation.</i>

<a href='https://buymeacoffee.com/mityax' target='_blank'><img height='36' style='border:0px;height:36px;vertical-align:middle' src='https://img.shields.io/badge/Buy_Me_A_Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black' border='0' alt='Buy Me a Coffee' /></a><br />
<i>Donate by card, no sign up required.</i>
