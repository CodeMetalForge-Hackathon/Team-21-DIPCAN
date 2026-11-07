# LOCATE — finding a puck without GPS (designed Sat 16:30, not built)

The chain gets a rescuer to the neighborhood (dead-reckoned offsets from puck 1). This feature
closes the last few hundred meters with one interrogator and no extra RF hardware.

## Behavior

1. Interrogator sends a **signed `LOCATE`** addressed to one puck (new `target` byte in the
   challenge; 0 = all). Same HMAC + monotonic counter as every other command, so the enemy
   can't trigger it.
2. That puck **beacons every 500 ms for 60 s**: a 22-byte signed `Beacon {type, chainId,
   puckId, seq, txDbm}`.
3. Each beacon is sent at the next step of **20 → 10 → 2 → −4 dBm** and labeled with its
   power. The lowest step the interrogator still hears is a coarse distance bucket; the RSSI
   on each step is the fine signal.
4. Each beacon also **chirps the Grove buzzer and blinks the LED** (40 ms) for the last 20 m.
5. Tamper checks keep running while beaconing; a brick stops it. Normal challenges still answer.

Interrogator side (`locate.py`, not written): send LOCATE, then print live `P<id> seq tx=<dBm>
rssi=<dBm>` lines and a one-row-per-power table of last-heard RSSI; push RSSI into the puck's
CoT marker remarks so the phone shows the number climbing.

Rescuer technique that needs no code: hold the interrogator to the chest and turn slowly;
RSSI drops when your body is between you and the puck (10–20 dB at 915 MHz). The null is a
bearing.

## Honest notes

- Power buckets are **empirical**. In free space even −4 dBm reaches a long way at LoRa
  sensitivities; the steps only mean something in clutter. Calibrate on the floor, don't quote
  meters to a judge.
- 60 s of beacons at up to 20 dBm is a deliberate emission. It is keyed, so it's the rescuer's
  choice, but it's the one time the puck is loud.
- Yagi on the interrogator (bearing from one spot) was ruled out for size. A foil reflector
  behind the spring antenna is the pocket-sized substitute (~6 dB front/back).

## Packet changes (breaks the Python mirror until `packet.py` is updated)

| Struct | Now | With LOCATE |
|---|---|---|
| `Challenge` | 23 B `{type, chainId, counter, hmac16}` | **24 B** `{type, chainId, counter, target, hmac16}` |
| `Beacon` | — | 22 B `{type, chainId, puckId, seq, txDbm, hmac16}` |
| Types | — | `PKT_LOCATE 0x05`, `PKT_BEACON 0x06` |

## To build it later

```sh
git apply docs/locate-firmware.patch      # packet.h, config.h, puck_feather.ino
```
Then: update `interrogator/packet.py` (`_CHALLENGE = "<BHIB"`, add `parse_beacon`), add a
`kind=` / `target=` to `build_challenge`, write `locate.py`, wire a Grove buzzer to pin 5
(`HAS_BUZZER 1`, already in the patch). Config in the patch: `LOCATE_DURATION_MS 60000`,
`BEACON_PERIOD_MS 500`, `BEACON_POWERS {20,10,2,-4}`, `BEACON_CHIRP_MS 40`.
