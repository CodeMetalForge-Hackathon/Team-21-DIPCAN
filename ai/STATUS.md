# Build status — Breadcrumbs puck (Team 21)

Living status for the puck objectives. Updated by the AI assistant as work lands; times are
venue local (Sat Nov 7 – Sun Nov 8, 2026). Design rationale lives in `CLAUDE.md`; this file
is only *what works right now*.

## Objectives

| # | Goal | Status | Verified how |
|---|---|---|---|
| 1 | **NFC wake** | 🟡 mechanism ready, sensor not wired | `DORMANT → ACTIVATING` on Hall pin LOW or `ACTIVATE` over USB. Needs Hall sensor on pin 6 (plan) or ST25DV GPO (stretch). |
| 2 | **Pair** | 🔴 stub | `ACTIVATING` falls straight through to `HANDLING`. Needs the second radio to exchange `Pair` packets. |
| 3 | **Sleep & listen** | 🟡 serial mode only | Always-on in `TRANSPORT_LORA=0`. LoRa duty cycle (200 ms window / 1 s period, `radio.sleep()` between) is coded, untested. |
| 4 | **Answer** | 🟢 pass | `sweep.py` challenge #1 → HMAC verified → slotted reply → Python parsed `puck 1 elev=116m`. |
| 5 | **Tamper** | 🟢 pass (baro) | 1.0 m lift → `suspicious` at 8 Pa → `brick confirmed` 2.2 s later. Accelerometer not wired yet (`HAS_ACCEL 0`). |
| 6 | **Kill** | 🟢 pass | `sweep.py --kill` → bricked; silent on next sweep; flag survives reboot/reflash; `UNBRICK` over USB restores. |
| — | Replay guard | 🟢 pass | Re-sent challenge #1 → `EVT replay_rejected`. |

## Hardware state

- **Puck 1**: Feather RP2040 RFM95 + BME688 (STEMMA QT, 0x77) + spring antenna (seated, **not soldered**). On USB at `/dev/cu.usbmodem2101`. Firmware: `puck_feather`, ID 1, serial transport, `DEMO 1`.
- **Puck 2**: not assembled.
- **Interrogator bridge** (Feather 32u4 RFM95): not assembled; no sketch yet.
- **Pi 5 / phone / hotspot**: not set up. `cot.py` warns and prints markers instead of crashing when there's no route.
- **Grove sensors on hand, unwired**: MMA7660 accelerometer, Hall, ultrasonic, light, temp/humidity.

## Thresholds in use (`firmware/puck_feather/config.h`)

| | Value | Note |
|---|---|---|
| Settle before arm | 8 s | demo; 60 s production |
| Arm grace | 10 s | motion here → back to HANDLING, no brick |
| Baro lift threshold | 8 Pa (~0.7 m) | was 20 Pa; a 1 m lift never crossed it |
| Baro sustain | 2 s | debounce |
| Baseline drift | τ = 5 min | tracks weather while still |
| Tamper without confirmation | 10 s | sustained motion alone |
| TX power | 5 dBm | until antennas are soldered; 20 dBm for the stairwell |
| LoRa | 915 MHz, SF9, BW125, sync 0x34 | demo; SF11 production |

## Test log

| Time | Test | Result |
|---|---|---|
| 13:05 | Feather enumerates; factory firmware counting on serial | ok |
| 13:20 | `bench_feather`: BME688 999.3 hPa / 116 m / 24 °C; `radio.begin` ok | ok |
| 13:35 | `puck_feather` ID 1 serial: `ACTIVATE` → armed base 99936 Pa | ok |
| 13:36 | `sweep.py --once`: challenge #1 answered, elev 116 m | ok |
| 13:38 | replay challenge #1 | rejected |
| 13:38 | `sweep.py --kill` → sweep #3 | bricked, silent |
| 13:45 | `UNBRICK` → reboot → re-arm | ok |
| 13:55 | lift test, 20 Pa threshold | **no trigger** (1 m ≈ 12 Pa) |
| 14:05 | lift test, 8 Pa threshold + drift baseline | brick confirmed at +2.2 s |

## Next

1. Assemble puck 2 (antenna, BME688 if a second one exists, flash `build.sh puck 2 lora`).
2. Write and flash the 32u4 bridge sketch; first packet over the air; measure RSSI across the room.
3. Wire Hall sensor to pin 6 → real activation; magnet in the phone case.
4. Chain the MMA7660 onto the BME688's second STEMMA port → `HAS_ACCEL 1` → tilt/motion tamper.
5. Pi hotspot + ATAK on the phone → `cot.py` marker lands (Sat 20:00 gate).
6. Solder both antennas before any range test.

## Known gaps / honest notes for the table

- Sleep is "radio off between windows", not MCU deep sleep. RP2040 dormant mode is the production story.
- Pairing and the chain key are pre-shared at flash time. ECDH at pairing is the production story.
- Tamper currently has one confirmer (barometer). Accelerometer adds tilt/motion; light sensor is on the cut list.
- `UNBRICK` exists only on USB serial. It is not reachable over the radio.
