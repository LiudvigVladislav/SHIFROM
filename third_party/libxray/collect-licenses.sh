#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 Willen LLC
#
# Rebuilds licenses/ from the vendored libgojni.so. Go records every module it
# compiled into the binary, with its exact version; this script downloads each
# module at that version and copies its licence, notice and patent files.
# libXray itself is built from a local checkout (it shows up as "(devel)"), so
# its commit is passed in.
#
# Usage: third_party/libxray/collect-licenses.sh <libXray commit SHA>
# Needs: go, git.
set -euo pipefail

if [ $# -ne 1 ]; then
    printf 'Usage: %s <libXray commit SHA>\n' "$0" >&2
    exit 2
fi
LIBXRAY_REF=$1

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
JNI="$ROOT/shared/core/xray/src/androidMain/jniLibs"
OUT="$HERE/licenses"
WORK=$(mktemp -d)
trap 'chmod -R u+w "$WORK" 2>/dev/null; rm -rf "$WORK"' EXIT

modules() {
    go version -m "$1" | awk '$1 == "dep" && $3 ~ /^v/ && $2 != "github.com/xtls/libxray" { print $2, $3 }'
}

# All four ABIs come from one build and must embed the same modules.
modules "$JNI/arm64-v8a/libgojni.so" > "$WORK/modules.txt"
for abi in armeabi-v7a x86 x86_64; do
    if ! modules "$JNI/$abi/libgojni.so" | cmp -s - "$WORK/modules.txt"; then
        printf '%s embeds a different module set from arm64-v8a\n' "$abi" >&2
        exit 1
    fi
done

copy_licences() {   # <source dir> <destination dir>
    local found=0 f
    mkdir -p "$2"
    for f in "$1"/*; do
        case "$(basename "$f" | tr '[:upper:]' '[:lower:]')" in
            licen[cs]e*|copying*|notice*|patents*)
                cp "$f" "$2/"; found=1 ;;
        esac
    done
    if [ $found -eq 0 ]; then
        printf 'No licence file in %s\n' "$1" >&2
        exit 1
    fi
    # GPLv3 and LGPLv3 both require a copy of the GPL itself. Some modules ship
    # only the short "licensed under the GPL" notice, so attach the full text.
    # (MPL-2.0 names the GPL too, as a secondary licence; that does not count.)
    if grep -qE 'terms of the GNU (Lesser )?General Public License as published|GNU LESSER GENERAL PUBLIC LICENSE' "$2"/* &&
       ! grep -q 'TERMS AND CONDITIONS' "$2"/*; then
        cp "$HERE/GPL-3.0.txt" "$2/COPYING-GPL-3.0.txt"
    fi
}

rm -rf "$OUT"
export GOPATH="$WORK/gopath" GOFLAGS=-mod=mod
while read -r mod ver; do
    dir=$(go mod download -json "$mod@$ver" | sed -n 's/^[[:space:]]*"Dir": "\(.*\)",$/\1/p')
    copy_licences "$dir" "$OUT/$mod"
    printf '%s %s\n' "$mod" "$ver"
done < "$WORK/modules.txt"

git clone --quiet https://github.com/XTLS/libXray.git "$WORK/libxray"
git -C "$WORK/libxray" checkout --quiet "$LIBXRAY_REF"
copy_licences "$WORK/libxray" "$OUT/github.com/xtls/libxray"
printf 'github.com/xtls/libxray %s\n' "$(git -C "$WORK/libxray" rev-parse HEAD)"
