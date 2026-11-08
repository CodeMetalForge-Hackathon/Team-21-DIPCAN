# Breadcrumbs — Team 21, Code Metal Forge 2026

Silent LoRa pucks an isolated person drops as they move. Nothing transmits until a
friendly interrogator sends a signed challenge; then the chain answers in one pass and
draws the route and elevation profile in ATAK. If an enemy picks one up, it bricks, and the
gap in the chain tells the team where and when.

**One line for a judge:** his radio tells us where he is when he keys it; this tells us
where he went while he stayed silent, and keeps telling us if he is taken.

Full concept, scenario, and 30-hour plan: [`docs/Team_21_COA_3.pdf`](docs/Team_21_COA_3.pdf).
Design decisions and build notes for contributors (human or AI): [`CLAUDE.md`](CLAUDE.md).

## Repo layout

```
firmware/
  common/packet.h     shared wire format — agree here first, both sides build against it
  puck_feather/       Feather RP2040 RFM95 puck: activate, settle, listen, answer, tamper, brick
  bench_feather/      first-light sketch: BME688 + RFM95 init + LED
  build.sh            arduino-cli wrapper that bakes the chain key in from interrogator/.env
interrogator/
  sweep.py            sends signed challenges (over the bridge, or straight to a puck on USB)
  chain.py            turns answers into an ordered chain with gaps
  cot.py              emits Cursor-on-Target markers + route to ATAK (UDP multicast)
  packet.py           Python mirror of packet.h
docs/                 COA, hardware list, build guide (index.html), demo script
```

Hardware: Adafruit Feather RP2040 RFM95 pucks, BME688 on STEMMA QT, Feather 32u4 RFM95 as the
interrogator's LoRa bridge, Raspberry Pi 5, Android phone running ATAK-CIV.

## Quick start

### Puck firmware (arduino-cli)

```sh
brew install arduino-cli
arduino-cli config add board_manager.additional_urls https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json https://adafruit.github.io/arduino-board-index/package_adafruit_index.json
arduino-cli core update-index && arduino-cli core install rp2040:rp2040 adafruit:avr
arduino-cli lib install RadioLib "Adafruit BME680 Library" Crypto

printf 'CHAIN_KEY_HEX=%s\nCHAIN_ID=1\n' "$(python3 -c 'import secrets;print(secrets.token_hex(16))')" > interrogator/.env

firmware/build.sh puck 1 serial      # puck ID 1, USB-serial transport (bench)
firmware/build.sh puck 2 lora        # puck ID 2, over the air
```

Bench a puck with no radio: `ACTIVATE` over serial arms it, then
`python3 interrogator/sweep.py --port /dev/cu.usbmodem* --key $KEY --once`. `--kill` bricks it;
`UNBRICK` over serial restores it.

`DEMO 1` in `firmware/puck_feather/config.h` gives short timers (settle 8 s, listen every 1 s).

### Interrogator (Raspberry Pi, Python 3.11+)

```sh
cd interrogator
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
python3 sweep.py --port /dev/ttyACM0 --key <chain-key-hex>
```

ATAK on the phone joins the Pi's hotspot and receives markers on the default SA multicast
group (`239.2.3.1:6969`). No server needed. FreeTAKServer is optional.

## Demo (3 min)

1. "IP" pairs two pucks at the table, drops one, walks the hallway and up the stairwell
   dropping three more, sits out of sight. Nothing on any screen.
2. "CSAR" walks the floor with the interrogator Pi and presses sweep. Pucks answer in turn;
   the chain draws in ATAK with elevation and an arrow from each to the next.
3. A judge picks up puck 3. Its marker turns "tampered HH:MM" and the chain shows the gap.
4. CSAR presses kill. Remaining markers go gray. Hand the judge the phone.

## Status

See the milestone table in `CLAUDE.md`. Check boxes as gates are hit.

## Team

Team 21. Built Sat 10:00 → Sun 12:00, Nov 7–8 2026, BASE-X Boston.
What existed before: the COA document. Everything in this repo was written during the build window.
