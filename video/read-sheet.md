# DIPCAN narration read sheet

Record one file per line, named by the number in the first column, into `video/audio/human/` (for example `29.wav`, `29.m4a`). Or record one continuous take, leave at least two seconds of silence between lines, and run `bun tools/split-take.ts <take.m4a>`.

Delivery: flat, unhurried, a half beat after the number. Say the clock as military time ("zero four fifty-two", "fifteen ten", "twenty-two fifteen"). Say elevations in full ("two thousand nine hundred forty meters"). Pronunciations: Koh-gee-loo-yeh (yeh rhymes with say), Bo-yer Ah-mad, Deh-dasht, Zag-ross, "A-tack" for ATAK, "Dude four four Bravo". Leave a clear pause before "Team 21".

61 lines.

| # | Line |
|---|------|
| | **Cold open** |
| 1 | A radio tells us where an isolated person is when they key it. |
| 2 | DIPCAN tells us where they went while they stayed silent. |
| 3 | DIPCAN. Dropped, Indexed, Passive Challenge-Answer Network. Team 21. |
| | **Iran, April 2026** |
| 4 | April 3, 2026. An F-15E is hit over the Zagros Mountains in southwestern Iran. |
| 5 | Both crew eject. |
| 6 | The pilot is picked up within hours. |
| 7 | The weapons systems officer, call sign Dude 44 Bravo, is alone in the mountains for about two days. |
| 8 | He is recovered on April 5. It takes 155 aircraft. |
| 9 | For two days he had to choose between staying hidden and being findable. |
| | **The gap** |
| 10 | This is the terrain. Kohgiluyeh and Boyer-Ahmad, near Dehdasht. |
| 11 | Limestone ridges from 2,000 to over 3,500 meters, valleys with roads and camps. |
| 12 | His survival radio sends an encrypted burst over satellite. |
| 13 | Every burst can be direction-found. It needs a view of the sky. It says where he is only at the moment he keys it. |
| 14 | So for most of two days, he did not key it. The team had nothing. |
| 15 | DIPCAN lets him go completely dark, never leave cover, and still leave a trail only friendlies can read. |
| | **The puck** |
| 16 | A dipcan. In production, about the size of a bottle cap, about 15 grams, about 15 dollars. |
| 17 | Inside: a radio, a barometer, a motion sensor, and a battery behind a pull tab. |
| 18 | The radio is LoRa at 915 megahertz. It speaks twice in its life: a whisper to the dipcan before it when it is dropped, and its answer to the team. |
| 19 | The barometer gives elevation to about a meter. |
| 20 | The motion sensor counts steps while carried and feels a pickup after the dipcan is dropped. |
| 21 | It lives in the survival vest with the tab in. Dormant, it draws nothing and emits nothing. Only he can start it, and only the team's signed question can make it speak. |
| | **Activation** |
| 22 | He pulls the tab. One blink. |
| 23 | Held next to the next dipcan he will carry, it pairs with it and buzzes once. He has sixty seconds to set it down. |
| 25 | Set down, the sixty seconds run out and tamper protection is live. |
| 24 | The one he carries logs steps, heading, and barometric altitude. The radio stays off. |
| 59 | In the demo build, he cuts a small wire instead of pulling a tab. The motion sensor and compass ride on the board, the same as production. |
| 26 | When that one is set down, it sends what it learned on the walk back to the dipcan before it. One short message, no louder than it has to be. Now both of them know the leg. |
| 27 | Then it listens. It answers one thing only: a challenge signed with the chain key the team holds. |
| | **The chain across the Zagros** |
| 28 | Here is how it plays out on this ground. The walk is modeled. The terrain is real. |
| 29 | 04:52. He lands on a slope of loose rock at 2,480 meters, 300 meters above a road. He drops dipcan 1 under a rock. |
| 31 | He climbs northeast in the dark. 600 meters across, 130 meters up. |
| 32 | 07:10. He drops dipcan 2 in a boulder field and goes to ground for the day. |
| 33 | Dipcan 2 whispers its leg back to dipcan 1 and goes quiet. The finder can read that leg from either end. |
| 34 | 15:10. An adversary search party sweeps the boulder field. Someone picks up dipcan 2. |
| 35 | It bricks. Keys gone, flash erased, radio dead. The enemy is holding a dead dipcan. |
| 36 | 20:30. He moves after dark, 900 meters up a drainage to a shelf below the crest at 2,890 meters. Dipcan 3. |
| 37 | 22:15. A crevice just over the crest at 2,940 meters, out of the wind and out of the valley's line of sight. Dipcan 4 at the mouth. |
| 65 | Dipcan 4 carries a red mark. It was the last one in his vest. A finder who sees the mark knows the trail ends here. |
| 38 | Then he goes dark. Four dipcans across 1.7 kilometers and 460 meters of climb. |
| 39 | He never pressed a transmit key. |
| | **The finder** |
| 40 | The rescue element, a hostage rescue team, search and rescue team, helicopter, or in this case a drone, carries an interrogator: a small computer, a LoRa radio, and a phone running ATAK. |
| 42 | 02:40, day two. From 15 kilometers out it sends one signed challenge. |
| 43 | It is a DIPCAN: a dropped, indexed, passive challenge-answer network. The team does not know where any dipcan is. Dipcan 1 answers in its slot, dipcan 3 in its, dipcan 4 in its. Dipcan 2 is silent. |
| 44 | Each answer carries its number, its elevation, how long since it was dropped, the leg it walked, and the pointer to the next dipcan. |
| 60 | Each dipcan points at the next one, for three reasons. |
| 61 | Range. LoRa reaches a few kilometers here. On foot, the finder cannot hear the last dipcan from the start, but each one puts him in range of the next. |
| 62 | Error. Dead reckoning drifts about ten percent of the walk. Standing on each dipcan resets it: 20 kilometers in three legs ends in a 600 meter circle instead of 2 kilometers. |
| 63 | Survival. If he is taken or the last dipcan dies, the dropped ones still say where he was, when, and which way. A circle around the last fix becomes a cone along his track. |
| 46 | Every answer lands in ATAK, the tool the team already carries. The chain draws itself. |
| 47 | Three live markers climbing northeast. A gap with a time. The newest dipcan four hours old at 2,940 meters. |
| 64 | Dipcan 4 answers with no pointer to a next one. A dipcan he is still carrying has not reported yet. So he is close: search every direction except the one you came from. |
| 48 | The search area collapses from a 20 kilometer valley to one north face. |
| 50 | Reporting says a classified sensor called Ghost Murmur found him once he left cover. DIPCAN tells it where to look while he stays hidden. |
| 51 | 03:30. Ground force on the saddle. Recovery. The team sends one signed kill command, and every dipcan wipes itself for good. |
| | **Close** |
| 52 | What the chain gave the team: which side of the ridge, how high, that he was moving at 22:15, and where the hunters were. |
| 56 | Everything fielded finds the man by making him transmit, or by sensing him from far away. |
| 57 | DIPCAN holds no GPS, needs no sky, and costs about 15 dollars. He drops it and forgets it. |
| 58 | If he is captured, the chain still answers with the last place he was free. |
| 53 | A beacon shouts at the sky. A dipcan whispers once to the one before it, then speaks only when a friendly with the key asks. |
| 54 | A radio tells us where an isolated person is when they key it. DIPCAN tells us where they went while they stayed silent. |
| 55 | DIPCAN. Team 21. |
