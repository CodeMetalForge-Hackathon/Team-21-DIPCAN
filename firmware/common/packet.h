// packet.h — wire format shared by puck, bridge, and interrogator.
// This is the contract between Lane A and Lane B. Change it only with both present.
// Python side mirrors these layouts in interrogator/packet.py (struct module, little-endian).
#pragma once
#include <stdint.h>

#define PACKET_MAX 40
#define HMAC_LEN   16   // HMAC-SHA256 truncated to 16 bytes
#define KEY_LEN    16   // chain key bytes

// The 32u4 interrogator bridge runs RadioHead (RadioLib doesn't fit in 28 KB). RadioHead
// prepends a 4-byte header {to, from, id, flags} to every LoRa frame and strips it on receive.
// RadioLib pucks therefore add/strip these 4 bytes themselves so the wire format matches.
// The Pi never sees them. Air frame = RH_HDR_LEN + sizeof(struct).
#define RH_HDR_LEN   4
#define RH_BROADCAST 0xFF
#define LORA_SYNC    0x12   // RadioHead's default; RadioLib pucks set the same

enum PacketType : uint8_t {
  PKT_CHALLENGE = 0x01,  // interrogator -> pucks
  PKT_ANSWER    = 0x02,  // puck -> interrogator
  PKT_KILL      = 0x03,  // interrogator -> pucks (signed)
  PKT_TAMPERED  = 0x04,  // optional unsigned last gasp before brick
  PKT_PAIR_REQ  = 0x10,  // puck -> puck, min TX power, during activation window
  PKT_PAIR_ACK  = 0x11,
};

enum PuckStatus : uint8_t {
  ST_LISTENING = 0x00,
  ST_TAMPERED  = 0x01,
  ST_KILLED    = 0x02,
  ST_ANCHOR    = 0x10,  // bitflag: this puck was the first anchor in the chain
};

#pragma pack(push, 1)

// Interrogator -> pucks. Counter is monotonic; pucks ignore counter <= last seen (replay guard).
struct Challenge {
  uint8_t  type;        // PKT_CHALLENGE or PKT_KILL
  uint16_t chainId;
  uint32_t counter;
  uint8_t  hmac[HMAC_LEN];  // HMAC(key, type|chainId|counter)
};

// Puck -> interrogator. Sent at slot (position * SLOT_MS) after a valid challenge.
// "vector" fields describe the walk FROM the previous puck TO this one.
struct Answer {
  uint8_t  type;          // PKT_ANSWER
  uint16_t chainId;
  uint8_t  puckId;        // == chain position, 1-based; 1 is the first anchor
  uint8_t  status;        // PuckStatus bits
  uint32_t counterEcho;   // challenge counter this answers
  int16_t  elevM;         // barometric altitude, m, calibrated to first anchor (0 if no baro)
  uint16_t minSinceDrop;  // minutes since settle/arm
  uint16_t steps;         // steps counted while carried from previous puck
  uint16_t headingDeg;    // dominant heading while carried, 0-359; 0xFFFF if unknown
  int16_t  altDeltaM;     // altitude change from previous puck, m
  uint8_t  hmac[HMAC_LEN];  // HMAC(key, all fields above)
};

// Puck <-> puck during activation window.
struct Pair {
  uint8_t  type;        // PKT_PAIR_REQ / PKT_PAIR_ACK
  uint16_t chainId;
  uint8_t  myPosition;  // sender's chain position
  uint8_t  hmac[HMAC_LEN];
};

#pragma pack(pop)

static_assert(sizeof(Challenge) <= PACKET_MAX, "Challenge exceeds packet budget");
static_assert(sizeof(Answer)    <= PACKET_MAX, "Answer exceeds packet budget");
static_assert(sizeof(Pair)      <= PACKET_MAX, "Pair exceeds packet budget");
static_assert(sizeof(Answer) == 35, "Answer layout changed; update interrogator/packet.py");
