#!/bin/bash

# Load the .env file(s)
set -a
source .env
if [[ -f .env.local ]]; then
  source .env.local
fi
set +a


# Build if flag is set:
if [[ $* == *--build* ]]; then
  npm run build || exit 1
fi


projectDir="$(dirname "$(readlink -f "$0")")"
zipFile="$(ls -t "$projectDir"/dist/*.zip 2>/dev/null | head -n 1)"  # select the newest .zip file in the build dir
extensionId="touchup@mityax"


if [[ -z "$zipFile" ]]; then
  echo "Extension zip file not present in directory $projectDir"
  exit 1
fi

printf "\n\n"
echo "Build succeeded. Starting Gnome Shell..."

export TOUCHUP_PROJECT_DIR=$projectDir
export TOUCHUP_BUILD_DIRECTORY="$projectDir/dist/output"

if [[ $* == *--watch* ]]; then
  export TOUCHUP_WATCH_EVENT_URL="http://localhost:${TOUCHUP_WATCH_PORT:-35729}/watch"
fi

if [[ $* == *--tty* ]]; then
  if [[ $* == *--verbose* ]]; then
    gnome-shell --wayland &
  else
    gnome-shell --wayland 2> >(grep -i -P --color 'touchup|Gjs-CRITICAL' 1>&2) &
  fi
else
  if [[ $* == *--verbose* ]]; then
    gnome-shell --nested --wayland &
  else
    gnome-shell --nested --wayland 2> >(grep -i -P --color 'touchup|Gjs-CRITICAL' 1>&2) &
  fi
fi

SHELL_PID=$!

# Wait until shell is really ready
sleep 1s

# Install and enable new extension version:
echo "Installing extension (from $zipFile)..."
gnome-extensions install -f "$zipFile" && echo "done."
echo "Enabling extension (via id $extensionId)..."
gnome-extensions enable "$extensionId" && echo "done."

# Monitor extension status until it is running:
echo "Waiting for the extension to be started..."
while state=$(gnome-extensions info "$extensionId" | grep -oP 'State: \K\w+'); do
    if [ "$state" == "ERROR" ]; then
        echo "The extension encountered an error during startup."
        notify-send "Extension error" "The extension $extensionId encountered an error during startup."
        exit 1
    elif [ "$state" != "UNKNOWN" ]; then
        echo "Extension state: $state"
        break
    fi
    sleep 0.2
done

# Wait until shell is closed:
wait $SHELL_PID

echo "Note: The extension is still installed and will run after the next restart of Gnome Shell. If this is not intended, run: gnome-extensions uninstall $extensionId"
