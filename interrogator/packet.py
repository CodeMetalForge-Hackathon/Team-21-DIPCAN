"""Python mirror of firmware/common/packet.h. Keep in lockstep; the static_assert there
pins Answer at 35 bytes so a drift shows up at compile time on the firmware side."""
import hashlib
import hmac
import struct
from dataclasses import dataclass

PACKET_MAX = 40
HMAC_LEN = 16

PKT_CHALLENGE = 0x01
PKT_ANSWER = 0x02
PKT_KILL = 0x03
PKT_TAMPERED = 0x04

ST_LISTENING = 0x00
ST_TAMPERED = 0x01
ST_KILLED = 0x02
ST_ANCHOR = 0x10

_CHALLENGE = struct.Struct("<BHI")           # type, chainId, counter
_ANSWER = struct.Struct("<BHBBIhHHHh")        # see packet.h Answer
assert _ANSWER.size + HMAC_LEN == 35


def _mac(key: bytes, data: bytes) -> bytes:
    return hmac.new(key, data, hashlib.sha256).digest()[:HMAC_LEN]


def build_challenge(key: bytes, chain_id: int, counter: int, kill: bool = False) -> bytes:
    body = _CHALLENGE.pack(PKT_KILL if kill else PKT_CHALLENGE, chain_id, counter)
    return body + _mac(key, body)


@dataclass
class Answer:
    chain_id: int
    puck_id: int
    status: int
    counter_echo: int
    elev_m: int
    min_since_drop: int
    steps: int
    heading_deg: int | None
    alt_delta_m: int
    rssi: float = 0.0
    snr: float = 0.0

    @property
    def tampered(self) -> bool:
        return bool(self.status & ST_TAMPERED)


def parse_answer(key: bytes, raw: bytes, rssi: float = 0.0, snr: float = 0.0) -> Answer | None:
    """Returns None if length or HMAC is wrong."""
    if len(raw) != _ANSWER.size + HMAC_LEN:
        return None
    body, mac = raw[:_ANSWER.size], raw[_ANSWER.size:]
    if not hmac.compare_digest(mac, _mac(key, body)):
        return None
    t, chain_id, puck_id, status, ctr, elev, mins, steps, hdg, dalt = _ANSWER.unpack(body)
    if t != PKT_ANSWER:
        return None
    return Answer(chain_id, puck_id, status, ctr, elev, mins, steps,
                  None if hdg == 0xFFFF else hdg, dalt, rssi, snr)
