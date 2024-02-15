#!/bin/bash

gnome-extensions uninstall "$extensionId"

gnome-shell --nested --wayland &

PID=$!

sleep 1s

zipFile="$(ls ./dist/*.zip)"
extensionId="$(basename "$zipFile" .zip)"

echo "Installing extension (from $zipFile)..."
gnome-extensions install -f "$zipFile" && echo "done."

echo "Enabling extension (via id $extensionId)..."
gnome-extensions enable "$extensionId" && echo "done."

wait $PID

echo "Uninstalling extension..."
gnome-extensions uninstall "$extensionId"
