"""Chain builder: turns a bag of answers (across sweeps) into ordered nodes with positions.

Node 0 is anchored to a known lat/lon. Every leg (from puck N to puck N+1) is known at BOTH ends:
puck N+1 reports it as its own leg, and puck N holds the same numbers as its "next" pointer
(the backward drop report). We take whichever end answered, so a bricked or silent puck in the
middle is still placed from its predecessor's pointer, and the chain never breaks on a gap.
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
    status: str            # answered | unarmed | silent | pointer-only | tampered | killed
    min_since_drop: int
    steps: int
    heading_deg: int | None
    last_seen: float
    leg_source: str = ""   # own | predecessor | none


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


def _leg(state: ChainState, pid: int) -> tuple[int, int | None, int, str] | None:
    """Leg from pid-1 to pid as (steps, heading, dalt, source), from either end."""
    a = state.seen.get(pid)
    if a is not None and (a.steps or a.heading_deg is not None):
        return a.steps, a.heading_deg, a.alt_delta_m, "own"
    p = state.seen.get(pid - 1)
    if p is not None and p.next_id == pid:
        return p.next_steps, p.next_heading, p.next_alt_delta, "predecessor"
    if a is not None:
        return a.steps, a.heading_deg, a.alt_delta_m, "own"
    return None


def build(state: ChainState, anchor: tuple[float, float], stale_s: float = 30.0) -> list[Node]:
    if not state.seen:
        return []
    now = time.time()
    # highest id we know of, including pucks known only through a predecessor's pointer
    max_id = max(max(state.seen), max((a.next_id for a in state.seen.values() if a.next_id is not None), default=-1))
    nodes: list[Node] = []
    lat, lon = anchor
    last_heading = 0.0
    for pid in range(0, max_id + 1):
        a = state.seen.get(pid)
        leg = _leg(state, pid) if pid > 0 else None
        src = "none"
        if pid > 0:
            if leg is not None:
                steps, hdg, _dalt, src = leg
                hdg = hdg if hdg is not None else last_heading
                lat, lon = _offset(lat, lon, steps * STEP_M, hdg)
                last_heading = hdg
            else:
                lat, lon = _offset(lat, lon, 50.0, last_heading)   # no information at all: guess ahead
        if a is None:
            status = "pointer-only" if leg is not None and src == "predecessor" else "silent"
            nodes.append(Node(pid, lat, lon, 0, status, 0, leg[0] if leg else 0, leg[1] if leg else None, 0.0, src))
            continue
        if state.killed:
            status = "killed"
        elif pid in state.tampered:
            status = "tampered"
        elif now - state.seen_at[pid] > stale_s:
            status = "silent"
        elif a.unarmed:
            status = "unarmed"
        else:
            status = "answered"
        nodes.append(Node(pid, lat, lon, a.elev_m, status, a.min_since_drop,
                          a.steps, a.heading_deg, state.seen_at[pid], src))
    return nodes


if __name__ == "__main__":
    # Bench test: nodes 0,1,3 answer; node 2 is silent but node 1 holds its pointer -> 2 is placed
    # from the predecessor; node 3's own leg (from 2) places 3.
    st = ChainState()
    fake = [packet.Answer(1, 0, 0x10, 1, 2480, 300, 0, None, 0, next_id=1, next_steps=740, next_heading=45, next_alt_delta=130),
            packet.Answer(1, 1, 0, 1, 2610, 240, 740, 45, 130, next_id=2, next_steps=1100, next_heading=20, next_alt_delta=280),
            packet.Answer(1, 3, 0, 1, 2940, 60, 300, 20, 50)]
    st.update(fake)
    for n in build(st, (30.6, 51.4)):
        print(n)
