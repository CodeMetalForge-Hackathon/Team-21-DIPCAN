#!/usr/bin/env bash
# Build / flash helper for the Feather boards.
#   firmware/build.sh puck  [PUCK_ID] [lora|serial] [port]     # default: 1 serial auto
#   firmware/build.sh bench [port]
# Chain key comes from interrogator/.env (gitignored). Never hardcode it.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FQBN_PUCK="rp2040:rp2040:adafruit_feather_rfm"
ENV="$ROOT/interrogator/.env"
[ -f "$ENV" ] || { echo "missing $ENV (CHAIN_KEY_HEX=..., CHAIN_ID=...)"; exit 1; }
KEY=$(grep '^CHAIN_KEY_HEX=' "$ENV" | cut -d= -f2)
CHAIN=$(grep '^CHAIN_ID=' "$ENV" | cut -d= -f2 || echo 1)

port_auto() { arduino-cli board list 2>/dev/null | awk '/Feather RP2040 RFM/{print $1; exit}'; }

case "${1:-puck}" in
  puck)
    ID="${2:-1}"; T="${3:-serial}"; PORT="${4:-$(port_auto)}"
    LORA=0; [ "$T" = "lora" ] && LORA=1
    FLAGS="-I$ROOT/firmware/common -DCHAIN_KEY_HEX=\"$KEY\" -DCHAIN_ID=$CHAIN -DPUCK_ID=$ID -DTRANSPORT_LORA=$LORA"
    arduino-cli compile --fqbn "$FQBN_PUCK" "$ROOT/firmware/puck_feather" --build-property "build.extra_flags=$FLAGS"
    [ -n "$PORT" ] && arduino-cli upload --fqbn "$FQBN_PUCK" -p "$PORT" "$ROOT/firmware/puck_feather"
    ;;
  bench)
    PORT="${2:-$(port_auto)}"
    arduino-cli compile --fqbn "$FQBN_PUCK" "$ROOT/firmware/bench_feather"
    [ -n "$PORT" ] && arduino-cli upload --fqbn "$FQBN_PUCK" -p "$PORT" "$ROOT/firmware/bench_feather"
    ;;
  *) echo "usage: build.sh puck [id] [lora|serial] [port] | bench [port]"; exit 1 ;;
esac
