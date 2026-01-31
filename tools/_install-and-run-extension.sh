#!/usr/bin/env bash
set -euo pipefail

#
# This script is meant to be run from within "run.sh" only. Its task is to
#  1. Remove the currently installed extension, if any
#  2. Install the latest extension zip file from the build folder
#  3. Invoke a script passed via the environment variable "RUN_SHELL_SCRIPT",
#     that is assumed start GNOME Shell
#
# Notably, this script is the entrypoint for the dbus session that is spawned
# for the Shell; Thus, any code that needs to work within the same DBus session
# must be put in here.
#

# Configuration:
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
cd "$SCRIPT_DIR"

source config.sh

# Helpers:
die() { log "$@" >&2; exit 1; }
log() { echo -e "\033[1m\033[34m[touchup-wrapper]\033[0m $*"; }

# Find newest .zip in $distDir
shopt -s nullglob
zipFiles=($(ls -t "$distDir"/*.zip 2>/dev/null))
[[ ${#zipFiles[@]} -gt 0 ]] || die "Extension zip file not present in $distDir"
zipFile="${zipFiles[0]}"

# Remove any potential installed version:
if [ -d "$finalExtensionInstallationDirectory" ]; then
  log "Removing existing extension installation..."
  rm -r "$finalExtensionInstallationDirectory" || die "Removing the existing extension version failed"
fi

# Install and enable the new extension version:
log "Installing extension (from $zipFile)..."
gnome-extensions install -f "$zipFile" || die "Failed to install extension"
log "Enabling extension (via id $EXTENSION_ID)..."
gnome-extensions enable "$EXTENSION_ID" || die "Failed to enable extension"

# Run the script that will start GNOME Shell:
bash -c "$RUN_SHELL_SCRIPT"

