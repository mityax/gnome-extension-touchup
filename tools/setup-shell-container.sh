#!/usr/bin/env bash
set -euo pipefail

die() { echo "$@" >&2; exit 1; }

command -v podman >/dev/null || die "podman is required but not installed"
command -v toolbox >/dev/null || die "toolbox is required but not installed"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"

[[ -f "$SCRIPT_DIR/config.sh" ]] || die "Missing config.sh in $SCRIPT_DIR"
source "$SCRIPT_DIR/config.sh"

# Clone or update repo
if [[ ! -d "$shellRepoRoot" ]]; then
  echo "Cloning upstream gnome-shell…"
  git clone https://gitlab.gnome.org/GNOME/gnome-shell.git "$shellRepoRoot" || die "Cloning failed"
else
  echo "Updating upstream gnome-shell…"
  git -C "$shellRepoRoot" pull --ff-only || echo "Warning: non-fast-forward, keeping local changes"
fi

cd "$shellRepoToolsDir" || die "Cannot cd into $shellRepoToolsDir"

# Toolbox handling
if ! podman container exists "$TOOLBOX_NAME"; then
  echo "Creating toolbox: $TOOLBOX_NAME"
  ./create-toolbox.sh --name "$TOOLBOX_NAME" || echo "Warning: create-toolbox.sh exited with non-zero exit code: $?"
else
  read -rp "Toolbox '$TOOLBOX_NAME' exists. Replace it [y] or only rebuild gnome-shell [N]? [y/N]: " choice
  if [[ $choice =~ ^[Yy]$ ]]; then
    ./create-toolbox.sh --name "$TOOLBOX_NAME" --replace || echo "Warning: create-toolbox.sh exited with non-zero exit code: $?"
  fi
fi

echo "Successfully created toolbox \"$TOOLBOX_NAME\""

echo "Building gnome-shell…"
./meson-build.sh --toolbox "$TOOLBOX_NAME"

echo "✅ Done setting up toolbox: $TOOLBOX_NAME"
