#!/usr/bin/env bash
set -euo pipefail

die() { log "$@" >&2; exit 1; }

#######################################
# Configuration
#######################################

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
cd "$SCRIPT_DIR"

source config.sh

RESTART_FILE="${XDG_RUNTIME_DIR:-/tmp}/touchup_wrapper_restart.$$"

# Default process command (can be overridden by heredoc via stdin)
DEFAULT_PROCESS_CMD=(gnome-shell)

#######################################
# State variables
#######################################

WATCH=false
BUILD=false
VERBOSE=false
USE_TOOLBOX=false
HEADLESS=false

ENV_VARS=()
ARGS=()

DEV_SERVER_PID=""
DEV_SERVER_PGID=""

#######################################
# Parse flags
#######################################

while [[ $# -gt 0 ]]; do
  case "$1" in
    --watch)
      WATCH=true
      shift
      ;;
    --build)
      BUILD=true
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --toolbox)
      USE_TOOLBOX=true
      shift
      ;;
    --toolbox-name)
      TOOLBOX_NAME="$2"
      shift 2
      ;;
    --greeter)
      ENV_VARS+=("GDM_GREETER_TEST=1")
      ARGS+=(--mode=gdm)
      shift
      ;;
    --headless)
      HEADLESS=true
      shift
      ;;
    --)
      shift
      ARGS+=("$@")
      break
      ;;
    *)
      ARGS+=("$1")
      shift
      ;;
  esac
done

#######################################
# Helpers
#######################################

log() {
  echo -e "\033[1m\033[34m[touchup-wrapper]\033[0m $*"
}

filter_output() {
  if $VERBOSE; then
    cat
  else
    grep -iP --color '(?=touchup-wrapper)|\[touchup\]|touchup|Gjs-CRITICAL|Gjs-WARNING|JS ERROR'
  fi
}

should_run_nested() {
  [[ "$XDG_SESSION_TYPE" != "tty" ]] && ! $HEADLESS
}

has_devkit() {
  if $USE_TOOLBOX; then
    toolbox --container "${TOOLBOX_NAME}" run gnome-shell --help | grep -q -- --devkit
  else
    gnome-shell --help | grep -q -- --devkit
  fi
}

