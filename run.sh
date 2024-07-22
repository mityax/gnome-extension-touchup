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
zipFile="$(ls "$projectDir"/dist/*.zip)"
extensionId="$(basename "$zipFile" .zip)"

if [[ -z "$zipFile" ]]; then
  echo "Extension zip file not present in directory $projectDir"
  exit 1
fi

# Uninstall old version of extension:
gnome-extensions uninstall "$extensionId" || echo "Note: Failed to uninstall old extension."

sleep 0.5s

echo "Starting Gnome Shell..."

if [[ $* == *--tty* ]]; then
  GNOMETOUCH_PROJECT_DIR=$projectDir gnome-shell --wayland &
else
  GNOMETOUCH_PROJECT_DIR=$projectDir gnome-shell --nested --wayland &
fi

PID=$!

sleep 1s

# Install and enable new extension version:
echo "Installing extension (from $zipFile)..."
gnome-extensions install -f "$zipFile" && echo "done."
echo "Enabling extension (via id $extensionId)..."
gnome-extensions enable "$extensionId" && echo "done."

# Wait until shell is closed:
wait $PID

echo "Note: The extension is still installed and will run after the next restart of Gnome Shell. If this is not intended, run: gnome-extensions uninstall $extensionId"
