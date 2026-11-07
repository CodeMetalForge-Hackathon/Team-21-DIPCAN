# CLAUDE.md — Breadcrumbs (Team 21, Forge 2026)

Context for anyone (or any AI assistant) working in this repo. Read this before touching
firmware or the interrogator. The authoritative concept doc is `docs/Team_21_COA_3.pdf`;
this file summarizes it and records the decisions made since.

## What we're building

Bottle-cap LoRa pucks (~15 g, target $15) that an isolated person (IP) drops as they move.
Each puck:

1. **Dormant** in the survival vest. No emissions.
2. **Activation**: IP taps it (token/magnet). Two pucks activated within 10 s pair and share a chain key.
   One becomes the anchor, one is carried.
3. **Carried**: logs steps, heading (if magnetometer), barometric altitude. Radio off.
4. **Settling**: dropped; after a stillness window it arms tamper.
5. **Listening**: wakes the LoRa receiver briefly on a period. Answers *only* a challenge signed
   with the chain key. The answer (puck ID, chain position, elevation, time since drop,
   vector **from the previous puck**) is the first and only transmission in its life.
6. **Bricked**: keys zeroized, flash erased, radio off. Triggered by sustained motion after
   settle, light, a signed kill over LoRa, an IP kill tap, or a dead-man timer.

A CSAR element carries an **interrogator** (Pi + LoRa bridge + chain key). It sweeps a signed
challenge, pucks answer in slots, and the chain is pushed to **ATAK** as CoT markers + a route.
A puck that fails to answer, or sent a tamper burst, marks an enemy at a known point and time.

### Scenario (from the COA)
April 2026, F-15E down over southern Iran. WSO alone in the Zagros ~48 h, hunted, had to leave
cover to use his beacon. The gap: for two days he had to choose between staying hidden and
being findable. Breadcrumbs let him go fully dark and still leave a trail only friendlies can read.

### Mapping to the hackathon's four objectives
| Objective | Our answer | Claim we can defend |
|---|---|---|
| Locate without GPS | Chain of drops relative to first anchor, each with elevation + steps/heading to the next | Which valley and ridge, to a few hundred m. Not a grid. |
| Detect life | "Time since drop" on the newest puck = alive and moving then; elevation profile = direction | Proof of life at a time/place, not vitals |
| Map changing conditions | A bricked/silent puck = enemy at a known point and time | Tamper detection is reliable; the "why" is inference |
| Deliver over degraded channels | Nothing emits until asked; one LoRa pass reads the chain into ATAK | ~1 mile ground-ground, more ground-air, LOS |

Judging: four equal criteria (relevance, working live demo, deployability, ideation), 1–5 each.
Table judging Sun 12:00–14:00. Only work after Sat 10:00 counts; git history is the proof.

## Design decisions (current — update when they change)

### Hardware pivot (Sat 13:00): Adafruit Feathers, not XIAO
The boards on the table are **Adafruit Feather RP2040 RFM95** (pucks) and a **Feather 32u4 RFM95**
(interrogator bridge), with a **BME688** on STEMMA QT. The build guide at `docs/index.html` matches
this. All firmware lives in `firmware/puck_feather/` and builds with `arduino-cli` via
`firmware/build.sh`. The earlier XIAO/PlatformIO sketches were removed (see git history).

### Radio
- **Raw LoRa PHY, 915 MHz, RFM95 (SX1276) via RadioLib.** Not LoRaWAN. Not Meshtastic (it chatters).
  Pins on the RP2040 Feather: CS 16, RST 17, DIO0 21. DIO1 is not wired, so no hardware
  duty-cycle RX; the puck opens a real 200 ms receive window each listen period instead.
- **TX power 5 dBm on the bench** until the spring antennas are soldered; 20 dBm for the stairwell.
- **The 32u4 bridge runs RadioHead, not RadioLib** (RadioLib's SX127x driver is 35 KB; the 32u4 has
  28 KB). RadioHead puts a 4-byte `{to, from, id, flags}` header on every frame and uses sync
  word 0x12, so: pucks add/strip the header under `TRANSPORT_LORA` (`RH_HDR_LEN` in `packet.h`),
  everything uses sync 0x12, and the bridge sets modem registers `{0x76, 0x94, 0x04}` = BW125,
  CR4/7, SF9, CRC on, to match the pucks. The Pi never sees the header. A second RP2040 Feather
  can be the bridge instead (`build.sh bridge rp2040`), same air format.
