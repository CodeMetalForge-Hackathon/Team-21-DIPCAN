# Demo script (3 minutes) and table checklist

## Setup (before the judge arrives)
- Pi hotspot up, phone joined, ATAK open on the map of the building, scrcpy mirroring to the monitor.
- Bridge XIAO on the Pi, `sweep.py` ready but **not** running.
- Four pucks charged, flashed with `DEMO=1`, Hall magnets attached (dormant).
- Serial monitor on one puck tailing `STATE`/`EVT` lines, visible on a laptop.
- Backup video queued on a second device.

## Run
1. **IP** (teammate 1): pull magnets from P1 and P2 → "STATE ACTIVATING" → they pair.
   Set P1 on the table (the chute cache). Walk the hallway carrying P2.
2. Drop P2 at the hallway end. Activate P3+P4 with it. Up the stairwell, drop P3 on the landing.
   Drop P4 at the top. Sit out of sight. **Nothing on any screen.**
3. **CSAR** (teammate 2): walk the floor with the Pi, start `sweep.py`. Pucks answer in slots;
   markers appear one by one in ATAK with elevation and the route arrow. Point at
   "dropped N min ago" on P4.
4. **Judge** picks up P3. Serial shows `EVT brick`. Next sweep: P3 marker turns red "TAMPERED",
   route shows the gap. Say: "that's an enemy at a known point and time."
5. CSAR runs `sweep.py --kill`. Remaining markers go gray. Hand the judge the phone.

## Fallbacks
- Sleep/listen not working → pucks always-on, say "duty-cycle RX in production, here's the math."
- No barometer → elevation from stairwell floor number hardcoded per puck, say so plainly.
- Radio dead → `python3 cot.py` sends fake markers; narrate the demo over the video.

## Four questions the judge will ask (from the mission brief)
1. Can you show it working? → the run above.
2. What existed before, what did you build here? → COA doc existed; all code this weekend; git log.
3. What worked, what didn't, what's unfinished? → be specific; list the cut items.
4. What would it take to run this outside your laptop? → LiPo + supercap, potting, ST25DV NFC,
   ECDH pairing, SF11 for range, duty-cycle RX with long preamble, FreeTAKServer for multi-client.
