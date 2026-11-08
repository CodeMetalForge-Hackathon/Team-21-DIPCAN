# How DIPCAN differs from what exists

DIPCAN is a dropped, indexed, passive challenge-answer network. The interrogator asks without knowing where any puck is; each puck holds a chain index and answers in the slot that index assigns; nothing speaks until asked.

Written 2026-11-07 from a search of public sources. The pasted description of "Thales and L3Harris
leave-behind beacons" and "sequential mesh gating" did not survive that search: no named product,
page, or filing matches it, and the text reads as an unsourced AI answer. Do not name those vendors
as competitors in the deck. Compare against what is real instead.

## What is real, and what each one is

| System | What it is | Where it sits relative to DIPCAN |
|---|---|---|
| CSEL (Boeing) | The worn survival radio. GPS fix, encrypted burst over satellite, two-way data, a beacon mode, a low probability of exploitation mode. | Reports where he is when it transmits. Needs sky. Every transmission is an emission. Carried by him, so capture ends it. |
| Combat ID transponders (dismounted CID, BTID, the Army's 2013 transponder RFI) | A tag on the soldier that answers an interrogator so friendlies do not shoot him. | Interrogated like DIPCAN, but worn, and its answer is identity, not a trail. |
| Unattended ground sensors | Networks of sensors that watch an area and report over a mesh. | They emit on their own schedule and watch others. DIPCAN emits only when asked and records its own carrier. |
| Marker beacon patents (US 5390581, 5442356, 5427032, 5515061) | A deployed beacon transmits a coded signal; an airborne interrogator and ground unit find it. | Closest prior art for "dropped and interrogated." One beacon, one point, no stored walk, no chain, no self-destruct, 1990s radio. |
| UWB precision finding (Apple, Kinexon) | Centimeter ranging and direction to a tag at tens of meters. | The last 100 m, not the first 20 km. DIPCAN's homing design (docs/locate-design.md) can borrow it later. |

## What is new in DIPCAN, stated so a judge can check it

1. The record is the trail, not the person. Every fielded device is on the man. DIPCAN is left behind, so capture, injury, or a dead battery on him does not erase where he went, and the chain still answers with the last point he was free.
2. Each puck stores a dead-reckoned leg: steps, heading, altitude change, and its own barometric elevation. The team gets a route with an elevation profile, not a dot. No GPS in the puck.
3. Nothing broadcasts. A dipcan speaks twice in its life: once at the drop, a report of its leg to the dipcan before it at the lowest power that gets an acknowledgment, and once in answer to a challenge signed with the chain key. A replayed challenge gets nothing because the counter only rises.
4. Pickup bricks it. Keys zeroized, flash erased, radio dead. The gap in the chain is a report: an enemy at a known point and time.
5. Two tokens, two roles. His token wakes and can kill; the team's key interrogates. An enemy holding a captured interrogator without the key gets silence.
6. Both ends of every leg know it, so a bricked puck in the middle does not break the chain. (The pasted text's one-at-a-time gating would stall on the first missing tag.)
7. A 72 hour dead-man and a signed kill mean nothing is left to find after the recovery.
8. Disposable: about the size of a bottle cap, about 15 g, about 15 dollars in volume (parts check in `bom-check.md`; 15 needs about ten thousand units). CSEL and CID gear are hundreds to thousands of dollars and are issued, not dropped.
9. A dipcan that answers with no pointer to a next one means the one he is carrying has not reported yet, so he is close: ATAK draws a search arc open on every side but the approach. The last dipcan in his vest carries a red mark, so a finder who sees it knows the trail ends there.
10. Output is a CoT route in ATAK, the tool the recovery force already carries. No new display.

## The one line

DIPCAN is a dropped, indexed, passive challenge-answer network. Everything fielded finds the man by making him transmit or by sensing him from far away. DIPCAN finds where he went without him ever transmitting, and tells the national sensors where to look.

## Sources checked

- CSEL: https://www.navair.navy.mil/product/combat-survivor-evader-locator-csel-system and https://www.globalsecurity.org/military/library/budget/fy2001/dot-e/airforce/01csel.html
- Dismounted combat ID: https://journals.spiedigitallibrary.org/conference-proceedings-of-spie/3394/0000/Three-combat-ID-systems-for-the-dismounted-soldier/10.1117/12.321040.full and https://militaryaerospace.com/trusted-computing/article/16716047/army-reaches-out-to-industry-for-transponder-technology-to-separate-friend-from-foe
- Unattended ground sensors: https://dsiac.dtic.mil/technical-inquiries/notable/unattended-ground-sensor-survey/
- Marker beacon patents: https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/5515061 and https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/5442356
- Searches for a Thales leave-behind beacon and an L3Harris dismounted CID tag returned no matching product.