- **Demo SF7–SF9, BW125.** Production SF10–SF12 for range. A 40-byte packet at SF12 is ~2 s
  of airtime, which is why we keep packets small and SF low for the demo.
- **Slotted replies:** puck at chain position N answers at `N * SLOT_MS` (400 ms) after the
  challenge. Deterministic, no collisions, and visibly "in turn" on screen.
- **Listen duty cycle:** demo listens 50 ms every **1 s**. Production 50 ms every 10 s requires
  the interrogator to send a preamble longer than the sleep period (wake-on-radio). Do the
  1 s version first; the 10 s version is a constant plus a preamble setting.
- **Sleep-and-listen is the hardest piece. Timebox to Sat 22:00.** If it isn't working,
  run pucks always-on for the demo and state the duty-cycle math.

### Pairing and keys
- **Pair over LoRa at minimum TX power, with the chain key pre-shared at flash time.**
  Pairing exchanges only IDs and chain position. BLE + ECDH (Noise-style, as in the COA) is the
  *production* story, not built this weekend. This removes an entire second radio stack from
  the critical path.
- Chain key: 16 bytes, stored in NVS. Zeroized on brick.

### Challenge / answer security
- Challenge = `{type, chainId, counter, hmac16}`. **Counter is monotonic**; each puck stores the
  highest counter seen and ignores anything ≤ it. This prevents replaying a recorded challenge
  to make pucks transmit (DF risk).
- Answer = payload + HMAC-SHA256 truncated to 16 bytes. Crypto via the Arduino **Crypto** library
  (rweather) on the RP2040; stdlib `hmac` on the Pi.
- Packet budget is **40 bytes**, enforced by `static_assert` in `firmware/common/packet.h`.
  Challenge is 23 bytes, Answer is 35; `interrogator/packet.py` mirrors both and asserts the size.
- **Serial transport for the bench.** `TRANSPORT_LORA=0` makes the puck read `TX <hex>` and write
  `RX <hex> 0 0` over USB, so `sweep.py` talks to a puck directly with no radio. Same bytes, same
  HMAC, same state machine. Flip to `TRANSPORT_LORA=1` (`build.sh puck <id> lora`) for the air.
- `UNBRICK` over USB serial (never over the radio) clears the bricked flag and reboots. Bench only.

### Sensors and tamper
- **Accelerometer is primary.** Kit part is the Grove 3-Axis Digital Accelerometer ±1.5g
  (SKU 101020747, **MMA7660FC**, I2C 0x4C, 6-bit, 21 LSB/g). Run at 32–64 Hz, average samples.
  Its INT pin is on a solder pad, not the Grove cable; polling is fine for the demo.
- **Tamper logic:** tilt > 15° sustained or |g| off 1 g by > 0.25 for > 2 s = suspicious.
  Suspicious + confirmation (barometer pressure drop > ~20 Pa, OR ultrasonic ranger > 10 cm,
  OR light step change) = TAMPER. Suspicious alone > 10 s = TAMPER.
- **Arm on "was moving, now still"**, not on free-fall. Free-fall + impact just shortens the
  settle timer. Covers drop, toss, and gentle placement. Grace period after arming: motion in
  the first 10 s returns to HANDLING instead of bricking.
- **Barometer is the BME688** on the Feather's STEMMA QT port (I2C 0x77). Confirmed reading
  ~999 hPa / 116 m at the venue. It's the lift confirmer and the elevation source. Gas heater is
  off. Until the accelerometer is chained onto the same bus (`HAS_ACCEL 0`), a barometric lift
  alone is treated as both trigger and confirmation.
- The MMA7660 accelerometer chains onto the BME688's second STEMMA QT port (needs a Grove-to-
  STEMMA/jumper cable). Set `HAS_ACCEL 1` once it's wired.
