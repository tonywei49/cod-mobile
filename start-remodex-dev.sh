#!/usr/bin/env bash

# FILE: start-remodex-dev.sh
# Purpose: Starts the local Remodex test stack in the shape useful for iPhone reconnect recovery.
# Layer: developer utility
# Exports: none
# Depends on: bash, curl, node, phodex-bridge/bin/remodex.js, run-local-remodex.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_ENV_FILE="${REMODEX_LOCAL_ENV_FILE:-${ROOT_DIR}/.env.remodex.local}"

if [[ -f "${LOCAL_ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${LOCAL_ENV_FILE}"
  set +a
fi

BRIDGE_DIR="${ROOT_DIR}/phodex-bridge"
LOCAL_LAUNCHER="${ROOT_DIR}/run-local-remodex.sh"

RELAY_PORT="${RELAY_PORT:-9000}"
RELAY_HOSTNAME="${RELAY_HOSTNAME:-}"
RELAY_URL="${REMODEX_RELAY:-}"
REMODEX_REFRESH_ENABLED="${REMODEX_REFRESH_ENABLED:-true}"
REMODEX_REFRESH_MODE="${REMODEX_REFRESH_MODE:-completion}"
RELAY_URL_EXPLICIT=0
STATUS_ONLY=0

if [[ -n "${RELAY_URL}" ]]; then
  RELAY_URL_EXPLICIT=1
fi

log() {
  echo "[start-remodex-dev] $*"
}

die() {
  echo "[start-remodex-dev] $*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: ./start-remodex-dev.sh [options]

Options:
  --hostname HOSTNAME   LAN hostname or IP the iPhone should use
  --relay-url URL       Existing relay URL, for VPS/Tailscale/tunnel setups
  --port PORT           Local relay port, default 9000
  --status              Print local relay/bridge status without starting anything
  --help                Show this help text

Common local use:
  ./start-remodex-dev.sh
  ./start-remodex-dev.sh --hostname 192.168.1.10

Local private defaults:
  Put RELAY_HOSTNAME, RELAY_PORT, REMODEX_RELAY, REMODEX_REFRESH_ENABLED, or
  REMODEX_REFRESH_MODE in .env.remodex.local to avoid retyping them.

If the relay is already healthy, this starts only the bridge.
If the relay is not healthy, this delegates to ./run-local-remodex.sh to start both.
EOF
}

require_value() {
  local flag_name="$1"
  local remaining_args="$2"
  [[ "${remaining_args}" -ge 2 ]] || die "${flag_name} requires a value."
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --hostname)
        require_value "--hostname" "$#"
        RELAY_HOSTNAME="$2"
        shift 2
        ;;
      --relay-url)
        require_value "--relay-url" "$#"
        RELAY_URL="$2"
        RELAY_URL_EXPLICIT=1
        shift 2
        ;;
      --port)
        require_value "--port" "$#"
        RELAY_PORT="$2"
        shift 2
        ;;
      --status)
        STATUS_ONLY=1
        shift
        ;;
      --help)
        usage
        exit 0
        ;;
      *)
        usage >&2
        die "Unknown argument: $1"
        ;;
    esac
  done
}

require_command() {
  local command_name="$1"
  command -v "${command_name}" >/dev/null 2>&1 || die "Missing required command: ${command_name}"
}

detect_lan_hostname() {
  if [[ -n "${RELAY_HOSTNAME}" ]]; then
    printf '%s\n' "${RELAY_HOSTNAME}"
    return
  fi

  local interface
  for interface in en0 en1 en2 bridge100; do
    local address
    address="$(ipconfig getifaddr "${interface}" 2>/dev/null || true)"
    address="${address//[$'\r\n']}"
    if [[ -n "${address}" ]]; then
      printf '%s\n' "${address}"
      return
    fi
  done

  if command -v scutil >/dev/null 2>&1; then
    local local_host_name
    local_host_name="$(scutil --get LocalHostName 2>/dev/null || true)"
    local_host_name="${local_host_name//[$'\r\n']}"
    if [[ -n "${local_host_name}" ]]; then
      printf '%s.local\n' "${local_host_name}"
      return
    fi
  fi

  printf 'localhost\n'
}

