# DIPCAN: narration script and shot plan

Graphics piece: 5:00 target. Each line is one caption and one narration cue. Scene timings are
derived from the recorded audio at build time (`bun tools/narrate.ts`), so the second column is a
target, not a contract. Sourced facts carry a footnote; everything in the walk is modeled and says so.

A `[pause N]` prefix holds N seconds of silence before a line. Rows marked `[cut]` keep their number but produce no audio or caption; remove the tag to restore a line. Insert points for the Boston footage are marked `>>> INSERT`. Three inserts of up to 90 s each keep
the assembled cut under 10:00 (300 s graphics + 270 s inserts = 570 s).

## S1. Cold open (0:00 to 0:22)

| # | Narration and caption | Picture |
|---|---|---|
| 1 | A radio tells us where an isolated person is when they key it. | Black. One dipcan, face down, lit from above. |
| 2 | DIPCAN tells us where they went while they stayed silent. | Four dipcans appear in a line across dark ground. |
| 3 | [pause 1.6] DIPCAN. Dropped, Indexed, Passive Challenge-Answer Network. Team 21. | Title card, after a held beat on the four dipcans. |

## S2. Iran, April 2026 (0:22 to 0:55)

| # | Narration and caption | Picture |
|---|---|---|
| 4 | April 3, 2026. An F-15E is hit over the Zagros Mountains in southwestern Iran.[^1] | Country relief of Iran, border drawn, camera high. |
| 5 | Both crew eject. | Two markers fall onto the relief near Dehdasht. |
| 6 | The pilot is picked up within hours.[^1] | One marker lifts out, turns green. |
| 7 | The weapons systems officer, call sign Dude 44 Bravo, is alone in the mountains for about two days.[^2] | The second marker stays. Clock label counts 48 h. |
| 8 | He is recovered on April 5. It takes 155 aircraft.[^3] | A fan of aircraft tracks converges on the marker. |
| 9 | For two days he had to choose between staying hidden and being findable. | Hold on the marker. Caption alone. |

## S3. The gap (0:55 to 1:30)

| # | Narration and caption | Picture |
|---|---|---|
| 10 | This is the terrain. Kohgiluyeh and Boyer-Ahmad, near Dehdasht.[^2] | Push in to the 3D Zagros heightmap. Place labels: Dehdasht, Dena. |
| 11 | Limestone ridges from 2,000 to over 3,500 meters, valleys with roads and camps. | Slow orbit. Elevation scale bar. |
| 12 | His survival radio sends an encrypted burst over satellite. | A hide site on a north face. A pulse leaves it. |
| 13 | Every burst can be direction-found. It needs a view of the sky. It says where he is only at the moment he keys it. | The pulse spreads over the valley. Bearing lines from the valley floor converge on him. |
| 14 | So for most of two days, he did not key it. The team had nothing. | Pulse fades. Terrain goes dark and quiet. |
| 15 | DIPCAN lets him go completely dark, never leave cover, and still leave a trail only friendlies can read. | Four faint points glow along a ridge line, then dim. |

## S4. The puck (1:30 to 2:10)

| # | Narration and caption | Picture |
|---|---|---|
| 16 | A dipcan. In production, about the size of a bottle cap, about 15 grams, about 15 dollars. | Dipcan on black, scale coin beside it. Amber chip: PRODUCTION SIZE. |
| 17 | Inside: a radio, a barometer, a motion sensor, and a battery behind a pull tab. | Exploded view. Callouts land one by one. |
| 18 | The radio is LoRa at 915 megahertz. It speaks twice in its life: a whisper to the dipcan before it when it is dropped, and its answer to the team. | Radio module highlighted. |
| 19 | The barometer gives elevation to about a meter. | Barometer highlighted. Reading ticks: 2,480 m. |
| 20 | The motion sensor counts steps while carried and feels a pickup after the dipcan is dropped. | Accelerometer highlighted. |
| 21 | It lives in the survival vest with the tab in. Dormant, it draws nothing and emits nothing. Only he can start it, and only the team's signed question can make it speak. | Collapse back to a whole dipcan. LED dark. Two key icons. |

>>> INSERT A (up to 90 s): bench footage, Boston. Puck on the table, magnet tap, serial log scrolling `STATE`, the LED blink. Title card: "Live test, Boston. Activation on the bench."

## S5. Activation (2:10 to 2:40)

