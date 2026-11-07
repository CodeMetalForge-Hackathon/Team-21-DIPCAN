// Breadcrumbs puck firmware — state machine skeleton.
// Build order: LoRa link -> challenge/answer -> kill -> tamper -> dead reckoning -> sleep/listen.
// Log format: "STATE <name>" on transitions, "EVT <name> ..." for events. Demo tails these.

#include <Arduino.h>
#include <Wire.h>
#include <RadioLib.h>
#include <MMA7660.h>
#include <Preferences.h>
#include "mbedtls/md.h"
#include "packet.h"
#include "config.h"

// ---------------------------------------------------------------------------
enum State { DORMANT, ACTIVATING, HANDLING, SETTLING, ARMED, TAMPER, BRICKED };
static State state = DORMANT;
static const char* stateName[] = {"DORMANT","ACTIVATING","HANDLING","SETTLING","ARMED","TAMPER","BRICKED"};

static SX1262 radio = new Module(PIN_LORA_CS, PIN_LORA_DIO1, PIN_LORA_RST, PIN_LORA_BUSY);
static MMA7660 accel;
static Preferences nvs;

static uint8_t  chainKey[KEY_LEN];
static uint16_t chainId   = 0;
static uint8_t  position  = 0;
static uint32_t lastCounter = 0;      // replay guard
static float    bx, by, bz;           // baseline gravity vector after settle
static uint32_t tState = 0;           // millis() at last transition
static uint32_t tArmed = 0;
static uint16_t steps = 0;
static uint16_t headingDeg = 0xFFFF;
static int16_t  altDeltaM = 0;

// ---------------------------------------------------------------------------
static void setState(State s) {
  state = s; tState = millis();
  Serial.printf("STATE %s\n", stateName[s]);
}

static void hexToBytes(const char* hex, uint8_t* out, size_t n) {
  for (size_t i = 0; i < n; i++) sscanf(hex + 2*i, "%2hhx", &out[i]);
}

static void hmac16(const uint8_t* data, size_t len, uint8_t out[HMAC_LEN]) {
  uint8_t full[32];
  mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), chainKey, KEY_LEN, data, len, full);
  memcpy(out, full, HMAC_LEN);
}

static bool verifyChallenge(const Challenge& c) {
  uint8_t mac[HMAC_LEN];
  hmac16((const uint8_t*)&c, sizeof(c) - HMAC_LEN, mac);
  if (memcmp(mac, c.hmac, HMAC_LEN) != 0) return false;
  if (c.chainId != chainId) return false;
  if (c.counter <= lastCounter) { Serial.println("EVT replay_rejected"); return false; }
  lastCounter = c.counter;
  nvs.putUInt("ctr", lastCounter);
  return true;
}

// ---------------------------------------------------------------------------
static void brick(const char* why) {
  Serial.printf("EVT brick %s\n", why);
  // TODO optional: send PKT_TAMPERED last gasp if enabled
  memset(chainKey, 0, KEY_LEN);
  nvs.clear();
  radio.sleep();
  setState(BRICKED);
}

static void sendAnswer(uint32_t counter) {
  Answer a{};
  a.type = PKT_ANSWER; a.chainId = chainId; a.puckId = position;
  a.status = ST_LISTENING | (position == 1 ? ST_ANCHOR : 0);
  a.counterEcho = counter;
  a.elevM = 0;                                   // TODO baro
  a.minSinceDrop = (millis() - tArmed) / 60000;
  a.steps = steps; a.headingDeg = headingDeg; a.altDeltaM = altDeltaM;
  hmac16((const uint8_t*)&a, sizeof(a) - HMAC_LEN, a.hmac);
  delay(position * SLOT_MS);                     // slotted reply
  radio.transmit((uint8_t*)&a, sizeof(a));
  Serial.printf("EVT answered ctr=%lu\n", (unsigned long)counter);
}

