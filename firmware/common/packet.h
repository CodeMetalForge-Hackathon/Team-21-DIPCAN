// packet.h — wire format shared by puck, bridge, and interrogator.
// This is the contract between Lane A and Lane B. Change it only with both present.
// Python side mirrors these layouts in interrogator/packet.py (struct module, little-endian).
#pragma once
#include <stdint.h>

#define PACKET_MAX 48
#define HMAC_LEN   16   // HMAC-SHA256 truncated to 16 bytes
#define KEY_LEN    16   // chain key bytes
#define ID_NONE    0xFF // "no puck" for prevId / nextId

// The 32u4 interrogator bridge runs RadioHead (RadioLib doesn't fit in 28 KB). RadioHead
// prepends a 4-byte header {to, from, id, flags} to every LoRa frame and strips it on receive.
// RadioLib pucks therefore add/strip these 4 bytes themselves so the wire format matches.
// The Pi never sees them. Air frame = RH_HDR_LEN + sizeof(struct).
#define RH_HDR_LEN   4
#define RH_BROADCAST 0xFF
#define LORA_SYNC    0x12   // RadioHead's default; RadioLib pucks set the same

enum PacketType : uint8_t {
  PKT_CHALLENGE   = 0x01,  // interrogator -> pucks
  PKT_ANSWER      = 0x02,  // puck -> interrogator
  PKT_KILL        = 0x03,  // interrogator -> pucks (signed)
  PKT_TAMPERED    = 0x04,  // optional unsigned last gasp before brick
  // 0x05 LOCATE / 0x06 BEACON reserved (docs/locate-design.md)
  PKT_DROP_REPORT = 0x07,  // puck N+1 -> puck N at the drop: "my leg from you was ..."
  PKT_DROP_ACK    = 0x08,  // puck N -> puck N+1
  PKT_PAIR_REQ    = 0x10,  // new puck -> whoever is next to it, minimum power, during ASK
  PKT_PAIR_ACK    = 0x11,  // neighbour -> new puck: "I am ID x" (new puck becomes x+1)
};

enum PuckStatus : uint8_t {
  ST_LISTENING = 0x00,
  ST_TAMPERED  = 0x01,
  ST_KILLED    = 0x02,
  ST_ANCHOR    = 0x10,  // bitflag: this puck is node 0
  ST_UNARMED   = 0x20,  // bitflag: placed but the 60 s arm timer hasn't expired (or still carried)
};

#pragma pack(push, 1)

// Interrogator -> pucks. Counter is monotonic; pucks ignore counter <= last seen (replay guard).
struct Challenge {
  uint8_t  type;        // PKT_CHALLENGE or PKT_KILL
  uint16_t chainId;
  uint32_t counter;
  uint8_t  hmac[HMAC_LEN];  // HMAC(key, type|chainId|counter)
};

// Puck -> interrogator. Sent at slot (puckId * SLOT_MS) after a valid challenge.
// Own leg = the walk FROM the previous puck TO this one. next* = the successor's leg as it
// reported it back at its drop (ID_NONE / zeros until that happens).
struct Answer {
  uint8_t  type;          // PKT_ANSWER
  uint16_t chainId;
  uint8_t  puckId;        // 0 = first node (anchor), then 1, 2, ...
  uint8_t  status;        // PuckStatus bits
  uint32_t counterEcho;   // challenge counter this answers
  int16_t  elevM;         // barometric altitude, m (0 if no baro)
  uint16_t minSinceDrop;  // minutes since this puck was dropped (successor paired / stillness)
  uint16_t steps;         // own leg: steps counted while carried from the previous puck
  uint16_t headingDeg;    // own leg: dominant heading 0-359; 0xFFFF if unknown
  int16_t  altDeltaM;     // own leg: altitude change from the previous puck, m
  uint8_t  nextId;        // successor's id, or ID_NONE
  uint16_t nextSteps;     // successor's leg (from this puck to the successor)
  uint16_t nextHeading;
  int16_t  nextAltDelta;
  uint8_t  hmac[HMAC_LEN];  // HMAC(key, all fields above)
};

// Pairing, hand to hand at minimum power. REQ: fromId = ID_NONE. ACK: fromId = responder's id.
struct Pair {
  uint8_t  type;        // PKT_PAIR_REQ / PKT_PAIR_ACK
  uint16_t chainId;
  uint8_t  fromId;
  uint8_t  hmac[HMAC_LEN];
};

// Backward drop report: puck N+1 tells puck N its leg. Power-stepped until acked.
struct DropReport {
  uint8_t  type;        // PKT_DROP_REPORT
  uint16_t chainId;
  uint8_t  fromId;      // N+1
  uint8_t  toId;        // N
  uint16_t steps;
  uint16_t headingDeg;
  int16_t  altDeltaM;
  uint8_t  hmac[HMAC_LEN];
};

struct DropAck {
  uint8_t  type;        // PKT_DROP_ACK
  uint16_t chainId;
  uint8_t  fromId;      // N
  uint8_t  toId;        // N+1
  uint8_t  hmac[HMAC_LEN];
};

#pragma pack(pop)

static_assert(sizeof(Challenge)  <= PACKET_MAX, "Challenge exceeds packet budget");
static_assert(sizeof(Answer)     <= PACKET_MAX, "Answer exceeds packet budget");
static_assert(sizeof(Pair)       <= PACKET_MAX, "Pair exceeds packet budget");
static_assert(sizeof(DropReport) <= PACKET_MAX, "DropReport exceeds packet budget");
static_assert(sizeof(DropAck)    <= PACKET_MAX, "DropAck exceeds packet budget");
static_assert(sizeof(Challenge)  == 23, "Challenge layout changed; update interrogator/packet.py");
static_assert(sizeof(Answer)     == 42, "Answer layout changed; update interrogator/packet.py");
static_assert(sizeof(Pair)       == 20, "Pair layout changed");
static_assert(sizeof(DropReport) == 27, "DropReport layout changed");
static_assert(sizeof(DropAck)    == 21, "DropAck layout changed");
