"""Python mirror of firmware/common/packet.h. Keep in lockstep; the static_asserts there pin
Challenge at 23 and Answer at 42 bytes so a drift shows up at compile time on the firmware side."""
import hashlib
import hmac
import struct
from dataclasses import dataclass

PACKET_MAX = 48
HMAC_LEN = 16
ID_NONE = 0xFF

PKT_CHALLENGE = 0x01
PKT_ANSWER = 0x02
PKT_KILL = 0x03
PKT_TAMPERED = 0x04
PKT_DROP_REPORT = 0x07
PKT_DROP_ACK = 0x08
PKT_PAIR_REQ = 0x10
PKT_PAIR_ACK = 0x11

ST_LISTENING = 0x00
ST_TAMPERED = 0x01
ST_KILLED = 0x02
ST_ANCHOR = 0x10
ST_UNARMED = 0x20

_CHALLENGE = struct.Struct("<BHI")                 # type, chainId, counter
_ANSWER = struct.Struct("<BHBBIhHHHhBHHh")          # see packet.h Answer
assert _CHALLENGE.size + HMAC_LEN == 23
assert _ANSWER.size + HMAC_LEN == 42


def _mac(key: bytes, data: bytes) -> bytes:
    return hmac.new(key, data, hashlib.sha256).digest()[:HMAC_LEN]


def build_challenge(key: bytes, chain_id: int, counter: int, kill: bool = False) -> bytes:
    body = _CHALLENGE.pack(PKT_KILL if kill else PKT_CHALLENGE, chain_id, counter)
    return body + _mac(key, body)


@dataclass
class Answer:
    chain_id: int
    puck_id: int                 # 0 = anchor
    status: int
    counter_echo: int
    elev_m: int
    min_since_drop: int
    steps: int                   # own leg: from the previous puck to this one
    heading_deg: int | None
    alt_delta_m: int
    next_id: int | None = None   # successor's id once it reported back
    next_steps: int = 0          # successor's leg: from this puck to the successor
    next_heading: int | None = None
    next_alt_delta: int = 0
    rssi: float = 0.0
    snr: float = 0.0

    @property
    def tampered(self) -> bool:
        return bool(self.status & ST_TAMPERED)

    @property
    def unarmed(self) -> bool:
        return bool(self.status & ST_UNARMED)


def parse_answer(key: bytes, raw: bytes, rssi: float = 0.0, snr: float = 0.0) -> Answer | None:
    """Returns None if length or HMAC is wrong."""
    if len(raw) != _ANSWER.size + HMAC_LEN:
        return None
    body, mac = raw[:_ANSWER.size], raw[_ANSWER.size:]
    if not hmac.compare_digest(mac, _mac(key, body)):
        return None
    (t, chain_id, puck_id, status, ctr, elev, mins, steps, hdg, dalt,
     nid, nsteps, nhdg, ndalt) = _ANSWER.unpack(body)
    if t != PKT_ANSWER:
        return None
    return Answer(chain_id, puck_id, status, ctr, elev, mins, steps,
                  None if hdg == 0xFFFF else hdg, dalt,
                  None if nid == ID_NONE else nid, nsteps,
                  None if nhdg == 0xFFFF else nhdg, ndalt, rssi, snr)
