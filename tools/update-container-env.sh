#!/usr/bin/env bash
set -euo pipefail

command -v podman >/dev/null || die "podman is required but not installed"

source config.sh

extra_env=()
forward_args=()

while [[ $# -gt 0 ]]; do
  case $1 in
    --env)
      if [[ -z "${2:-}" || "$2" != *=* ]]; then
        echo "Error: --env requires VARIABLE=value" >&2
        exit 1
      fi
      extra_env+=(--env "$2")
      shift 2
      ;;
    --env-file)
      if [[ ! -f "${2:-}" ]]; then
        echo "Error: env file '$2' not found" >&2
        exit 1
      fi
      while IFS='=' read -r key val; do
        # skip comments and empty lines
        [[ -z "$key" || "$key" =~ ^# ]] && continue
        extra_env+=(--env "$key=$val")
      done < "$2"
      shift 2
      ;;
    *)
      forward_args+=("$1")
      shift
      ;;
  esac
done

podman container update "${extra_env[@]}" "${forward_args[@]}" "$TOOLBOX_NAME" > /dev/null || exit 1
