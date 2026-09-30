#!/usr/bin/env bash
set -euo pipefail

prototype_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fixture_dir="$prototype_dir/fixture"
temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/rv-native-bun.XXXXXX")"
cleanup() {
  rm -f "$temp_dir/baseline.stdout" "$temp_dir/baseline.stderr" \
    "$temp_dir/instrumented.stdout" "$temp_dir/trace.log"
  rmdir "$temp_dir"
}
trap cleanup EXIT

bun "$fixture_dir/main.ts" >"$temp_dir/baseline.stdout" 2>"$temp_dir/baseline.stderr"
bun --preload "$prototype_dir/preload.ts" "$fixture_dir/main.ts" \
  >"$temp_dir/instrumented.stdout" 2>"$temp_dir/trace.log"

if ! cmp -s "$temp_dir/baseline.stdout" "$temp_dir/instrumented.stdout"; then
  diff -u "$temp_dir/baseline.stdout" "$temp_dir/instrumented.stdout" || true
  printf 'Instrumented stdout differs from the baseline.\n' >&2
  exit 1
fi

printf 'Matching observable stdout (baseline and instrumented):\n'
cat "$temp_dir/instrumented.stdout"
printf '\n'
bun "$prototype_dir/verify-trace.ts" "$temp_dir/trace.log"
printf '\nLive events and retained replay from the instrumented run:\n'
cat "$temp_dir/trace.log"
