#!/usr/bin/env bash
# Bounded negative-feasibility witness. Runs no Factory code or integration.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
evidence=${1:-$(mktemp -d /tmp/rv-bun-inspector.XXXXXX)}
mkdir -p "$evidence"
sha256sum "$here"/fixture/*.ts > "$evidence/source-before.sha256"
bun "$here/inspect.mjs" main.ts probe "$evidence/main-probe"
bun "$here/inspect.mjs" timing.ts control "$evidence/timing-control"
bun "$here/inspect.mjs" timing.ts probe "$evidence/timing-probe"
sha256sum "$here"/fixture/*.ts > "$evidence/source-after.sha256"
diff -u "$evidence/source-before.sha256" "$evidence/source-after.sha256"
bun "$here/audit.mjs" "$evidence"
printf 'Evidence assertions passed: the tested candidate FAILS the strict contract. Raw evidence: %s\n' "$evidence"
