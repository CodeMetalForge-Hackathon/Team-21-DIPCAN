# Build status — Breadcrumbs puck (Team 21)

Living status for the puck objectives. Updated by the AI assistant as work lands; times are
venue local (Sat Nov 7 – Sun Nov 8, 2026). Design rationale lives in `CLAUDE.md`; this file
is only *what works right now*.

## Objectives

| # | Goal | Status | Verified how |
|---|---|---|---|
| 1 | **NFC wake** | 🟡 coded, sensor not wired | Hall pin 6: tap ≥300 ms = activate, hold 10 s = IP kill. `ACTIVATE` over USB for the bench. Compiles and flashed on puck 1; not yet exercised with a real Hall sensor. |
| 2 | **Pair** | 🔴 stub | `ACTIVATING` blinks, waits for the magnet to leave, goes to `HANDLING`. Needs the second radio to exchange `Pair` packets. |
| 3 | **Sleep & listen** | ⏸️ deferred (decision 15:10) | **Listen** works: receiver always on, 20/20 sweeps answered over the air. **Sleep** (duty-cycled RX + long-preamble wake) was tried and got 0/10; parked behind `LISTEN_IDLE_SLEEP 0` until the PoC is complete. Note: RadioLib `receive()` timeout is **ms**, not µs — an earlier "10/10 while duty-cycled" result was actually always-on. |
| — | Bridge (32u4) | 🟢 flashed, working | RadioHead, 12.8 KB / 28 KB. RadioLib didn't fit (35 KB). `TX <hex>` → `OK n`; relays puck answers with RSSI/SNR. At `/dev/cu.usbmodem11201`. |
| 4 | **Answer** | 🟢 pass, **over the air, 54/55** | 32u4 bridge (RadioHead) → puck 1 (RadioLib, LoRa mode) → HMAC verified → slotted reply → Python parsed `puck 1 elev=115m`. RSSI −28…−32 dBm across the table with soldered antennas (was −50 loose). One unexplained miss in 55; watching for it. |
| 5 | **Tamper** | 🟢 pass (baro) | 1.0 m lift → `suspicious` at 8 Pa → `brick confirmed` 2.2 s later. Accelerometer not wired yet (`HAS_ACCEL 0`). |
| 6 | **Kill** | 🟢 pass, **over the air** | `sweep.py --kill` via the bridge → bricked → silent on next sweep. Also verified over USB. Flag survives reboot/reflash; `UNBRICK` over USB restores. |
| — | Replay guard | 🟢 pass | Re-sent challenge #1 → `EVT replay_rejected`. |
| — | **LOCATE** (homing) | 📐 designed, not built (16:30) | Signed per-puck command → 60 s of power-stepped beacons (20/10/2/−4 dBm) + buzzer/LED chirp; rescuer homes on RSSI and lowest power heard. Firmware edits saved as `docs/locate-firmware.patch`; design in `docs/locate-design.md`. Deferred until the PoC is complete. |

## Hardware state

- **Puck 1**: Feather RP2040 RFM95 + BME688 (STEMMA QT, 0x77) + spring antenna **soldered** (15:40). On USB at `/dev/cu.usbmodem2101`. Firmware: `puck_feather`, ID 1, **LoRa transport**, always-on receiver, `DEMO 1`.
- **Puck 2**: not assembled.
- **Interrogator bridge** (Feather 32u4 RFM95): assembled, antenna **soldered** (15:40), flashed with `bridge_feather`. On USB at `/dev/cu.usbmodem11201`.
- **Pi 5**: repo cloned, bridge on `/dev/ttyACM0`, sweeps puck 1 over the air (16:55, `elev=111m`). Phone / hotspot / ATAK: in progress. `cot.py` warns and prints markers instead of crashing when there's no route.
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
| LoRa | 915 MHz, SF9, BW125, CR4/7, sync 0x12, +4-byte RadioHead header | demo; SF11 production |
| Hall tap / hold | 300 ms / 10 s | activate / IP kill |

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
| 14:40 | 32u4 bridge: `TX 0102` → `OK 2` | ok |
| 14:45 | **first packet over the air**: sweep via bridge → puck 1 answered, RSSI −43 | ok |
| 14:50 | 10 sweeps, puck "duty-cycled" (actually always-on: ms/µs bug) | 10/10 |
| 15:00 | 10 sweeps, real 200 ms window + 300-symbol bridge preamble | **0/10** → deferred |
| 15:10 | 10 sweeps, always-on receiver, 8-symbol preamble | 10/10, RSSI −49…−52 (bridge antenna wobbled mid-run) |
| 15:15 | 5 sweeps, antenna reseated | 5/5, RSSI −49…−52 |
| 15:45 | antennas soldered; 10 sweeps | 9/10, RSSI −36…−38; one miss at ctr=32 |
| 15:50 | 20 sweeps | 20/20, RSSI −27…−32 |
| 15:52 | **kill over the air** → sweep | bricked, silent; `UNBRICK` ok |
| 16:50 | Pi couldn't reach puck: it was DORMANT after UNBRICK (not bricked). Added `STATUS` serial cmd, time-based counter in sweep.py | fixed |
| 16:55 | **Pi 5 + 32u4 bridge → puck 1 over the air** | `puck 1 elev=111m` |

## Next

1. ~~First packet over the air~~ done.
2. Assemble puck 2 (antenna, BME688 if a second one exists, flash `build.sh puck 2 lora`); two pucks answering in slots.
3. Wire Hall sensor to pin 6 → real activation; magnet in the phone case.
4. Chain the MMA7660 onto the BME688's second STEMMA port → `HAS_ACCEL 1` → tilt/motion tamper.
5. Pi hotspot + ATAK on the phone → `cot.py` marker lands (Sat 20:00 gate).
6. ~~Solder both antennas~~ done 15:40. TX power can go to 20 dBm for range tests now (`LORA_TX_DBM` in both sketches).

## Parked features (designed, not built)

- **LOCATE / homing** — see `docs/locate-design.md` and `docs/locate-firmware.patch`. Answers
  "how does the rescuer find the puck without GPS": chain offsets → RSSI homing (body-shadow
  DF, no hardware) → keyed beacon with power stepping → buzzer for the last 20 m.
- **Duty-cycled receive** — behind `LISTEN_IDLE_SLEEP`; 0/10 with the long-preamble bridge.

## Known gaps / honest notes for the table

- Receiver is always on for the PoC. Duty-cycled listening (and MCU dormant mode) is the production story; the wake-on-radio code path exists behind `LISTEN_IDLE_SLEEP` but doesn't work yet.
- Pairing and the chain key are pre-shared at flash time. ECDH at pairing is the production story.
- Tamper currently has one confirmer (barometer). Accelerometer adds tilt/motion; light sensor is on the cut list.
- `UNBRICK` exists only on USB serial. It is not reachable over the radio.
