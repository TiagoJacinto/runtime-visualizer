#!/usr/bin/env bash
set -euo pipefail

project_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
frontend_port=${FRONTEND_PORT:-5173}
https_port=${TAILSCALE_HTTPS_PORT:-5191}
frontend_url="http://127.0.0.1:${frontend_port}/"
vite_bin="$project_root/browser/node_modules/.bin/vite"
log_file=''
vite_pid=''
route_created=0

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

valid_port() {
  [[ $1 =~ ^[0-9]+$ ]] && (( $1 >= 1 && $1 <= 65535 ))
}

for command_name in tailscale curl python3; do
  command -v "$command_name" >/dev/null 2>&1 || fail "Required command not found: $command_name"
done
[[ -x "$vite_bin" ]] || fail 'Browser dependencies are missing; run bun install first.'
valid_port "$frontend_port" || fail 'FRONTEND_PORT must be a TCP port from 1 to 65535.'
valid_port "$https_port" || fail 'TAILSCALE_HTTPS_PORT must be a TCP port from 1 to 65535.'

port_is_open() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}

is_runtime_visualizer() {
  local page
  page=$(curl --fail --silent --max-time 3 "$frontend_url") || return 1
  [[ $page == *'<title>runtime-visualizer</title>'* && $page == *'id="root"'* ]]
}

app_needs_start=1
while :; do
  frontend_url="http://127.0.0.1:${frontend_port}/"
  if ! port_is_open "$frontend_port"; then
    break
  fi
  if is_runtime_visualizer; then
    app_needs_start=0
    break
  fi
  (( frontend_port < 65535 )) || fail "No available frontend TCP port found at or above $frontend_port."
  frontend_port=$((frontend_port + 1))
done

while :; do
  route_state=$(tailscale serve status --json | python3 -c '
import json, sys
port, frontend_port = sys.argv[1:]
status = json.load(sys.stdin)
web = status.get("Web", {})
matching = [value for name, value in web.items() if name.rsplit(":", 1)[-1] == port]
expected = {"/": {"Proxy": f"http://127.0.0.1:{frontend_port}"}}
if not matching:
    print("missing")
elif len(matching) == 1 and matching[0].get("Handlers") == expected:
    print("existing")
else:
    print("conflict")
' "$https_port" "$frontend_port")

  [[ $route_state == conflict ]] || break
  (( https_port < 65535 )) || fail "No available Tailscale HTTPS listener found at or above $https_port."
  next_https_port=$((https_port + 1))
  printf 'HTTPS listener %s already has a different Tailscale Serve route; trying %s.\n' \
    "$https_port" "$next_https_port" >&2
  https_port=$next_https_port
done

cleanup() {
  local exit_status=$?
  trap - EXIT INT TERM
  if [[ -n $vite_pid ]]; then
    kill "$vite_pid" 2>/dev/null || true
    wait "$vite_pid" 2>/dev/null || true
  fi
  if (( route_created )); then
    tailscale serve --https="$https_port" off >/dev/null 2>&1 || true
  fi
  if [[ -n $log_file ]]; then
    rm -f -- "$log_file"
  fi
  exit "$exit_status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [[ ${app_needs_start:-0} == 1 ]]; then
  log_file=$(mktemp "${TMPDIR:-/tmp}/runtime-visualizer-vite.XXXXXX.log")
  (
    cd -- "$project_root/browser"
    exec "$vite_bin" --host 127.0.0.1 --port "$frontend_port" --strictPort
  ) >"$log_file" 2>&1 &
  vite_pid=$!

  ready=0
  for _ in $(seq 1 40); do
    if is_runtime_visualizer; then
      ready=1
      break
    fi
    if ! kill -0 "$vite_pid" 2>/dev/null; then
      cat "$log_file" >&2
      fail 'Vite exited before the workspace became available.'
    fi
    sleep 0.5
  done
  if (( ! ready )); then
    cat "$log_file" >&2
    fail 'Timed out waiting for the Vite workspace.'
  fi
fi

if [[ $route_state == missing ]]; then
  tailscale serve --bg --https="$https_port" "$frontend_port" >/dev/null
  route_created=1
fi

fqdn=$(tailscale status --json | python3 -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))')
[[ -n $fqdn ]] || fail 'Tailscale did not report this machine’s DNS name.'
url="https://${fqdn}:${https_port}/"

verified=0
for _ in $(seq 1 20); do
  if curl --fail --silent --max-time 4 "$url" | grep -Fq '<title>runtime-visualizer</title>'; then
    verified=1
    break
  fi
  sleep 0.5
done
(( verified )) || fail "The Tailscale HTTPS URL did not serve the workspace: $url"

printf 'URL: %s\n' "$url"
printf 'Access: tailnet only\n'
if [[ -n $vite_pid ]]; then
  printf 'Stop: press Ctrl-C (stops Vite and any Serve route this command created)\n'
else
  printf 'Stop: press Ctrl-C (leaves the existing Vite server running; removes any Serve route this command created)\n'
fi

while true; do
  if [[ -n $vite_pid ]]; then
    kill -0 "$vite_pid" 2>/dev/null || break
  else
    port_is_open "$frontend_port" || break
  fi
  sleep 1
done
