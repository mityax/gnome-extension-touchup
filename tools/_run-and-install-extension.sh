#!/usr/bin/env bash
set -euo pipefail

# This script is meant to be run from within "run.sh" only; its task is to
#  1. Remove the currently installed extension, if any
#  2. Invoke a script passed via the environment variable "PROCESS_SCRIPT", that is assumed start GNOME Shell
#  3. Install the latest extension zip file from the build folder

die() { log "$@" >&2; exit 1; }
log() { echo -e "\033[1m\033[34m[touchup-wrapper]\033[0m $*"; }

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
cd "$SCRIPT_DIR" || die "Cannot cd into $SCRIPT_DIR"

[[ -f config.sh ]] || die "Missing config.sh in $SCRIPT_DIR"
source config.sh

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

# Run the script in the background
bash -c "$PROCESS_SCRIPT"