load_env_file() {
  log "Loading env file $1"
  while IFS='=' read -r key value; do
    # skip empty lines and comments
    [[ -z "$key" || "$key" == \#* ]] && continue
    ENV_VARS+=("$key=\"$value\"")
  done < "$1"
}

# shellcheck disable=SC2317
cleanup() {
  if [[ -n "${DEV_SERVER_PGID:-}" ]]; then
    if kill -0 "-$DEV_SERVER_PGID" 2>/dev/null; then
      log "Stopping dev server (PGID=${DEV_SERVER_PGID})"

      # Try polite termination first (SIGTERM)
      kill -TERM "-$DEV_SERVER_PGID" 2>/dev/null || true
      sleep 2

      # Force kill if still running
      if kill -0 "-$DEV_SERVER_PGID" 2>/dev/null; then
        log "Dev server did not stop, sending SIGKILL"
        kill -KILL "-$DEV_SERVER_PGID" 2>/dev/null || true
      fi
    fi
  fi

  # If we're in a toolbox, the process is detached and we apparently need to stop the
  # container to properly exit it:
  if $USE_TOOLBOX; then
    podman stop "$TOOLBOX_NAME"
  fi
}
trap cleanup EXIT

#######################################
# Prepare ENV and ARGS
#######################################

ENV_VARS+=(
  "TOUCHUP_PROJECT_DIR=\"$projectDir\""
  "TOUCHUP_BUILD_DIRECTORY=\"$buildDir\""
  "TOUCHUP_RESTART_MARKER_FILE=\"${RESTART_FILE}\""
)

ENV_VARS+=(
  G_MESSAGES_DEBUG="GNOME Shell"
  SHELL_DEBUG=backtrace-warnings
)

# Pass through "DISABLE_CHECK" env variable for consistent type-checking in initial build and rebuilds:
[[ -n "${DISABLE_CHECK}" ]] && ENV_VARS+=("DISABLE_CHECK=${DISABLE_CHECK}")

if should_run_nested; then
  if has_devkit; then
    ARGS+=( --devkit )
  else
    die Mutter has to be built with devkit support
  fi
else
  ARGS+=( --wayland )
fi

# Load .env file:
[[ -f "../.env" ]] && load_env_file ../.env
[[ -f "../.env.local" ]] && load_env_file ../.env.local

#######################################
# Optional build step
#######################################

if $BUILD; then
  log "Building..."
  npm run build || die "Build failed"
fi

#######################################
# Start dev server if needed
#######################################

if $WATCH; then
  log "Starting dev server..."
  # Replace with your real dev server command
  npm run watch-backend &

  DEV_SERVER_PID=$!

  # Put it in its own process group
  DEV_SERVER_PGID=$(ps -o pgid= $DEV_SERVER_PID | tr -d ' ')

  ENV_VARS+=("TOUCHUP_WATCH_EVENT_URL=\"http://localhost:${TOUCHUP_WATCH_PORT:-35729}/watch\"")
fi

#######################################
# Detect heredoc override
#######################################

PROCESS_SCRIPT=""

if ! [ -t 0 ]; then
  # Heredoc provided -> use it
  PROCESS_SCRIPT="$(cat)"
else
  # No heredoc -> generate script that runs default command
  printf -v joined_args ' %q' "${ARGS[@]}"
  printf -v joined_cmd  ' %q' "${DEFAULT_PROCESS_CMD[@]}"

  PROCESS_SCRIPT="${DEFAULT_PROCESS_CMD[*]}${joined_args}"
fi

#######################################
# Execution functions
#######################################

run_process_host() {
  env "${ENV_VARS[@]}" bash -s <<EOF 2>&1 | filter_output || true
export PROCESS_SCRIPT="${PROCESS_SCRIPT}"
dbus-run-session ./_run-and-install-extension.sh
EOF
  return "${PIPESTATUS[0]}"
}

run_process_toolbox() {
  command -v podman >/dev/null || die "podman is required but not installed"
  command -v toolbox >/dev/null || die "toolbox is required but not installed"

  if ! podman container exists "$TOOLBOX_NAME"; then
    read -rp "Toolbox \"$TOOLBOX_NAME\" does not exist. Create now? [y/N]: " choice
      if [[ $choice =~ ^[Yy]$ ]]; then
        ./setup-shell-container.sh
      else
        die "Canceled."
      fi
  fi

  local EXPORTS=""
  for kv in "${ENV_VARS[@]}"; do
    EXPORTS+="export ${kv}; "
  done

  toolbox run --container "${TOOLBOX_NAME}" bash -s <<EOF 2>&1 | filter_output || true
${EXPORTS}
export PROCESS_SCRIPT="${PROCESS_SCRIPT}"
dbus-run-session ./_run-and-install-extension.sh
EOF
  return "${PIPESTATUS[0]}"
}


#######################################
# Main loop
#######################################

while true; do
  if $USE_TOOLBOX; then
    log "Starting GNOME Shell (using ${TOOLBOX_NAME} toolbox)"
    run_process_toolbox
  else
    log "Starting GNOME Shell (on host)"
    run_process_host
  fi

  EXIT_CODE=$?

  # If the marker file has been created, restart the shell:
  if [[ -f "$RESTART_FILE" ]]; then
    log "Shell exited with code ${EXIT_CODE} and requested restart"
    echo
    echo
    log "***************************************************************"

    rm "$RESTART_FILE"
    continue
  fi

  # Otherwise, break the loop
  break
done

log "Shell exited with code ${EXIT_CODE}"
exit "${EXIT_CODE}"

