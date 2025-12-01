#!/usr/bin/env bash
set -euo pipefail

die() { echo "$@" >&2; exit 1; }

command -v podman >/dev/null || die "podman is required but not installed"
command -v toolbox >/dev/null || die "toolbox is required but not installed"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
cd "$SCRIPT_DIR" || die "Cannot cd into $SCRIPT_DIR"

[[ -f config.sh ]] || die "Missing config.sh in $SCRIPT_DIR"
source config.sh

if ! podman container exists "$TOOLBOX_NAME"; then
  read -rp "Toolbox \"$TOOLBOX_NAME\" does not exist. Create now? [y/N]: " choice
    if [[ $choice =~ ^[Yy]$ ]]; then
      ./setup-shell-container.sh
    fi
fi

# Flags handled by this wrapper
WATCH=0
BUILD=0
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
    --verbose)
      VERBOSE=1
      forward_args+=("$arg") # still forward it
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

echo -e "\nStarting Gnome Shell..."

env_args=(
  --env "TOUCHUP_PROJECT_DIR=$projectDir"
  --env "TOUCHUP_BUILD_DIRECTORY=$buildDir"
  --env-file "$projectDir/.env"
)

[[ -f "$projectDir/.env.local" ]] && env_args+=(--env-file "$projectDir/.env.local")

if (( WATCH )); then
  env_args+=(--env "TOUCHUP_WATCH_EVENT_URL=http://localhost:${TOUCHUP_WATCH_PORT:-35729}/watch")
fi

./update-container-env.sh "${env_args[@]}" || die "Failed to update container environment before launch."

heredoc_content=$(cat <<EOF
  gnome-shell "\${SHELL_ARGS[@]}" &  # SHELL_ARGS is constructed in _patched-run-gnome-shell.sh

  # Wait until shell is really ready
  sleep 1s

  # Install and enable new extension version:
  echo "Installing extension (from $zipFile)..."
  gnome-extensions install -f "$zipFile" || die "Failed to install extension"
  echo "Enabling extension (via id $EXTENSION_ID)..."
  gnome-extensions enable "$EXTENSION_ID" || die "Failed to enable extension"

  # Monitor extension status until it is running:
  echo "Waiting for the extension to be started..."
  while state=$(gnome-extensions info "$EXTENSION_ID" | grep -oP 'State: \K\w+'); do
      if [ "\$state" == "ERROR" ]; then
          echo "The extension encountered an error during startup."
          notify-send "Extension error" "The extension $EXTENSION_ID encountered an error during startup."
          exit 1
      elif [ "\$state" != "UNKNOWN" ]; then
          echo "Extension state: \$state"
          break
      fi
      sleep 0.2
  done

  # Wait until shell is closed:
  wait
EOF
)

if (( VERBOSE )); then
  ./_patched-run-gnome-shell.sh --toolbox "$TOOLBOX_NAME" "${forward_args[@]}" <<<"$heredoc_content"
else
  ./_patched-run-gnome-shell.sh --toolbox "$TOOLBOX_NAME" "${forward_args[@]}" \
    2> >(grep -i -P --color 'touchup|-CRITICAL|-WARNING|JS ERROR' >&2) <<<"$heredoc_content"
fi

