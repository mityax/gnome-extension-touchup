#!/usr/bin/env bash

# Run the rest of this script inside a new (nested) dbus session:
# shellcheck disable=SC2093
if [ -z "$INSIDE_DBUS_SCRIPT" ]; then
  export INSIDE_DBUS_SCRIPT=1
  export WAYLAND_DISPLAY=touchup-dev-1
  echo "Dropping into new dbus session"
  exec dbus-run-session -- bash "$0" "$@"
fi

set -euo pipefail

die() { echo "$@" >&2; exit 1; }

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
cd "$SCRIPT_DIR" || die "Cannot cd into $SCRIPT_DIR"

[[ -f config.sh ]] || die "Missing config.sh in $SCRIPT_DIR"
source config.sh

# Flags handled by this wrapper
WATCH=0
BUILD=0
HEADLESS=0
VERBOSE=0
forward_args=()

for arg in "$@"; do
  case $arg in
    --build)
      BUILD=1
      ;;
    --watch)
      WATCH=1
      ;;
    --headless)
      HEADLESS=1
      ;;
    --verbose)
      VERBOSE=1
      ;;
    *)
      forward_args+=("$arg")
      ;;
  esac
done

# Build if requested
if (( BUILD )); then
  npm run build || die "Build failed"
fi

# Find newest .zip in $distDir
shopt -s nullglob
zipFiles=($(ls -t "$distDir"/*.zip 2>/dev/null))
[[ ${#zipFiles[@]} -gt 0 ]] || die "Extension zip file not present in $distDir"
zipFile="${zipFiles[0]}"

echo -e "\n\nStarting Gnome Shell..."

shell_args=()
shell_env=(
  TOUCHUP_PROJECT_DIR=$projectDir
  TOUCHUP_BUILD_DIRECTORY=$buildDir
)

if (( WATCH )); then
  shell_env+=(TOUCHUP_WATCH_EVENT_URL="http://localhost:${TOUCHUP_WATCH_PORT:-35729}/watch")
fi

should_run_nested() {
  [[ "$XDG_SESSION_TYPE" != "tty" ]] && (( ! HEADLESS ))
}

has_devkit() {
  gnome-shell --help | grep -q -- --devkit
}

has_nested() {
  gnome-shell --help | grep -q -- --nested
}

if should_run_nested; then
  if has_devkit; then
    shell_args+=( --devkit )
    shell_args+=(--wayland-display "$WAYLAND_DISPLAY")
  elif has_nested; then
    shell_args+=( --nested )
    shell_args+=(--wayland-display "$WAYLAND_DISPLAY")
  else
    die Mutter has to be built with devkit or x11 support
  fi
fi
shell_args+=( --wayland )
# fi

if (( VERBOSE )); then
  echo "gnome-shell ${shell_args[*]} ${forward_args[*]}"
  env "${shell_env[@]}" gnome-shell "${shell_args[@]}" "${forward_args[@]}" &
else
  env "${shell_env[@]}" gnome-shell "${shell_args[@]}" "${forward_args[@]}" 2> >(grep -i -P --color 'touchup|Gjs-CRITICAL' 1>&2) &
fi

SHELL_PID=$!

# Wait until shell is really ready
sleep 1s

# Install and enable new extension version:
echo "Installing extension (from $zipFile)..."
gnome-extensions install -f "$zipFile" && echo "done."
echo "Enabling extension (via id $EXTENSION_ID)..."
gnome-extensions enable "$EXTENSION_ID" && echo "done."

# Monitor extension status until it is running:
echo "Waiting for the extension to be started..."
while state=$(gnome-extensions info "$EXTENSION_ID" | grep -oP 'State: \K\w+'); do
    if [ "$state" == "ERROR" ]; then
        echo "The extension encountered an error during startup."
        notify-send "Extension error" "The extension $EXTENSION_ID encountered an error during startup."
        exit 1
    elif [ "$state" != "UNKNOWN" ]; then
        echo "Extension state: $state"
        break
    fi
    sleep 0.2
done

# Wait until shell is closed:
wait $SHELL_PID

echo "Note: The extension is still installed and will run after the next restart of Gnome Shell. If this is not intended, run: gnome-extensions uninstall $EXTENSION_ID"