- **Activation / disarm: Hall sensor + magnet is the plan.** ST25DV NFC (I2C, GPO wake) is the
  stretch goal if the library has one. Grove PN532 also works but draws more. Either way the
  pitch is "a challenge-response disarm before pickup"; the chip is an implementation detail.
- Hall on pin 6, LOW near a magnet. **Tap (≥300 ms) = activate. Hold 10 s on an activated puck
  = IP kill** (`brick("ip_kill")`). The activation tap doesn't count toward the hold.

### Power
- **LiPo on the Feather's JST-PH, not a coin cell.** RFM95 TX at 20 dBm pulls ~120 mA; a CR2032
  browns out. The Feather charges the LiPo over USB. Production story: coin cell + supercap.
- The RP2040 has no ESP32-style deep sleep. Demo runs always-on with `radio.sleep()` between
  listen windows; "dormant mode via pin wake" is the production story.

### Interrogator
- **Pi 5 + a Feather 32u4 RFM95 as a USB-serial LoRa bridge** (`/dev/ttyACM0`). The Pi does all
  the crypto and logic; the bridge just moves bytes as `TX <hex>` / `RX <hex> <rssi> <snr>`.
  A second RP2040 Feather works identically as the bridge if the 32u4 is a pain.
- **CoT goes to ATAK over UDP multicast `239.2.3.1:6969`** on the Pi hotspot. No server
  required. FreeTAKServer is optional/production.
- Original code is `chain.py` and `cot.py` (~200 lines). Everything else is existing tooling.

### Finding a puck without GPS (designed, not built)
Chain offsets get the rescuer to the neighborhood; RSSI on each answer (plus body-shadow
direction finding with the existing antenna) gets them close; a signed **LOCATE** command makes
one puck beacon for 60 s at stepped power with a buzzer chirp for the last 20 m. Full design and
a ready-to-apply firmware patch: `docs/locate-design.md`, `docs/locate-firmware.patch`. A Yagi
was ruled out for size. Build this after the PoC (puck 2, pairing, ATAK) is done.

### Timers (see `firmware/puck_feather/config.h`)
| Constant | Demo | Production |
|---|---|---|
| Settle before arm | 8 s | 60 s |
| Listen period | 1 s | 10 s |
| Listen window | 200 ms | 200 ms |
| Reply slot | 400 ms × position | same |
| Dead-man | 30 min | 72 h |
| Pair window | 10 s | 10 s |

## Tech stack

| Layer | Choice |
|---|---|
| MCU | Adafruit Feather RP2040 RFM95 (`rp2040:rp2040:adafruit_feather_rfm`, Earle Philhower core 6.3.2) |
| Framework | Arduino, C++ |
| Build | `arduino-cli` 1.5.x; `firmware/build.sh puck <id> [serial|lora]` / `build.sh bench` |
| LoRa | RadioLib 7.8 (`SX1276` class) |
| Sensors | Adafruit BME680 lib (drives the BME688); Seeed `Accelerometer_MMA7660` when wired |
| Crypto | Crypto 0.4 (rweather) `SHA256::resetHMAC/finalizeHMAC` |
| Storage | RP2040 EEPROM emulation (counter + bricked flag). Survives reflash by design. |
| Interrogator | Python 3.11+, pyserial, stdlib `hmac`, `socket` |
| TAK | ATAK-CIV on Android, scrcpy to mirror to the monitor |

Chain key: `interrogator/.env` (gitignored) holds `CHAIN_KEY_HEX` and `CHAIN_ID`; `build.sh`
bakes it into the firmware with `-D`, `sweep.py --key` reads the same value.

## Hardware on hand (Sat 13:00)

