"""Chain builder: turns a bag of answers (across sweeps) into ordered nodes with positions.

Puck 1 is anchored to a known lat/lon. Each later puck reports the walk FROM the previous
puck TO itself (steps, heading, altitude delta), so position N = position N-1 + vector N.
Missing IDs become 'silent' nodes; a puck that answered before but is now silent keeps its
last position and is flagged. Tampered status is sticky.
"""
import math
import time
from dataclasses import dataclass, field

import packet

STEP_M = 0.75   # average stride, metres. Tune on the stairwell.


@dataclass
class Node:
    puck_id: int
    lat: float
    lon: float
    elev_m: int
    status: str            # answered | silent | tampered | killed
    min_since_drop: int
    steps: int
    heading_deg: int | None
    last_seen: float


@dataclass
class ChainState:
    seen: dict[int, packet.Answer] = field(default_factory=dict)
    seen_at: dict[int, float] = field(default_factory=dict)
    tampered: set[int] = field(default_factory=set)
    killed: bool = False

    def update(self, answers: list[packet.Answer], killed: bool = False) -> None:
        now = time.time()
        for a in answers:
            self.seen[a.puck_id] = a
            self.seen_at[a.puck_id] = now
            if a.tampered:
                self.tampered.add(a.puck_id)
        if killed:
            self.killed = True


def _offset(lat: float, lon: float, dist_m: float, bearing_deg: float) -> tuple[float, float]:
    dlat = dist_m * math.cos(math.radians(bearing_deg)) / 111_320.0
    dlon = dist_m * math.sin(math.radians(bearing_deg)) / (111_320.0 * math.cos(math.radians(lat)))
    return lat + dlat, lon + dlon


def build(state: ChainState, anchor: tuple[float, float], stale_s: float = 30.0) -> list[Node]:
    if not state.seen:
        return []
    now = time.time()
    max_id = max(state.seen)
    nodes: list[Node] = []
    lat, lon = anchor
    last_heading = 0.0
    for pid in range(1, max_id + 1):
        a = state.seen.get(pid)
        if a is None:
            # never heard: place it on the line between neighbours' best guess (half a step on)
            lat, lon = _offset(lat, lon, 50.0, last_heading)
            nodes.append(Node(pid, lat, lon, 0, "silent", 0, 0, None, 0.0))
            continue
        if pid > 1:
            hdg = a.heading_deg if a.heading_deg is not None else last_heading
            lat, lon = _offset(lat, lon, a.steps * STEP_M, hdg)
            last_heading = hdg
        if state.killed:
            status = "killed"
        elif pid in state.tampered:
            status = "tampered"
        elif now - state.seen_at[pid] > stale_s:
            status = "silent"
        else:
            status = "answered"
        nodes.append(Node(pid, lat, lon, a.elev_m, status, a.min_since_drop,
                          a.steps, a.heading_deg, state.seen_at[pid]))
    return nodes


if __name__ == "__main__":
    # Bench test: four fake replies with #3 missing should draw three points and a gap.
    st = ChainState()
    fake = [packet.Answer(1, 1, 0x10, 1, 2480, 300, 0, None, 0),
            packet.Answer(1, 2, 0, 1, 2610, 240, 740, 45, 130),
            packet.Answer(1, 4, 0, 1, 2940, 60, 300, 20, 50)]
    st.update(fake)
    for n in build(st, (30.6, 51.4)):
        print(n)