| # | Narration and caption | Picture |
|---|---|---|
| 22 | He pulls the tab. One blink. | Token touches the dipcan. LED blinks. State label: ACTIVATING. |
| 23 | Held next to the next dipcan he will carry, it pairs with it and buzzes once. He has sixty seconds to set it down. | Two dipcans side by side. A short pulse between them, a buzz icon. State label: PAIRED. A 60 s ring starts. |
| 25 | Set down, the sixty seconds run out and tamper protection is live. | The dipcan lands. The ring completes. State: ARMED. |
| 24 | The one he carries logs steps, heading, and barometric altitude. The radio stays off. | The carried dipcan moves along a dotted path. Counters tick. |
| 59 | In the demo build, he cuts a small wire instead of pulling a tab. The motion sensor and compass ride on the board, the same as production. | Amber chip: DEMO BUILD. |
| 26 | When that one is set down, it sends what it learned on the walk back to the dipcan before it. One short message, no louder than it has to be. Now both of them know the leg. | A short pulse from the carried dipcan back to the placed one, and an acknowledgment back. |
| 27 | Then it listens. It answers one thing only: a challenge signed with the chain key the team holds. | State: LISTENING. Ear icon. LED off. |

## S6. The chain across the Zagros (2:40 to 3:45)

Modeled walk, labeled on screen: "Route modeled for the exercise. Times and elevations are illustrative."

| # | Narration and caption | Picture |
|---|---|---|
| 28 | Here is how it plays out on this ground. The walk is modeled. The terrain is real. | Pull back to the 3D terrain. Amber chip: MODELED ROUTE. |
| 29 | 04:52. He lands on a slope of loose rock at 2,480 meters, 300 meters above a road. He drops dipcan 1 under a rock. | Dipcan 1 lands. Callout: P1, 2,480 m, anchor. |
| 30 | [cut] Dipcan 1 is the anchor. It knows nothing until dipcan 2 reports to it. | Hold. |
| 31 | He climbs northeast in the dark. 600 meters across, 130 meters up. | Path draws across the terrain. Step counter runs: 740 steps, heading 045. |
| 32 | 07:10. He drops dipcan 2 in a boulder field and goes to ground for the day. | Dipcan 2 lands. Callout: P2, 2,610 m, 740 steps, 045, +130 m. |
| 33 | Dipcan 2 whispers its leg back to dipcan 1 and goes quiet. The finder can read that leg from either end. | Short pulse 2 to 1, acknowledgment back. Both LEDs dark. |
| 34 | 15:10. An adversary search party sweeps the boulder field. Someone picks up dipcan 2. | Figures cross the boulder field. Dipcan 2 lifts. |
| 35 | It bricks. Keys gone, flash erased, radio dead. The enemy is holding a dead dipcan. | Dipcan 2 flashes amber, goes black. Callout: BRICKED 15:10. |
| 36 | 20:30. He moves after dark, 900 meters up a drainage to a shelf below the crest at 2,890 meters. Dipcan 3. | Path continues. Dipcan 3 lands. Callout: 1,100 steps, 020, +280 m. |
| 37 | 22:15. A crevice just over the crest at 2,940 meters, out of the wind and out of the valley's line of sight. Dipcan 4 at the mouth. | Dipcan 4 lands. Callout: P4, 2,940 m. |
| 65 | Dipcan 4 carries a red mark. It was the last one in his vest. A finder who sees the mark knows the trail ends here. | Red ring on dipcan 4. Callout: red mark, the last one in his vest. |
| 38 | Then he goes dark. Four dipcans across 1.7 kilometers and 460 meters of climb. | Camera pulls out. Distance labels on each leg and the whole span. |
| 39 | He never pressed a transmit key. | Wide hold. Everything dark. |

>>> INSERT B (up to 90 s): the walk, Boston. Start at 60 State St, set dipcans along the route, the serial log showing steps and heading from the board. Title card: "Live test, Boston. The walk from 60 State Street."

## S7. The finder (3:45 to 4:35)