Built and verified: Feather RP2040 RFM95 #1 with spring antenna (set, not yet soldered) and
BME688 on a 50 mm STEMMA QT cable. Reads 999 hPa / 116 m / 24 °C. Radio inits.
On the table, not yet assembled: second RP2040 Feather (puck 2), Feather 32u4 RFM95
(interrogator bridge), Pi 5, Android phone.
From the Grove kit: MMA7660 accelerometer, ultrasonic ranger, Hall sensor, light sensor,
temp & humidity, line finder.
Still wanted: Grove-to-STEMMA (or jumper) cable to chain the accelerometer, LiPos with JST-PH,
magnets, an NFC tag chip (ST25DV) if one turns up.

## Bench status

| Test | Result |
|---|---|
| BME688 over I2C | pass, 2 s cadence |
| RFM95 `radio.begin` 915 MHz SF9 | pass |
| `ACTIVATE` → settle 8 s → `ARMED` with baro baseline | pass |
| `sweep.py` challenge #1 → signed answer parsed, elev 116 m | pass (serial transport) |
| Replay of challenge #1 | `EVT replay_rejected` |
| `sweep.py --kill` | puck bricked, silent on next sweep |
| Bricked flag survives reboot/reflash; `UNBRICK` clears it | pass |
| Barometric lift tamper | **not yet tested** (needs a human to lift it) |
| Two radios over the air | blocked on puck 2 / 32u4 assembly |
| CoT into ATAK | blocked on hotspot; `cot.py` now warns instead of crashing |

## Lanes and build order

- **Lane A — puck firmware (2 people).** Order: bare LoRa link → challenge/answer → kill →
  tamper → dead reckoning → sleep-and-listen (last, timeboxed).
- **Lane B — interrogator + ATAK (1 person).** Order: multicast CoT to ATAK (prove the phone
  shows a hand-written marker) → bridge serial → sweep.py → chain.py → cot.py.
- **Lane C — everyone at the end.** Potting, battery, stairwell field test.
- One named owner for integration and the demo. Put the name here: ______

## Milestones

- [~] Sat 12:00 — two boards exchange a packet over raw LoRa (puck 1 radio up; puck 2 not built); BME688 reads
- [x] Sat 14:00 — signed challenge/answer on the bench; interrogator prints ID + elevation (done 13:30, serial transport)
- [ ] Sat 17:00 — pairing works; listen/sleep cycle confirmed (or timebox decision logged)
- [ ] Sat 20:00 — **gate:** one puck's answer appears as a marker in ATAK. If broken at 22:00, all hands to Lane B
- [ ] Sun 02:00 — tamper bricks a puck; chain of four draws as a route; kill works
- [ ] Sun 10:00 — full stairwell rehearsal; code frozen; backup video recorded
- [ ] Sun 12:00 — submit

Cut order if behind: heading histogram → relay between pucks → light-sensor tamper → IP kill gesture.
Pairing, listen-and-answer, elevation, accelerometer tamper, remote kill, and the ATAK chain stay.

## Conventions

- `firmware/common/packet.h` is the contract between puck, bridge, and Pi. Change it only
  with both lanes present. Keep `static_assert(sizeof(...) <= PACKET_MAX)` green.
- Every timer and threshold lives in `firmware/puck_feather/config.h`, never inline.
- Serial log lines from the puck are `STATE <name>` / `EVT <name> ...` so the demo can tail them.
  `sweep.py` only looks at lines starting `RX `, so logging and transport share the port safely.
- Commit small and often; the git log is our proof of work.
- Never commit keys. `interrogator/.env` is gitignored; `build.sh` reads it. Don't paste the key
  into a sketch.
- `arduino-cli` builds from a temp copy of the sketch, so `#include "../common/packet.h"` fails.
  `build.sh` passes `-Ifirmware/common` instead; sketches `#include "packet.h"`.

## Answers to have ready at the table

- **Why not a beacon?** A beacon transmits. These never do until a friendly asks.
- **What if the enemy has the interrogator?** They need the chain key, created at pairing, never sent.
- **No time to pair?** One puck self-activates with a 3 s hold and chains to the next by ID.
- **Vs. the national asset that found him?** That found him once he left cover. This says where to look while he stays hidden.
- **Enemy finds the chain?** Each one bricks; the gap is intel.
- **Range?** About a mile ground to ground, more from the air, line of sight.
- **What existed before?** The COA document. All code was written this weekend.
