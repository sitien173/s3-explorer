#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

mapfile -d "" -t appimages < <(find dist -maxdepth 1 -type f -name "*.AppImage" -print0)
if [ "${#appimages[@]}" -ne 1 ]; then
	printf "Expected exactly one dist/*.AppImage, found %s\n" "${#appimages[@]}" >&2
	exit 1
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
mkdir -p "$tmp_dir/user-data"

args=(--user-data-dir="$tmp_dir/user-data" --password-store=basic --smoke)
if [ ! -r /dev/fuse ] || [ ! -w /dev/fuse ]; then
	args=(--appimage-extract-and-run "${args[@]}")
fi

timeout -k 5 60s xvfb-run -a "${appimages[0]}" "${args[@]}"
