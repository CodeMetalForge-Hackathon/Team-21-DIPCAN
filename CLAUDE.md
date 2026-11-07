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

### Radio
- **Raw LoRa PHY, 915 MHz, SX1262, via RadioLib.** Not LoRaWAN. Not Meshtastic (it chatters).
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
- Answer = payload + HMAC-SHA256 truncated to 16 bytes. Crypto via **mbedTLS**, already in ESP-IDF.
- Packet budget is **40 bytes**, enforced by `static_assert` in `firmware/common/packet.h`.

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
- **Barometer (BMP280/BME280) is requested from the hardware library; not in the team kit.**
  If it never arrives, ultrasonic ranger (face-down) + light sensor confirm pickup, and the
  elevation claim drops to "elevation at drop" via whatever the LoRa board provides.
- **Activation / disarm: Hall sensor + magnet is the plan.** ST25DV NFC (I2C, GPO wake) is the
  stretch goal if the library has one. Grove PN532 also works but draws more. Either way the
  pitch is "a challenge-response disarm before pickup"; the chip is an implementation detail.

### Power
- **100 mAh LiPo, not a coin cell.** SX1262 TX at 22 dBm pulls ~120 mA; a CR2032 browns out.
  Production story: coin cell + supercap.

### Interrogator
- **Pi 5 + a XIAO running the bridge firmware over USB serial.** Same RadioLib code as the
  pucks; the Pi talks framed hex lines over `/dev/ttyACM0`. Avoids Pi SPI LoRa HAT driver pain.
- **CoT goes to ATAK over UDP multicast `239.2.3.1:6969`** on the Pi hotspot. No server
  required. FreeTAKServer is optional/production.
- Original code is `chain.py` and `cot.py` (~200 lines). Everything else is existing tooling.

### Timers (see `firmware/puck/src/config.h`)
| Constant | Demo | Production |
|---|---|---|
| Settle before arm | 8 s | 60 s |
| Listen period | 1 s | 10 s |
| Listen window | 50 ms | 50 ms |
| Reply slot | 400 ms × position | same |
| Dead-man | 30 min | 72 h |
| Pair window | 10 s | 10 s |

## Tech stack

| Layer | Choice |
|---|---|
| MCU | Seeed XIAO ESP32 (C6 preferred; S3/C3 fine). C6 needs arduino-esp32 core 3.x. |
| Framework | Arduino core for ESP32, C++, on FreeRTOS/ESP-IDF |
| Build | PlatformIO (`platformio.ini` per target) |
| LoRa | RadioLib |
| Sensors | Seeed `Accelerometer_MMA7660`, Adafruit `BMP280` |
| Crypto | mbedTLS (bundled) |
| Storage | ESP32 `Preferences` (NVS); `nvs_flash_erase()` is the brick |
| Interrogator | Python 3.11+, pyserial, stdlib `hmac`, `socket` |
| TAK | ATAK-CIV on Android, scrcpy to mirror to the monitor |

## Hardware on hand (Sat morning)

From the Grove 40-in-1 kit, confirmed: 3-axis accelerometer (MMA7660), temp & humidity,
ultrasonic ranger, Hall sensor, light sensor, line finder. **No barometer found.**

Requested from the library: BMP280/BME280, LoRa SX1262 modules (Wio-SX1262 for XIAO ideally),
two more XIAOs (four pucks + bridge), 9-axis IMU with magnetometer, LiPos with JST, PN532 or
ST25DV, Pi 4/5 for the interrogator, Android phone with NFC for ATAK.

## Lanes and build order

- **Lane A — puck firmware (2 people).** Order: bare LoRa link → challenge/answer → kill →
  tamper → dead reckoning → sleep-and-listen (last, timeboxed).
- **Lane B — interrogator + ATAK (1 person).** Order: multicast CoT to ATAK (prove the phone
  shows a hand-written marker) → bridge serial → sweep.py → chain.py → cot.py.
- **Lane C — everyone at the end.** Potting, battery, stairwell field test.
- One named owner for integration and the demo. Put the name here: ______

## Milestones

- [ ] Sat 12:00 — two XIAOs exchange a packet over raw LoRa; sensors read on both
- [ ] Sat 14:00 — signed challenge/answer on the bench; interrogator prints ID + elevation
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
- Every timer and threshold lives in `config.h`, never inline.
- Serial log lines from the puck are `STATE <name>` / `EVT <name> ...` so the demo can tail them.
- Commit small and often; the git log is our proof of work.
- Never commit keys. The demo chain key lives in `interrogator/.env` (gitignored) and is
  passed to firmware via `-D CHAIN_KEY_HEX=...` in a local `platformio.local.ini` (gitignored).

## Answers to have ready at the table

- **Why not a beacon?** A beacon transmits. These never do until a friendly asks.
- **What if the enemy has the interrogator?** They need the chain key, created at pairing, never sent.
- **No time to pair?** One puck self-activates with a 3 s hold and chains to the next by ID.
- **Vs. the national asset that found him?** That found him once he left cover. This says where to look while he stays hidden.
- **Enemy finds the chain?** Each one bricks; the gap is intel.
- **Range?** About a mile ground to ground, more from the air, line of sight.
- **What existed before?** The COA document. All code was written this weekend.
