
# TouchUp

An extension for GNOME Shell that enhances the user experience for devices with a touchscreen – primarily focused (and tested) on tablets.

TouchUp does not strive to reinvent the wheel and instead provides many features well known from mobile OSes, such as a system navigation bar, notification swipe gestures or onscreen keyboard enhancements. Have a look at the roadmap below for the full picture.

The aim is to make Linux on mobile more competitive and accessible by providing an intuitive, elegant, configurable and stable interface that feels native to the touch form factor and stays out of your way. However, please be aware this is not always possible nor easy since GNOME Shell extension development does not come without challenges or limits – should you find a bug please do not hesitate to [open an issue](https://github.com/mityax/gnome-extension-touchup/issues/new) so it can be fixed quickly.


## Installation

<a href="https://extensions.gnome.org/extension/8102/touchup/" target="_blank"><img src="https://raw.githubusercontent.com/andyholmes/gnome-shell-extensions-badge/master/get-it-on-ego.svg?sanitize=true" height="90" alt="Get it on GNOME Extensions" align="middle"></a>

🛠️ or build and install from source: `npm run enable:release`

> **Heads Up:** The GNOME Shell extension review process is severely delayed at the moment – in order to get the latest features (including GNOME Shell v50 support), grab a release from the [releases page](https://github.com/mityax/gnome-extension-touchup/releases) or build from source.

## Roadmap &amp; Implementation Status

This is a rough overview over the implemented features and goals
(in no particular order). Please be aware that I have limited time to work on this project and don't expect new features very frequently – you can help speed up progress by [donating](#support).

 - [x] Navigation bar, as known from Android/iOS
   - [x] Gesture mode
   - [x] Buttons mode
   - [x] Invisible gestures mode
   - [x] Compatibility with:
     - [x] DashToDock (move the dock above the navigation bar, dock swipe up gesture)
     - [x] DashToPanel (move the panel above the navigation bar)
 - [ ] Edge swipe actions (left/right edge: back, top/bottom edge:
       show panel and navigation bar)
 - [x] Touch gestures for GNOME Shell notifications
   - [x] Touchscreen swipe gesture
   - [ ] Touchpad two-finger gestures
 - [ ] Add "copy"/"open" button in notifications for elements like 2FA
       codes or links
 - [x] Onscreen Keyboard (OSK)
   - [x] Key popups
   - [x] "Extended" keys (make padding between keys reactive)
   - [x] Swipe-close keyboard
   - [x] Swipe space bar to switch input methods
   - [x] Show a quick paste action in suggestion bar when having copied 
     something to the clipboard recently
   - [ ] Compatibility with the "GJS OSK" extension (?)
 - [ ] Virtual Touchpad (use device as touchpad when connected to a
   second monitor) \[WIP]
 - [x] Floating temporary screen rotation button when auto-rotation
       is disabled but device is being rotated (as in android)
 - [ ] Pattern unlock
 - [ ] Improved swipe gestures in the overview
   - [x] Swipe up windows in overview to close them
   - [x] Single-finger swipe left/right to switch workspace
   - [x] Hold and move to drag and drop windows
   - [x] Single-finger swipe up/down to open/close overview/app list
   - [ ] Move windows to another screen via dragging to the corner
 - [ ] Gesture-driven top menu pull down animations \[WIP]
 - [ ] Touch-enabled volume controls
 - [ ] Voice input in onscreen keyboard
 - [ ] Option to display individual windows instead of workspaces when navigating
   using gesture navigation bar
 - [ ] Run arbitrary commands on touch-mode change
 - [x] Double-tap top panel, lockscreen or desktop background to sleep
 - [ ] Hide window close buttons in touch mode

Each of these features can be enabled/disabled individually and most can be further customized in the extension settings. Note that TouchUp does not even load the code for disabled features into memory; thus, the extension stays as slim as you'd like it to be.

In case you'd like to suggest a feature or work on one yourself, please don't hesitate to [create an issue](https://github.com/mityax/gnome-extension-touchup/issues/new) so we can discuss it!

## A Note on Compatibility

TouchUp is developed for and actively tested on upstream GNOME Shell. It is not tested on derivations thereof, such as in Ubuntu, and I don't have capacity to include those at the moment (should you be willing to contribute as a long-term beta tester, and to investigate issues on a specific shell derivation yourself, please [open an issue](https://github.com/mityax/gnome-extension-touchup/issues/new) to get in touch).

However, TouchUp will automatically disable features that fail to initialize and show a notification for these. Other features _might_ work on your shell derivation. Consider logging out and back in when a feature failed to initialize – this way you ensure the failed feature leaves no traces in your session.

## Why an Extension?

Developing this functionality in the form of a Shell extension allows a seamless interplay between a touch-centered usage and one based on keyboard and mouse. It facilitates a dual usage of devices such as tablets with removable keyboards or convertibles, without the need to manually switch between login sessions or to
compromise on awkward user interfaces. Elements of the interface that are useful in both, touch and non-touch mode (e.g. notification swipe gestures) will always be active, while elements that are useless or annoying when having a keyboard
and touchpad at hand (e.g. the gesture navigation bar) will only be active in touch mode.

This also means that users can just use their well-known and stable GNOME Shell (with their favorite extensions) and can add the additional touch functionality at the press of a button. There is no need to set up a different shell to have decent touch interaction with the device, which reduces the hurdle and thereby makes linux on touch devices more accessible.

Lastly, as the development of an extension like this one is decoupled from GNOME Shell itself, it can make faster iterations and profit off using more modern tooling such as typescript (though extension review can of course also take its time).

## GenAI Policy

TouchUp does not contain LLM-written code. The project is crafted and designed carefully by hand, and I intend to keep it that way to ensure the goals stated at the beginning of this readme are met.

However, please do know that I'm not setting a fixed rule for the future with this; the policy might be reevaluated and adjusted at some point. Rest assured though that this will never become a vibe-coded project – code running inside the Shell's process is way too critical to be written that carelessly.

## Contributing

Should you wish to contribute, which I'd greatly appreciate, please first have a look at [CONTRIBUTING.md](./CONTRIBUTING.md). This is especially important if you plan to contribute more than just a simple typo- or bugfix.

At this convenience, allow me to spread a word of encouragement: Everything you really need to contribute is the ability to write typescript and the patience to examine the [upstream Shell code](https://gitlab.gnome.org/GNOME/gnome-shell/-/tree/main/js/ui?ref_type=heads)'s inner workings; I'm happy to help with anything else and guide you around.


## Support

Your support fuels this work and helps TouchUp to make GNOME Shell an alternative to corporate touch operating systems. It'll also allow me to allocate more time to this project, thereby making progress faster. Even a dollar a month helps!

To donate, choose a platform below:

<a href='https://ko-fi.com/Q5Q41A9U4G' target='_blank'><img height='36' style='border:0px;height:36px;vertical-align:middle' src='https://img.shields.io/badge/Ko--fi-F16061?style=for-the-badge&logo=ko-fi&logoColor=white' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a><br />
<i>Recommended! Most payment methods, one-time or recurring donations, no sign up required.</i>

<a href='https://buymeacoffee.com/mityax' target='_blank'><img height='36' style='border:0px;height:36px;vertical-align:middle' src='https://img.shields.io/badge/Buy_Me_A_Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black' border='0' alt='Buy Me a Coffee' /></a><br />
<i>Donate by card, no sign up required.</i>


### Funding

As of 2026, a substantial portion of the milestones in the above roadmap is kindly funded through [NGI0 Commons Fund](https://nlnet.nl/commonsfund), a fund established by [NLnet](https://nlnet.nl) with financial support from the European Commission's [Next Generation Internet](https://ngi.eu) program. Learn more at TouchUp's [NLnet project page](https://nlnet.nl/project/TouchUp).

[<img src="https://nlnet.nl/logo/banner-bw.svg" alt="NLnet foundation logo" height="35px" />](https://nlnet.nl)
&nbsp;&nbsp;&nbsp;
[<img src="https://nlnet.nl/image/logos/NGI0_tag_black_mono.svg" alt="NGI Zero Logo" height="35px" />](https://nlnet.nl/commonsfund)

## Some Words of Gratitude

- **GNOME Shell [↗](https://gitlab.gnome.org/GNOME/gnome-shell)** – It goes without saying that this project would not be possible without the excellent work on the Shell and its awesome extension ecosystem.
- **Gjsify [↗](https://github.com/gjsify/ts-for-gir)** – Thanks for providing typescript type definitions that make the work a lot more fun and TouchUp more stable.
- **GNOME Shell Mobile [↗](https://gitlab.gnome.org/verdre/gnome-shell-mobile)** – Thanks to the upstreamed improvements to Clutter's gesture system, TouchUp's gesture handling could be simplified quite a bit.
- **NLNet [↗](https://nlnet.nl) and all supporters [↗](https://ko-fi.com/Q5Q41A9U4G)** – Thanks for moving TouchUp forward and enabling me to dedicate time to this project!

Importantly: Thanks a lot to everyone who contributes in any way to this project!

## License

This project is licensed under GPL-3.0-or-later. In the unlikely event that you have any requirements not permitted by this license, I'm willing to talk as long as the FOSS ethos is retained.
