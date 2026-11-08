# Splice plan: DIPCAN graphics plus the Boston live test

Graphics piece: `out/dipcan-graphics.mp4`, 7:18.95 (438.9 s, Sean's own narration). Sean lifted the ten-minute cap on 2026-11-08 ("video can exceed 10 minutes total if necessary"), so each insert runs as long as the footage earns; a 60 to 90 s clip per insert keeps the whole under about 11 minutes. Cut the insert in over the title card (the card runs 2.6 s and can be trimmed to 1.5 s).

| Insert | Card | Card starts (graphics timecode) | Card ends | Follows line | Footage to shoot |
|---|---|---|---|---|---|
| A | Live test, Boston. Activation on the bench. | 2:05.25 | 2:07.85 | 21 | Dipcan on the table, the wire cut, serial log with `STATE` lines, LED blink, `STATUS` output. |
| B | Live test, Boston. The walk from 60 State Street. | 4:13.48 | 4:16.08 | 39 | Start at the 60 State Street door, walk the planned route, set dipcans, the serial log showing steps and heading counted on the board, each drop on camera. |
| C | Live test, Boston. The sweep. | 6:27.54 | 6:30.14 | 51 | Interrogator on the walk, `sweep.py` output, ATAK filling in on the phone, one dipcan picked up and its marker turning red, then the kill. |

## Assembly

1. Export the three Boston clips at 1920x1080, 30 fps, with their own audio.
2. Place each clip right after its card's first second (the card can stay under the clip's first frames as a transition).
3. Keep the graphics piece's narration track as is; the inserts carry location sound.
4. Check the final duration with `ffprobe -show_entries format=duration out/final.mp4`.
