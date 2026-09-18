#!/usr/bin/env bash

set -euo pipefail

max_attempts=3
for attempt in $(seq 1 "$max_attempts"); do
  if bun install --frozen-lockfile; then
    exit 0
  fi

  if [ "$attempt" -eq "$max_attempts" ]; then
    exit 1
  fi

  delay=$((2 ** (attempt - 1)))
  echo "Dependency installation failed; retrying in ${delay}s (attempt ${attempt}/${max_attempts})." >&2
  sleep "$delay"
done
