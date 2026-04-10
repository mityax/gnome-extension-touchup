#!/usr/bin/env bash

# Run miniqa depending on which installation mode is available; tries podman, then docker, then pre-existing local
# install and lastly installs via pip.
# This script will also download the latest GNOME OS nightly disk image, if its not yet present.
# This is only a convenience script; you can easily launch miniQA as described in the Readme yourself.

# To run tests:
# $ ./run.sh
#
# To open the webui:
# $ ./run.sh editor

set -eou pipefail

IMG_DOWNLOAD_URL="https://os.gnome.org/download/latest/gnome_os_nightly.iso"
IMG_PTH="img/gnome_os_disk_nightly.img"

MINIQA_EXTRAS="ocr"


if [ "$#" -gt 0 ]; then
    COMMAND=("$@")
else
    COMMAND=("run")
fi


# Change to the directory where this script (and miniqa.yml) is located
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

# Download the latest GNOME OS nightly disk image, if its not yet downloaded:
if [ ! -f "$IMG_PTH" ]; then
  echo "Downloading GNOME OS disk image from $IMG_DOWNLOAD_URL"
  curl -Lo "$IMG_PTH.tmp" "$IMG_DOWNLOAD_URL"
  mv "$IMG_PTH.tmp" "$IMG_PTH"
fi


# Copy the latest .zip file from ../dist to test assets:
EXTENSION_ZIP="$(ls -t ../dist/*.zip 2>/dev/null | head -n1)"
cp $EXTENSION_ZIP ./assets/dist/


if [ -x "$(command -v podman)" ]; then
  echo "Running using podman"
  podman run \
      --rm \
      -it \
      --device /dev/kvm \
      --tmpfs /tmp:size=1G,mode=1700 \
      -p 8080:8080 \
      -p 6080:6080 \
      -v .:/tests:z \
      ghcr.io/mityax/miniqa "${COMMAND[@]}"

elif [ -x "$(command -v docker)" ]; then
  echo "Running using docker"
  docker run \
      --rm \
      -it \
      --device /dev/kvm \
      --tmpfs /tmp:size=1G,mode=1700 \
      -p 8080:8080 \
      -p 6080:6080 \
      -v .:/tests \
      ghcr.io/mityax/miniqa "${COMMAND[@]}"

elif [ -x "$(command -v miniqa)" ]; then
  echo "Running using local install"
  miniqa "${COMMAND[@]}"

elif [ -x "$(command -v pip)" ]; then
  echo "Installing miniQA via pip..."
  pip install miniqa["$MINIQA_EXTRAS"]
  miniqa "${COMMAND[@]}"

else
  echo "Need either podman, docker or pip to run miniQA"

fi
