#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  printf 'Usage: %s SLUG\n' "$0" >&2
  exit 2
fi

script_dir=$(CDPATH= cd "$(dirname "$0")" && pwd)
# shellcheck disable=SC1091
. "$script_dir/slug-utils.sh"
validate "$1"
