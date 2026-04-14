
# TouchUp Test Suite

This folder contains TouchUp's automated UI regression tests, which are based on
[miniQA](https://github.com/mityax/miniqa/tree/master).

To run, just do

```bash
./run.sh
```

To open miniQA's webui for adding or updating existing tests, do

```bash
./run.sh editor
```

The `run.sh` script assumes that an extension build is present and just grabs the 
latest zip file from `../dist` to run the tests.

## Architecture

### The base test

The [`base`](tests/base.yml) test starts from VM boot and is responsible for preparing 
the machine for all other tests.

This entails:

 - stepping through the GNOME OS Setup wizard
 - closing any welcome popups that GNOME OS presents to us
 - disabling factors that might interfere with testing (e.g. uncontrollable 
   notifications or the desktop background image)
 - installing the TouchUp extension zip (served as asset via miniQA), and enabling it

The test creates a snapshot also called `base`, that all other tests start from.

### Other tests

All other tests are comparably simple. There is at least one test for each feature,
but there may be more if it helps with reproducibility or if tests would otherwise
become lengthy and difficult to maintain. Please do add tests when contributing to
TouchUp.

Each test case should be run a few to times to check for any instabilities; this 
particularly applies to TouchUp since gesture control is somewhat affected by input
timing, which we cannot entirely control. Thus, instead of requiring a perfect image
match after each interaction, it’s preferable for our tests to verify results by 
matching a combination of known-good stable screen regions that together assert a 
valid response to the input.