| # | Narration and caption | Picture |
|---|---|---|
| 40 | The rescue element, a hostage rescue team, search and rescue team, helicopter, or in this case a drone, carries an interrogator: a small computer, a LoRa radio, and a phone running ATAK. | Kit on a table: Pi, bridge, phone. Callouts. |
| 41 | [cut] It can ride in a helicopter, on a drone, or in a rucksack. | Kit icon moves to a helicopter silhouette over the ridge. |
| 42 | 02:40, day two. From 15 kilometers out it sends one signed challenge. | A single pulse leaves the aircraft and washes over the ridge. |
| 43 | [pause 2.5] It is a DIPCAN: a dropped, indexed, passive challenge-answer network. The team does not know where any dipcan is. Dipcan 1 answers in its slot, dipcan 3 in its, dipcan 4 in its. Dipcan 2 is silent. | Three return pulses, 400 ms apart. Dipcan 2 stays dark. Label: DIPCAN, INDEXED REPLIES. |
| 44 | Each answer carries its number, its elevation, how long since it was dropped, the leg it walked, and the pointer to the next dipcan. | One answer expands into its fields. |
| 60 | Each dipcan points at the next one, for three reasons. | Chain of four on the terrain, arrows from each to the next. |
| 61 | Range. LoRa reaches a few kilometers here. On foot, the finder cannot hear the last dipcan from the start, but each one puts him in range of the next. | Range rings step along the chain. |
| 62 | Error. Dead reckoning drifts about ten percent of the walk. Standing on each dipcan resets it: 20 kilometers in three legs ends in a 600 meter circle instead of 2 kilometers. | Two rings at the last dipcan: 2 km amber, 600 m blue. |
| 63 | Survival. If he is taken or the last dipcan dies, the dropped ones still say where he was, when, and which way. A circle around the last fix becomes a cone along his track. | Rings fade. Callout: a cone along his track. |
| 45 | [cut] A recorded challenge replayed by the enemy gets nothing. The counter only goes up. | A second, identical pulse. No answers. Label: REPLAY REJECTED. |
| 46 | Every answer lands in ATAK, the tool the team already carries. The chain draws itself. | Map panel: P1 appears, then P3, then P4. |
| 47 | Three live markers climbing northeast. A gap with a time. The newest dipcan four hours old at 2,940 meters. | P2 marker red, "tampered 15:10". Route line with the gap. |
| 64 | Dipcan 4 answers with no pointer to a next one. A dipcan he is still carrying has not reported yet. So he is close: search every direction except the one you came from. | ATAK: a search arc around P4 open on every side but the approach. |
| 48 | The search area collapses from a 20 kilometer valley to one north face. | Map zooms from valley to the crevice face. |
| 49 | [cut] And it says the enemy was in the boulder field at 15:10 and had not gone higher. | Hold on the red marker. |
| 50 | [pause 1.8] Reporting says a classified sensor called Ghost Murmur found him once he left cover.[^4] DIPCAN tells it where to look while he stays hidden. | Map: the search box shrinks onto the north face. Label: WHERE TO LOOK. |
| 51 | 03:30. Ground force on the saddle. Recovery. The team sends one signed kill command, and every dipcan wipes itself for good. | Markers turn gray. |

>>> INSERT C (up to 90 s): the sweep, Boston. Interrogator on the walk, `sweep.py` output, ATAK filling in on the phone, a puck picked up and its marker turning red. Title card: "Live test, Boston. The sweep."

## S8. Close (4:35 to 5:10)

| # | Narration and caption | Picture |
|---|---|---|
| 52 | [pause 2.5] What the chain gave the team: which side of the ridge, how high, that he was moving at 22:15, and where the hunters were. | Four short labels appear on the wide terrain. |
| 56 | Everything fielded finds the man by making him transmit, or by sensing him from far away. | Wide terrain, labels fade. |
| 57 | DIPCAN holds no GPS, needs no sky, and costs about 15 dollars. He drops it and forgets it. | Callout on P1: no GPS, no sky, about 15 dollars. |
| 58 | If he is captured, the chain still answers with the last place he was free. | Callout on P4: last point he was free. |
| 53 | A beacon shouts at the sky. A dipcan whispers once to the one before it, then speaks only when a friendly with the key asks. | Dipcan, face down, lit from above, as in the open. |
| 54 | A radio tells us where an isolated person is when they key it. DIPCAN tells us where they went while they stayed silent. | Title card. |
| 55 | DIPCAN. Team 21. | Title card. Black. |

## Sources

[^1]: Military Times, "The rescue mission that brought 2 F-15E Strike Eagle crew members home," April 8, 2026. https://www.militarytimes.com/news/your-military/2026/04/08/the-rescue-mission-that-brought-2-f-15e-strike-eagle-crew-members-home/
[^2]: Task & Purpose, "Air Force colonel recounts 'Dude 44' rescue that put almost 100 troops inside Iran." https://taskandpurpose.com/news/f-15e-iran-rescue-interview/ ; The War Zone, "Everything we now know about the operation to rescue the F-15E WSO." https://www.twz.com/news-features/everything-we-now-know-about-the-operation-to-rescue-the-f-15e-wso
[^3]: The Aviationist, "New details emerge about rescue mission deep inside Iran," April 7, 2026. https://theaviationist.com/2026/04/07/new-details-about-rescue-mission-into-iran/

[^4]: Ghost Murmur is named across press reports as the CIA sensor that located the WSO (e.g., TechSpot, https://www.techspot.com/news/111993-cia-deployed-secret-ghost-murmur-ai-track-down.html ; AOL/NY Post, https://www.aol.com/articles/top-secret-cia-tool-ghost-121811829.html). The CIA acknowledged a role in general terms only; the heartbeat-sensing details are unconfirmed and disputed by scientists (Calcalist, https://www.calcalistech.com/ctechnews/article/bkvkger3wx). The script therefore says "reporting says."

Puck specifications and the modeled walk: `docs/Team_21_COA_3.pdf` and `CLAUDE.md` in this repository. The 48 hour figure is reported as 40 to 50 hours across sources; the script says "about two days."