// ---------------------------------------------------------------------------
static float gMag(float& x, float& y, float& z) {
  accel.getAcceleration(&x, &y, &z);
  return sqrtf(x*x + y*y + z*z);
}

static float tiltDeg() {
  float x, y, z; gMag(x, y, z);
  float dot = x*bx + y*by + z*bz;
  float n = sqrtf(x*x+y*y+z*z) * sqrtf(bx*bx+by*by+bz*bz);
  return degrees(acosf(constrain(dot / n, -1.0f, 1.0f)));
}

static bool liftedConfirmed() {
  // TODO: baro drop, ultrasonic > ULTRA_LIFT_CM, light step. Any one is enough.
  return false;
}

// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  Wire.begin();
  accel.init();
  nvs.begin("puck", false);
  hexToBytes(CHAIN_KEY_HEX, chainKey, KEY_LEN);
  chainId     = nvs.getUShort("chain", 0);
  position    = nvs.getUChar("pos", 0);
  lastCounter = nvs.getUInt("ctr", 0);
  pinMode(PIN_HALL, INPUT_PULLUP);
  pinMode(PIN_LED, OUTPUT);

  int st = radio.begin(LORA_FREQ_MHZ, LORA_BW_KHZ, LORA_SF, 7, LORA_SYNC_WORD, LORA_TX_DBM);
  Serial.printf("EVT radio_begin %d\n", st);
  setState(DORMANT);
}

void loop() {
  uint32_t now = millis();
  float x, y, z; float g = gMag(x, y, z);

  switch (state) {
    case DORMANT:
      // Hall sensor: magnet removed (or tapped) = activate. TODO: NFC/ST25DV variant.
      if (digitalRead(PIN_HALL) == HIGH) setState(ACTIVATING);
      break;

    case ACTIVATING:
      // TODO: pair over LoRa at LORA_PAIR_TX_DBM within PAIR_WINDOW_MS; assign chainId/position.
      // For bench: hardcode via nvs or serial command. Then:
      if (now - tState > PAIR_WINDOW_MS) { Serial.println("EVT pair_timeout"); setState(HANDLING); }
      break;

    case HANDLING:
      // TODO: step counting, heading histogram, baro logging while carried.
      if (fabsf(g - 1.0f) < STILL_G) {
        if (now - tState > SETTLE_MS) { bx = x; by = y; bz = z; tArmed = now; setState(ARMED); }
      } else {
        tState = now;   // still moving, restart the stillness timer
      }
      break;

    case ARMED: {
      bool moving = fabsf(g - 1.0f) > MOTION_G || tiltDeg() > TILT_DEG;
      static uint32_t tSusp = 0;
      if (moving) {
        if (now - tArmed < ARM_GRACE_MS) { setState(HANDLING); break; }
        if (!tSusp) tSusp = now;
        if (now - tSusp > SUSPICIOUS_MS && liftedConfirmed()) brick("confirmed");
        else if (now - tSusp > TAMPER_ALONE_MS) brick("sustained");
      } else tSusp = 0;

      if (now - tArmed > DEADMAN_MS) brick("deadman");

      // Listen window. TODO: replace with radio.startReceiveDutyCycleAuto + deep sleep.
      uint8_t buf[PACKET_MAX];
      int st = radio.receive(buf, sizeof(buf), LISTEN_WINDOW_MS * 1000);
      if (st == RADIOLIB_ERR_NONE) {
        size_t n = radio.getPacketLength();
        if (n == sizeof(Challenge)) {
          Challenge c; memcpy(&c, buf, sizeof(c));
          if (verifyChallenge(c)) {
            if (c.type == PKT_KILL) brick("kill");
            else if (c.type == PKT_CHALLENGE) sendAnswer(c.counter);
          }
        }
      }
      delay(LISTEN_PERIOD_MS - LISTEN_WINDOW_MS);
      break;
    }

    case TAMPER:
    case BRICKED:
      delay(1000);
      break;
  }
  delay(1000 / ACCEL_HZ);
}
