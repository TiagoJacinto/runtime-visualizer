#!/bin/sh
set -eu

script_dir=$(CDPATH= cd "$(dirname "$0")" && pwd)
# shellcheck disable=SC1091
. "$script_dir/slug-utils.sh"

generate_slug() {
  name=$1

  slug=$(
    printf '%s\n' "$name" |
      LC_ALL=C tr '[:upper:]' '[:lower:]' |
      LC_ALL=C tr -cs 'a-z0-9' '-' |
      sed 's/^-*//; s/-*$//'
  )

  if [ -n "$slug" ]; then
    validate "$slug"
    printf '%s\n' "$slug"
  else
    printf '%s\n' 'problem'
  fi
}

if [ "$#" -gt 0 ]; then
  generate_slug "$*"
else
  IFS= read -r name || name=
  generate_slug "$name"
fi
