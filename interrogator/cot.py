"""Cursor-on-Target output: one marker per puck plus a route linking them, sent to ATAK over
the default SA multicast group. The phone just has to be on the same Wi-Fi (the Pi hotspot).

Bench test:  python3 cot.py   -> sends three fake markers; they should appear in ATAK.
"""
import socket
import time
import uuid
from datetime import datetime, timedelta, timezone

import chain as chainmod

MCAST_GROUP = "239.2.3.1"
MCAST_PORT = 6969
STALE_MIN = 30

# CoT types: friendly ground = a-f-G; hostile ground = a-h-G; unknown = a-u-G
_TYPE = {"answered": "a-f-G-U-C", "unarmed": "a-f-G-U-C", "pointer-only": "a-u-G", "silent": "a-u-G", "tampered": "a-h-G", "killed": "a-n-G"}
_COLOR = {"answered": "-16711936", "unarmed": "-256", "pointer-only": "-7829368", "silent": "-7829368", "tampered": "-65536", "killed": "-7829368"}


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def marker_xml(n: chainmod.Node, chain_id: int) -> str:
    now = datetime.now(timezone.utc)
    uid = f"breadcrumb-{chain_id}-{n.puck_id}"
    seen = datetime.fromtimestamp(n.last_seen, timezone.utc).strftime("%H:%M") if n.last_seen else "--:--"
    remarks = (f"Puck {n.puck_id} {n.status.upper()} | elev {n.elev_m} m | "
               f"dropped {n.min_since_drop} min ago | {n.steps} steps hdg {n.heading_deg} | seen {seen}")
    return (f'<event version="2.0" uid="{uid}" type="{_TYPE[n.status]}" how="m-g" '
            f'time="{_iso(now)}" start="{_iso(now)}" stale="{_iso(now + timedelta(minutes=STALE_MIN))}">'
            f'<point lat="{n.lat:.6f}" lon="{n.lon:.6f}" hae="{n.elev_m}" ce="150" le="20"/>'
            f'<detail><contact callsign="P{n.puck_id}"/><color argb="{_COLOR[n.status]}"/>'
            f'<remarks>{remarks}</remarks></detail></event>')


def route_xml(nodes: list[chainmod.Node], chain_id: int) -> str:
    now = datetime.now(timezone.utc)
    uid = f"breadcrumb-route-{chain_id}"
    links = "".join(
        f'<link uid="{uuid.uuid4()}" callsign="P{n.puck_id}" type="b-m-p-w" '
        f'point="{n.lat:.6f},{n.lon:.6f}" remarks="elev {n.elev_m} m"/>' for n in nodes)
    first = nodes[0]
    return (f'<event version="2.0" uid="{uid}" type="b-m-r" how="m-g" '
            f'time="{_iso(now)}" start="{_iso(now)}" stale="{_iso(now + timedelta(minutes=STALE_MIN))}">'
            f'<point lat="{first.lat:.6f}" lon="{first.lon:.6f}" hae="{first.elev_m}" ce="150" le="20"/>'
            f'<detail><contact callsign="Breadcrumb chain {chain_id}"/>{links}'
            f'<strokeColor value="-256"/><strokeWeight value="3.0"/>'
            f'<__routeinfo><__navcues/></__routeinfo></detail></event>')


_warned = False


def push(nodes: list[chainmod.Node], chain_id: int = 1, target: tuple[str, int] | None = None) -> bool:
    """Send markers + route. `target` overrides multicast with a unicast (ip, port), e.g. the
    phone's IP on port 4242. Returns False (and warns once) if the network isn't there; never raises."""
    global _warned
    if not nodes:
        return True
    dest = target or (MCAST_GROUP, MCAST_PORT)
    msgs = [marker_xml(n, chain_id) for n in nodes]
    if len(nodes) > 1:
        msgs.append(route_xml(nodes, chain_id))
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 1)
        for m in msgs:
            sock.sendto(m.encode(), dest)
        sock.close()
        return True
    except OSError as e:
        if not _warned:
            print(f"[cot] not sent ({e}); is this machine on the hotspot? markers:")
            _warned = True
        for n in nodes:
            print(f"[cot]   P{n.puck_id} {n.status} elev={n.elev_m}m ({n.lat:.5f},{n.lon:.5f})")
        return False


if __name__ == "__main__":
    t = time.time()
    fake = [chainmod.Node(1, 42.3601, -71.0589, 10, "answered", 30, 0, None, t),
            chainmod.Node(2, 42.3606, -71.0584, 14, "tampered", 20, 740, 45, t),
            chainmod.Node(3, 42.3611, -71.0580, 19, "answered", 5, 300, 20, t)]
    push(fake)
    print("sent 3 markers + route to", MCAST_GROUP, MCAST_PORT)