normalize_relay_url() {
  local raw_url="$1"

  node -e '
const rawUrl = process.argv[1];

try {
  const url = new URL(rawUrl);
  if (url.username || url.password) {
    throw new Error("credentials are not supported in relay URLs");
  }
  if (url.search || url.hash) {
    throw new Error("query strings and fragments are not supported in relay URLs");
  }
  if (url.protocol === "http:") {
    url.protocol = "ws:";
  } else if (url.protocol === "https:") {
    url.protocol = "wss:";
  } else if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new Error("expected ws://, wss://, http://, or https://");
  }
  if (url.pathname === "" || url.pathname === "/") {
    url.pathname = "/relay";
  }
  console.log(url.toString());
} catch (error) {
  console.error((error && error.message) || "invalid URL");
  process.exit(1);
}
' "${raw_url}"
}

bridge_running() {
  pgrep -f "remodex.js run" >/dev/null 2>&1
}

relay_healthy() {
  curl --silent --fail --max-time 3 "http://127.0.0.1:${RELAY_PORT}/health" >/dev/null 2>&1
}

print_status() {
  if [[ -n "${RELAY_URL}" ]]; then
    log "Relay URL: ${RELAY_URL}"
  else
    log "Relay URL: ws://${RELAY_HOSTNAME}:${RELAY_PORT}/relay"
  fi
  log "Desktop refresh: ${REMODEX_REFRESH_ENABLED}"
  log "Desktop refresh mode: ${REMODEX_REFRESH_MODE}"

  if relay_healthy; then
    log "Local relay: healthy on 127.0.0.1:${RELAY_PORT}"
  else
    log "Local relay: not healthy on 127.0.0.1:${RELAY_PORT}"
  fi

  if bridge_running; then
    log "Bridge: already running"
  else
    log "Bridge: not running"
  fi
}

start_bridge_foreground() {
  log "Starting bridge with ${RELAY_URL}"
  log "Desktop refresh: ${REMODEX_REFRESH_ENABLED}"
  log "Desktop refresh mode: ${REMODEX_REFRESH_MODE}"
  log "Keep this terminal open. Press Ctrl+C to stop the bridge."
  cd "${BRIDGE_DIR}"
  REMODEX_RELAY="${RELAY_URL}" \
  REMODEX_REFRESH_ENABLED="${REMODEX_REFRESH_ENABLED}" \
  REMODEX_REFRESH_MODE="${REMODEX_REFRESH_MODE}" \
  node ./bin/remodex.js run
}

start_local_stack_foreground() {
  log "Local relay is not healthy, starting relay + bridge with ${LOCAL_LAUNCHER}"
  REMODEX_REFRESH_ENABLED="${REMODEX_REFRESH_ENABLED}" \
  REMODEX_REFRESH_MODE="${REMODEX_REFRESH_MODE}" \
  exec "${LOCAL_LAUNCHER}" --hostname "${RELAY_HOSTNAME}" --port "${RELAY_PORT}"
}

parse_args "$@"
require_command curl
require_command node
RELAY_HOSTNAME="$(detect_lan_hostname)"

if [[ -n "${RELAY_URL}" ]]; then
  RELAY_URL="$(normalize_relay_url "${RELAY_URL}")" || die "Invalid relay URL."
else
  RELAY_URL="ws://${RELAY_HOSTNAME}:${RELAY_PORT}/relay"
fi

if [[ "${STATUS_ONLY}" -eq 1 ]]; then
  print_status
  exit 0
fi

if bridge_running; then
  print_status
  log "Bridge is already running. I will not start a duplicate bridge."
  exit 0
fi

if [[ "${RELAY_URL_EXPLICIT}" -eq 1 ]]; then
  start_bridge_foreground
  exit $?
fi

if relay_healthy; then
  log "Reusing the existing local relay on 127.0.0.1:${RELAY_PORT}"
  start_bridge_foreground
  exit $?
fi

start_local_stack_foreground
