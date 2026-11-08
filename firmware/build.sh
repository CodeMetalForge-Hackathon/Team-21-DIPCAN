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
    # Optional env: IMU=1 (Grove 9DOF wired), ACCEL=1 (MMA7660 instead), BARO=0 (no BME688), PHONE=1 (XIAO BLE bridge),
    #               REED=1 (Grove magnetic switch on D6 instead of the Hall sensor: active HIGH)
    # -DBUFFER_LENGTH=32: Seeed's I2Cdev expects the AVR Wire constant; RP2040 core doesn't define it.
    #               TAB=1 (pull-tab: jumper D6->3V3 in = dormant, pulled = activate, re-inserted 10 s = kill)
    #               LAST=1 (the final puck: ends its leg by stillness, never answers PAIR_REQ)
    # The <id> argument is now just a label for the flash log; ids are assigned by pairing.
    ACTLOW=1; [ "${REED:-0}" = "1" ] && ACTLOW=0
    FLAGS="-I$ROOT/firmware/common -DBUFFER_LENGTH=32 -DCHAIN_KEY_HEX=\"$KEY\" -DCHAIN_ID=$CHAIN -DTRANSPORT_LORA=$LORA -DHAS_IMU=${IMU:-0} -DHAS_ACCEL=${ACCEL:-0} -DHAS_BARO=${BARO:-1} -DHAS_PHONE_LINK=${PHONE:-0} -DHALL_ACTIVE_LOW=$ACTLOW -DPULL_TAB=${TAB:-0} -DIS_LAST=${LAST:-0}"
    # --library: vendored, RP2040-patched Grove IMU driver takes priority over any globally installed copy
    arduino-cli compile --fqbn "$FQBN_PUCK" "$ROOT/firmware/puck_feather" --library "$ROOT/firmware/lib/Grove_IMU_9DOF" --build-property "build.extra_flags=$FLAGS"
    [ -n "$PORT" ] && arduino-cli upload --fqbn "$FQBN_PUCK" -p "$PORT" "$ROOT/firmware/puck_feather"
    ;;
  puck32)
    # Minimal puck on a Feather 32u4 RFM95 (no sensors). env LAST=1 for the final puck. Tab = D6<->GND.
    PORT="${2:-$(arduino-cli board list 2>/dev/null | awk '/32u4/{print $1; exit}')}"
    FLAGS="-I$ROOT/firmware/common -mcall-prologues -DCHAIN_KEY_HEX=\"$KEY\" -DCHAIN_ID=$CHAIN -DIS_LAST=${LAST:-0} -DHAS_ACCEL=${ACCEL:-0} -DHAS_IMU9=${IMU9:-0}"
    arduino-cli compile --fqbn adafruit:avr:feather32u4 "$ROOT/firmware/puck_32u4" --library "$ROOT/firmware/lib/Grove_IMU_9DOF" --build-property "build.extra_flags=$FLAGS"
    [ -n "$PORT" ] && arduino-cli upload --fqbn adafruit:avr:feather32u4 -p "$PORT" "$ROOT/firmware/puck_32u4"
    ;;
  bench)
    PORT="${2:-$(port_auto)}"
    arduino-cli compile --fqbn "$FQBN_PUCK" "$ROOT/firmware/bench_feather"
    [ -n "$PORT" ] && arduino-cli upload --fqbn "$FQBN_PUCK" -p "$PORT" "$ROOT/firmware/bench_feather"
    ;;
  bridge)
    # Feather 32u4 RFM95 by default; pass "rp2040" as $2 to build the bridge for a second RP2040 Feather.
    if [ "${2:-}" = "rp2040" ]; then FQBN="$FQBN_PUCK"; PORT="${3:-$(port_auto)}"
    else FQBN="adafruit:avr:feather32u4"; PORT="${2:-$(arduino-cli board list 2>/dev/null | awk '/32u4/{print $1; exit}')}"; fi
    arduino-cli compile --fqbn "$FQBN" "$ROOT/firmware/bridge_feather"
    [ -n "$PORT" ] && arduino-cli upload --fqbn "$FQBN" -p "$PORT" "$ROOT/firmware/bridge_feather"
    ;;
  ble)
    # ESP32-S3 BLE<->UART bridge. XIAO ESP32S3 Plus by default. Other S3 boards via FQBN_BLE, e.g.
    #   FQBN_BLE=esp32:esp32:XIAO_ESP32S3 firmware/build.sh ble
    FQBN="${FQBN_BLE:-esp32:esp32:XIAO_ESP32S3_Plus}"
    PORT="${2:-$(arduino-cli board list 2>/dev/null | awk '/ESP32|XIAO|usbmodem/ && !/Feather/{print $1; exit}')}"
    arduino-cli compile --fqbn "$FQBN" "$ROOT/firmware/ble_bridge_esp32"
    [ -n "$PORT" ] && arduino-cli upload --fqbn "$FQBN" -p "$PORT" "$ROOT/firmware/ble_bridge_esp32"
    ;;
  *) echo "usage: build.sh puck [id] [lora|serial] [port] | bench [port] | bridge [rp2040] [port] | ble [port]"; exit 1 ;;
esac
