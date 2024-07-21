#!/bin/bash


projectDir=$(pwd)
zipFile="$(ls ./dist/*.zip)"
extensionId="$(basename "$zipFile" .zip)"

if [[ $* == *--build* ]]; then
  npm run build
fi

gnome-extensions uninstall "$extensionId"

sleep 0.5s

if [[ $* == *--tty* ]]; then
  (export $(cat .env | xargs) && GNOMETOUCH_PROJECT_DIR=$projectDir gnome-shell --wayland) &
else
  (export $(cat .env | xargs) && GNOMETOUCH_PROJECT_DIR=$projectDir gnome-shell --nested --wayland) &
fi

PID=$!

sleep 1s

echo "Installing extension (from $zipFile)..."
gnome-extensions install -f "$zipFile" && echo "done."

echo "Enabling extension (via id $extensionId)..."
gnome-extensions enable "$extensionId" && echo "done."

wait $PID

echo "Uninstalling extension..."
gnome-extensions uninstall "$extensionId"
