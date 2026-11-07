#!/usr/bin/env python3
"""Interrogator: send signed challenges over the serial LoRa bridge, collect answers,
build the chain, push CoT to ATAK.

    python3 sweep.py --port /dev/ttyACM0 --key <32 hex chars> [--chain 1] [--once] [--kill]

Bridge protocol: we write "TX <hex>\n"; it emits "RX <hex> <rssi> <snr>\n" per packet.
Counter is persisted in .counter so restarts never replay a value pucks have seen.
"""
import argparse
import os
import sys
import time

import serial

import chain as chainmod
import cot
import packet

COUNTER_FILE = os.path.join(os.path.dirname(__file__), ".counter")
SLOT_S = 0.4          # must match SLOT_MS in firmware config.h
MAX_PUCKS = 8


def next_counter() -> int:
    n = 0
    if os.path.exists(COUNTER_FILE):
        n = int(open(COUNTER_FILE).read().strip() or 0)
    n += 1
    open(COUNTER_FILE, "w").write(str(n))
    return n


def sweep_once(ser: serial.Serial, key: bytes, chain_id: int, kill: bool = False) -> list[packet.Answer]:
    ctr = next_counter()
    ser.write(b"TX " + packet.build_challenge(key, chain_id, ctr, kill).hex().encode() + b"\n")
    print(f"[sweep] {'KILL' if kill else 'challenge'} ctr={ctr}")
    answers = []
    deadline = time.time() + SLOT_S * (MAX_PUCKS + 1)
    while time.time() < deadline:
        line = ser.readline().decode(errors="ignore").strip()
        if not line.startswith("RX "):
            continue
        parts = line.split()
        raw = bytes.fromhex(parts[1])
        rssi = float(parts[2]) if len(parts) > 2 else 0.0
        snr = float(parts[3]) if len(parts) > 3 else 0.0
        a = packet.parse_answer(key, raw, rssi, snr)
        if a is None:
            print(f"[sweep] bad packet {parts[1][:16]}…")
            continue
        if a.counter_echo != ctr:
            print(f"[sweep] stale echo from puck {a.puck_id}")
            continue
        print(f"[sweep] puck {a.puck_id} elev={a.elev_m}m steps={a.steps} hdg={a.heading_deg} "
              f"age={a.min_since_drop}min rssi={a.rssi}")
        answers.append(a)
    return answers


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", required=True)
    ap.add_argument("--key", required=True, help="32 hex chars (16 bytes)")
    ap.add_argument("--chain", type=int, default=1)
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--kill", action="store_true")
    ap.add_argument("--anchor", default="42.3601,-71.0589", help="lat,lon of puck 1")
    ap.add_argument("--period", type=float, default=5.0, help="seconds between sweeps")
    args = ap.parse_args()

    key = bytes.fromhex(args.key)
    if len(key) != packet.HMAC_LEN:
        sys.exit("key must be 16 bytes")
    lat, lon = (float(v) for v in args.anchor.split(","))

    ser = serial.Serial(args.port, 115200, timeout=0.2)
    time.sleep(1.0)
    state = chainmod.ChainState()

    while True:
        answers = sweep_once(ser, key, args.chain, kill=args.kill)
        state.update(answers, killed=args.kill)
        nodes = chainmod.build(state, anchor=(lat, lon))
        cot.push(nodes, chain_id=args.chain)
        if args.once or args.kill:
            break
        time.sleep(args.period)


if __name__ == "__main__":
    main()
