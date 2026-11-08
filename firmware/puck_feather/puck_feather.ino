// Breadcrumbs puck — Adafruit Feather RP2040 RFM95.
//
// Lifecycle (CLAUDE.md "Chain lifecycle"): the successor's activation is the drop signal.
//   DORMANT  tab in.
//   ASK      tab pulled: broadcast PAIR_REQ for 15 s. ACK from a neighbour -> my id = theirs + 1 -> CARRIED.
//            Nobody -> id 0 -> WAITING.
//   WAITING  node 0 on the ground, unarmed; answers the first PAIR_REQ (its successor) -> ARMING.
//   CARRIED  the leg: steps, heading histogram, dAlt. First PAIR_REQ heard = my drop: freeze the leg,
//            DROP_REPORT back to my predecessor (power-stepped until acked) -> ARMING.
//            LAST build: 60 s of stillness is the drop instead.
//   ARMING   60 s timer, then baseline + tamper live -> ARMED.
//   ARMED    tamper live; answers challenges with own leg + successor's leg.
//   BRICKED  key zeroized, flag persisted.
// Log lines: "STATE <name>", "EVT <name> ...". sweep.py ignores anything that isn't "RX ".
// Build: firmware/build.sh puck <n> lora   (env: IMU=1 TAB=1 LAST=1 ...)

#include <Arduino.h>
#include <Wire.h>
#include <EEPROM.h>
#include <RadioLib.h>
#include <SHA256.h>
#include <Adafruit_BME680.h>
#include "config.h"
#include "packet.h"     // firmware/common — passed with -I at build time (see build.sh)

#if HAS_ACCEL
#include <MMA7660.h>
static MMA7660 accel;
#endif
#if HAS_IMU
#include <ICM20600.h>
#include <AK09918.h>
static ICM20600 icm(true);          // AD0 high -> 0x69 on the Grove board
static AK09918  ak;
static bool haveImu = false, haveMag = false;
static float magOff[3] = {0, 0, 0};  // hard-iron offsets (persisted)
static float magNorm = 0;
static bool  traceOn = false;
static bool  magCalibrated = false;
static uint32_t calibUntil = 0;
static float calMin[3], calMax[3];
static uint16_t hdgBins[HEADING_BINS];
static uint32_t hdgSamples = 0, lastHdgSample = 0;
static uint32_t lastStep = 0; static bool stepAbove = false;
#endif

// ---------------------------------------------------------------------------
enum State { DORMANT, ASK, WAITING, CARRIED, ARMING, ARMED, BRICKED };
static const char* stateName[] = {"DORMANT", "ASK", "WAITING", "CARRIED", "ARMING", "ARMED", "BRICKED"};
static State state = DORMANT;
static uint32_t tState = 0, tArmed = 0, tSusp = 0, tDrop = 0, tArmStart = 0;

static SX1276 radio = new Module(PIN_RF_CS, PIN_RF_DIO0, PIN_RF_RST, RADIOLIB_NC);
static volatile bool rxDone = false;
static void onRxDone() { rxDone = true; }
static float lastRssi = 0;
static Adafruit_BME680 bme;
static bool haveBaro = false;

static uint8_t  chainKey[KEY_LEN];
static uint16_t chainId = CHAIN_ID;
static uint32_t lastCounter = 0;

// chain identity
static uint8_t  myId = ID_NONE, prevId = ID_NONE, nextId = ID_NONE;
static bool     placed = false;                 // dropped (successor paired / stillness); survives reboot
static uint32_t pairRespondUntil = 0;           // keep answering the successor's PAIR_REQ until this
static uint32_t lastPairReq = 0;

// own leg and the successor's leg
static uint16_t steps = 0, headingDeg = 0xFFFF; static int16_t altDeltaM = 0;
static uint16_t nextSteps = 0, nextHeading = 0xFFFF; static int16_t nextAltDelta = 0;

static float bx = 0, by = 0, bz = 1;     // baseline gravity after arming
static float baroBasePa = 0, baroPa = 0, elevBaseM = 0, altStartM = 0;
static uint32_t stillSince = 0;

// ---- persistence (EEPROM emulation in flash) --------------------------------
struct Persist {
  uint32_t magic; uint32_t counter; uint8_t bricked; uint8_t magCal; float magOff[3];
  uint8_t myId, prevId, nextId, placed;
  uint16_t steps, headingDeg; int16_t altDeltaM;
  uint16_t nextSteps, nextHeading; int16_t nextAltDelta;
};
#define MAGIC 0xB4EADC03
static void persistLoad() {
  Persist p; EEPROM.get(0, p);
  if (p.magic != MAGIC) return;
  lastCounter = p.counter; if (p.bricked) state = BRICKED;
#if HAS_IMU
  magCalibrated = p.magCal; if (magCalibrated) memcpy(magOff, p.magOff, sizeof(magOff));
#endif
  myId = p.myId; prevId = p.prevId; nextId = p.nextId; placed = p.placed;
  steps = p.steps; headingDeg = p.headingDeg; altDeltaM = p.altDeltaM;
  nextSteps = p.nextSteps; nextHeading = p.nextHeading; nextAltDelta = p.nextAltDelta;
}
static void persistSave(bool bricked) {
  Persist p{}; p.magic = MAGIC; p.counter = lastCounter; p.bricked = bricked;
#if HAS_IMU
  p.magCal = magCalibrated; memcpy(p.magOff, magOff, sizeof(magOff));
#endif
  p.myId = myId; p.prevId = prevId; p.nextId = nextId; p.placed = placed;
  p.steps = steps; p.headingDeg = headingDeg; p.altDeltaM = altDeltaM;
  p.nextSteps = nextSteps; p.nextHeading = nextHeading; p.nextAltDelta = nextAltDelta;
  EEPROM.put(0, p); EEPROM.commit();
}

// ---- crypto ----------------------------------------------------------------
static void hexToBytes(const char* hex, uint8_t* out, size_t n) {
  for (size_t i = 0; i < n; i++) { unsigned v = 0; sscanf(hex + 2 * i, "%2x", &v); out[i] = (uint8_t)v; }
}
static void hmac16(const uint8_t* data, size_t len, uint8_t out[HMAC_LEN]) {
  SHA256 h; uint8_t full[32];
  h.resetHMAC(chainKey, KEY_LEN); h.update(data, len); h.finalizeHMAC(chainKey, KEY_LEN, full, 32);
  memcpy(out, full, HMAC_LEN);
}
// Every packet ends with hmac[HMAC_LEN] and has chainId at offset 1. (No templates: the Arduino
// preprocessor can't generate prototypes for them.)
static void signBuf(uint8_t* pkt, size_t size) { hmac16(pkt, size - HMAC_LEN, pkt + size - HMAC_LEN); }
static bool verifyBuf(const uint8_t* pkt, size_t size) {
  uint8_t mac[HMAC_LEN]; hmac16(pkt, size - HMAC_LEN, mac);
  if (memcmp(mac, pkt + size - HMAC_LEN, HMAC_LEN) != 0) { Serial.println("EVT bad_hmac"); return false; }
  uint16_t cid; memcpy(&cid, pkt + 1, 2);
  if (cid != chainId) { Serial.println("EVT wrong_chain"); return false; }
  return true;
}
#define SIGN(p)   signBuf((uint8_t*)&(p), sizeof(p))
#define VERIFY(p) verifyBuf((const uint8_t*)&(p), sizeof(p))
static bool verifyChallenge(const Challenge& c) {
  if (!VERIFY(c)) return false;
  if (c.counter <= lastCounter) { Serial.println("EVT replay_rejected"); return false; }
  lastCounter = c.counter; persistSave(false);
  return true;
}

// ---- transport -------------------------------------------------------------
static void txPacket(const uint8_t* buf, size_t n, int8_t dbm = LORA_TX_DBM) {
#if TRANSPORT_LORA
  // RadioHead-compatible frame: 4-byte header {to, from, id, flags} then payload.
  uint8_t frame[RH_HDR_LEN + PACKET_MAX];
  frame[0] = RH_BROADCAST; frame[1] = myId; frame[2] = 0; frame[3] = 0;
  memcpy(frame + RH_HDR_LEN, buf, n);
  if (dbm != LORA_TX_DBM) radio.setOutputPower(dbm);
  radio.transmit(frame, RH_HDR_LEN + n);
  if (dbm != LORA_TX_DBM) radio.setOutputPower(LORA_TX_DBM);
  rxDone = false; radio.startReceive();   // back to listening right away
#else
  (void)dbm;
  Serial.print("RX ");
  for (size_t i = 0; i < n; i++) Serial.printf("%02x", buf[i]);
  Serial.println(" 0 0");
#endif
}

// Returns bytes received into buf, or 0. Always-on receiver: poll the RxDone flag. Sets lastRssi.
static size_t rxPacket(uint8_t* buf, size_t max) {
#if TRANSPORT_LORA
  static bool listening = false;
  if (!listening) { rxDone = false; radio.startReceive(); listening = true; }
  if (!rxDone) return 0;
  listening = false;          // readData leaves the radio in standby; re-arm next call
  uint8_t frame[RH_HDR_LEN + PACKET_MAX];
  size_t n = radio.getPacketLength();
  if (n > sizeof(frame)) n = sizeof(frame);
  int st = radio.readData(frame, n);
  lastRssi = radio.getRSSI();
  if (st != RADIOLIB_ERR_NONE || n <= RH_HDR_LEN) return 0;
  if (frame[0] != RH_BROADCAST && frame[0] != myId) return 0;   // not for us
  n -= RH_HDR_LEN; if (n > max) n = max;
  memcpy(buf, frame + RH_HDR_LEN, n);
  return n;
#else
  static String line;
  lastRssi = 0;   // serial bench: RSSI gating is bypassed
  while (Serial.available()) {
    char ch = Serial.read();
    if (ch == '\n') {
      String l = line; line = ""; l.trim();
      if (l.startsWith("TX ")) {
        String hex = l.substring(3); size_t n = min(max, (size_t)(hex.length() / 2));
        for (size_t i = 0; i < n; i++) { unsigned v; sscanf(hex.c_str() + 2 * i, "%2x", &v); buf[i] = (uint8_t)v; }
        return n;
      }
    } else if (ch != '\r') line += ch;
  }
  return 0;
#endif
}
static bool closeEnough() {
#if TRANSPORT_LORA
  return lastRssi >= PAIR_RSSI_MIN;
#else
  return true;
#endif
}

// ---- sensors ---------------------------------------------------------------
static float gMag(float& x, float& y, float& z) {
#if HAS_IMU
  if (haveImu) { int16_t ax, ay, az; icm.getAcceleration(&ax, &ay, &az); x = ax / 1000.0f; y = ay / 1000.0f; z = az / 1000.0f; }
  else { x = 0; y = 0; z = 1; }
#elif HAS_ACCEL
  accel.getAcceleration(&x, &y, &z);
#else
  x = 0; y = 0; z = 1;          // no accel wired: pretend perfectly still
#endif
  return sqrtf(x * x + y * y + z * z);
}

#if HAS_IMU
// Tilt-compensated compass heading, degrees true (0..359), or -1 if no magnetometer data.
static int headingNow(float ax, float ay, float az) {
  if (!haveMag || ak.isDataReady() != AK09918_ERR_OK) return -1;
  int32_t rx, ry, rz; if (ak.getData(&rx, &ry, &rz) != AK09918_ERR_OK) return -1;
  float mx = rx - magOff[0], my = ry - magOff[1], mz = rz - magOff[2];
  magNorm = sqrtf(mx * mx + my * my + mz * mz);       // ~constant (~52 uT in Boston) if calibration is good
  if (calibUntil) {
    float r[3] = {(float)rx, (float)ry, (float)rz};
    for (int i = 0; i < 3; i++) { if (r[i] < calMin[i]) calMin[i] = r[i]; if (r[i] > calMax[i]) calMax[i] = r[i]; }
  }
  float roll = atan2f(ay, az);
  float pitch = atan2f(-ax, sqrtf(ay * ay + az * az));
  float xh = mx * cosf(pitch) + my * sinf(roll) * sinf(pitch) + mz * cosf(roll) * sinf(pitch);
  float yh = my * cosf(roll) - mz * sinf(roll);
  int h = (int)lroundf(degrees(atan2f(-yh, xh)) + 180.0f + DECLINATION_DEG);
  return ((h % 360) + 360) % 360;
}
static void calibStart() {
  for (int i = 0; i < 3; i++) { calMin[i] = 1e9f; calMax[i] = -1e9f; }
  calibUntil = millis() + MAG_CALIB_MS;
  Serial.printf("EVT calib_start tumble through every orientation for %lu s\n", (unsigned long)(MAG_CALIB_MS / 1000));
}
static void calibPoll() {
  if (!calibUntil || millis() < calibUntil) return;
  calibUntil = 0;
  float span[3]; for (int i = 0; i < 3; i++) span[i] = calMax[i] - calMin[i];
  if (span[0] < MAG_CALIB_MIN_SPAN || span[1] < MAG_CALIB_MIN_SPAN || span[2] < MAG_CALIB_MIN_SPAN) {
    Serial.printf("EVT calib_failed not enough motion span=%.0f,%.0f,%.0f (need >%d each)\n", span[0], span[1], span[2], MAG_CALIB_MIN_SPAN);
    return;
  }
  for (int i = 0; i < 3; i++) magOff[i] = (calMin[i] + calMax[i]) / 2.0f;
  magCalibrated = true; persistSave(state == BRICKED);
  Serial.printf("EVT calib_done off=%.0f,%.0f,%.0f span=%.0f,%.0f,%.0f\n", magOff[0], magOff[1], magOff[2], span[0], span[1], span[2]);
}
// Every loop while CARRIED: step peaks + heading histogram.
static void deadReckonPoll(float ax, float ay, float az, float g, uint32_t now) {
  if (!stepAbove && g > STEP_HIGH_G && now - lastStep > STEP_MIN_MS) { stepAbove = true; lastStep = now; steps++; }
  if (stepAbove && g < STEP_LOW_G) stepAbove = false;
  static int lastH = -1;
  if (now - lastHdgSample >= HEADING_SAMPLE_MS) {
    lastHdgSample = now;
    int h = headingNow(ax, ay, az);                 // the only magnetometer read in the loop
    if (h >= 0) { lastH = h; hdgBins[(h * HEADING_BINS) / 360]++; hdgSamples++; }
  }
  if (traceOn) { static uint32_t lastTrace = 0; if (now - lastTrace >= 50) { lastTrace = now; Serial.printf("T %lu %.3f %d %u\n", (unsigned long)now, g, lastH, steps); } }
}
static void deadReckonReset() { steps = 0; hdgSamples = 0; memset(hdgBins, 0, sizeof(hdgBins)); stepAbove = false; }
static uint16_t dominantHeading() {
  if (!hdgSamples) return 0xFFFF;
  int best = 0; for (int i = 1; i < HEADING_BINS; i++) if (hdgBins[i] > hdgBins[best]) best = i;
  return (uint16_t)((best * 360 + 180) / HEADING_BINS);   // bin center
}
#endif
static float tiltDeg(float x, float y, float z) {
  float dot = x * bx + y * by + z * bz;
  float n = sqrtf(x * x + y * y + z * z) * sqrtf(bx * bx + by * by + bz * bz);
  if (n == 0) return 0;
  return degrees(acosf(constrain(dot / n, -1.0f, 1.0f)));
}
static void baroPoll() {
#if HAS_BARO
  // Asynchronous: performReading() blocks ~350 ms, which dropped the loop to 2.6 Hz.
  static uint32_t last = 0, readyAt = 0; static bool inFlight = false;
  if (!haveBaro) return;
  if (!inFlight) {
    if (millis() - last < BARO_SAMPLE_MS) return;
    last = millis(); readyAt = bme.beginReading(); inFlight = (readyAt != 0); return;
  }
  if ((int32_t)(millis() - readyAt) < 0) return;
  inFlight = false;
  if (!bme.endReading()) return;
  baroPa = bme.pressure;
  if (state == ARMED && baroBasePa > 0) {
    float d = baroBasePa - baroPa;                       // positive = pressure fell = went up
    if (fabsf(d) < BARO_DROP_PA && tSusp == 0) {
      float alpha = (BARO_SAMPLE_MS / 1000.0f) / BARO_BASE_TAU_S;   // follow slow weather drift
      baroBasePa += (baroPa - baroBasePa) * alpha;
    }
    static uint32_t lastLog = 0;
    if (fabsf(d) > BARO_LOG_PA && millis() - lastLog > 500) { lastLog = millis(); Serial.printf("EVT baro d=%.1f Pa (%.2f m)\n", d, d / 12.0f); }
  }
#endif
}
static float altitudeM(float pa) { return 44330.0f * (1.0f - powf(pa / 101325.0f, 0.1903f)); }
static bool liftedConfirmed() {
#if HAS_BARO
  if (haveBaro && baroBasePa > 0 && (baroBasePa - baroPa) > BARO_DROP_PA) { Serial.println("EVT baro_lift"); return true; }
#endif
  return false;
}

// ---- actions ---------------------------------------------------------------
static void setState(State s) { state = s; tState = millis(); Serial.printf("STATE %s\n", stateName[s]); }
static void blink(int n, int ms = 60) { for (int i = 0; i < n; i++) { digitalWrite(PUCK_LED, HIGH); delay(ms); digitalWrite(PUCK_LED, LOW); delay(ms); } }

static void brick(const char* why) {
  Serial.printf("EVT brick %s\n", why);
  memset(chainKey, 0, KEY_LEN);
  persistSave(true);
  radio.sleep();
  setState(BRICKED);
}

static void sendAnswer(uint32_t counter) {
  Answer a{};
  a.type = PKT_ANSWER; a.chainId = chainId; a.puckId = myId;
  a.status = ST_LISTENING | (myId == 0 ? ST_ANCHOR : 0) | (state != ARMED ? ST_UNARMED : 0);
  a.counterEcho = counter;
  a.elevM = (int16_t)(haveBaro ? altitudeM(baroPa) : 0);
  a.minSinceDrop = tDrop ? (uint16_t)((millis() - tDrop) / 60000UL) : 0;
  a.steps = steps; a.headingDeg = headingDeg; a.altDeltaM = altDeltaM;
  a.nextId = nextId; a.nextSteps = nextSteps; a.nextHeading = nextHeading; a.nextAltDelta = nextAltDelta;
  SIGN(a);
  delay((myId == ID_NONE ? 0 : myId) * SLOT_MS);
  txPacket((const uint8_t*)&a, sizeof(a));
  blink(1);
  Serial.printf("EVT answered ctr=%lu id=%u elev=%d next=%u\n", (unsigned long)counter, myId, a.elevM, nextId);
}

static void sendPair(uint8_t type) {
  Pair p{}; p.type = type; p.chainId = chainId; p.fromId = (type == PKT_PAIR_REQ) ? ID_NONE : myId;
  SIGN(p); txPacket((const uint8_t*)&p, sizeof(p), LORA_PAIR_TX_DBM);
}

// Freeze the leg at the drop moment.
static void endLeg(const char* why) {
#if HAS_IMU
  headingDeg = dominantHeading();
#endif
  altDeltaM = (int16_t)lroundf(altitudeM(baroPa) - altStartM);
  tDrop = millis(); placed = true; persistSave(false);
  Serial.printf("EVT dropped (%s) leg: steps=%u hdg=%u dalt=%d\n", why, steps, headingDeg, altDeltaM);
}

// Backward report to my predecessor, stepping power up until acked. Blocks up to ~13 s.
static bool sendDropReport() {
  if (prevId == ID_NONE) { Serial.println("EVT drop_report none (node 0)"); return true; }
  DropReport r{}; r.type = PKT_DROP_REPORT; r.chainId = chainId; r.fromId = myId; r.toId = prevId;
  r.steps = steps; r.headingDeg = headingDeg; r.altDeltaM = altDeltaM; SIGN(r);
  const int8_t powers[] = DROP_POWERS;
  for (size_t pi = 0; pi < sizeof(powers); pi++) {
    for (int t = 0; t < DROP_TRIES; t++) {
      txPacket((const uint8_t*)&r, sizeof(r), powers[pi]);
      Serial.printf("EVT drop_report to=%u at %d dBm try %d\n", prevId, powers[pi], t + 1);
      uint32_t t0 = millis();
      while (millis() - t0 < DROP_ACK_WAIT_MS) {
        uint8_t buf[PACKET_MAX]; size_t n = rxPacket(buf, sizeof(buf));
        if (n == sizeof(DropAck)) {
          DropAck a; memcpy(&a, buf, sizeof(a));
          if (a.type == PKT_DROP_ACK && a.toId == myId && a.fromId == prevId && VERIFY(a)) {
            Serial.printf("EVT drop_acked by %u at %d dBm\n", prevId, powers[pi]); return true;
          }
        }
        delay(5);
      }
    }
  }
  Serial.println("EVT drop_report_failed no ack — step back toward the previous puck");
  blink(10, 100);
  return false;
}

static void startArming() { tArmStart = millis(); setState(ARMING); }

// A successor is next to me asking for an id. Answer, and (if carried) treat it as my drop.
static void onPairReq() {
  bool first = (nextId == ID_NONE);
  if (!first && millis() > pairRespondUntil) return;          // already have a successor; stop answering
  if (!closeEnough()) { Serial.printf("EVT pair_req too far rssi=%.0f\n", lastRssi); return; }
  delay(50 + (myId == ID_NONE ? 0 : myId) * 10);
  sendPair(PKT_PAIR_ACK);
  if (!first) return;                                          // repeat ACK for a lost one, nothing else
  nextId = myId + 1; pairRespondUntil = millis() + PAIR_RESPOND_MS;
  Serial.printf("EVT successor id=%u rssi=%.0f\n", nextId, lastRssi);
  if (state == CARRIED) { endLeg("successor"); sendDropReport(); }
  else persistSave(false);
  startArming();
}

static void onDropReport(const DropReport& r) {
  if (r.toId != myId || !VERIFY(r)) return;
  nextId = r.fromId; nextSteps = r.steps; nextHeading = r.headingDeg; nextAltDelta = r.altDeltaM;
  persistSave(false);
  Serial.printf("EVT next_leg from=%u steps=%u hdg=%u dalt=%d rssi=%.0f\n", r.fromId, r.steps, r.headingDeg, r.altDeltaM, lastRssi);
  DropAck a{}; a.type = PKT_DROP_ACK; a.chainId = chainId; a.fromId = myId; a.toId = r.fromId; SIGN(a);
  delay(30); txPacket((const uint8_t*)&a, sizeof(a));
}

static void handlePacket(const uint8_t* buf, size_t n) {
  uint8_t type = buf[0];
  if (type == PKT_CHALLENGE || type == PKT_KILL) {
    if (n != sizeof(Challenge)) return;
    Challenge c; memcpy(&c, buf, sizeof(c));
    if (!verifyChallenge(c)) return;
    if (c.type == PKT_KILL) { brick("kill"); return; }
    if (state == CARRIED || state == ASK) { Serial.println("EVT challenge_ignored (carried)"); return; }
    sendAnswer(c.counter);
  } else if (type == PKT_PAIR_REQ) {
    if (n != sizeof(Pair) || IS_LAST) return;
    Pair p; memcpy(&p, buf, sizeof(p));
    if ((state == WAITING || state == CARRIED || state == ARMING || state == ARMED) && VERIFY(p)) onPairReq();
  } else if (type == PKT_PAIR_ACK) {
    if (n != sizeof(Pair) || state != ASK) return;
    Pair p; memcpy(&p, buf, sizeof(p));
    if (!VERIFY(p) || p.fromId == ID_NONE) return;
    if (!closeEnough()) { Serial.printf("EVT pair_ack too far rssi=%.0f\n", lastRssi); return; }
    prevId = p.fromId; myId = p.fromId + 1; persistSave(false);
    Serial.printf("EVT paired id=%u prev=%u rssi=%.0f\n", myId, prevId, lastRssi);
#if HAS_IMU
    deadReckonReset();
#endif
    altStartM = altitudeM(baroPa); stillSince = 0;
    blink(2);
    setState(CARRIED);
  } else if (type == PKT_DROP_REPORT) {
    if (n != sizeof(DropReport)) return;
    DropReport r; memcpy(&r, buf, sizeof(r)); onDropReport(r);
  } else if (type == PKT_DROP_ACK) {
    // handled inside sendDropReport(); a stray one here is ignored
  } else {
    Serial.printf("EVT unknown_type 0x%02X len=%u\n", type, (unsigned)n);
  }
}

// ---------------------------------------------------------------------------
void setup() {
  pinMode(PUCK_LED, OUTPUT);
#if PULL_TAB
  pinMode(PIN_HALL, INPUT_PULLUP);                                      // tab = D6<->GND or D6<->D5: in = LOW, pulled = HIGH
  pinMode(PIN_TAB_GND, OUTPUT); digitalWrite(PIN_TAB_GND, LOW);         // D5 acts as the tab's ground
#else
  pinMode(PIN_HALL, HALL_ACTIVE_LOW ? INPUT_PULLUP : INPUT_PULLDOWN);
#endif
  Serial.begin(115200);
#if HAS_PHONE_LINK
  Serial1.begin(PHONE_BAUD);
#endif
  uint32_t t0 = millis(); while (!Serial && millis() - t0 < 3000) {}
  Serial.printf("\nPUCK feather-rp2040-rfm95 chain=%u transport=%s last=%d\n", chainId, TRANSPORT_LORA ? "lora" : "serial", IS_LAST);

  EEPROM.begin(512);
  hexToBytes(CHAIN_KEY_HEX, chainKey, KEY_LEN);
  persistLoad();

  Wire.begin();
#if HAS_BARO
  haveBaro = bme.begin(0x77) || bme.begin(0x76);
  if (haveBaro) { bme.setPressureOversampling(BME680_OS_4X); bme.setTemperatureOversampling(BME680_OS_2X); bme.setGasHeater(0, 0); }
  Serial.printf("EVT baro %s\n", haveBaro ? "ok" : "missing");
#endif
#if HAS_ACCEL
  accel.init();
#endif
#if HAS_IMU
  icm.initialize();
  icm.setAccScaleRange(RANGE_2G);
  haveImu = (icm.getDeviceID() != 0 && icm.getDeviceID() != 0xFF);
  haveMag = (ak.initialize(AK09918_CONTINUOUS_50HZ) == AK09918_ERR_OK);
  Serial.printf("EVT imu acc=%s mag=%s magcal=%d\n", haveImu ? "ok" : "missing", haveMag ? "ok" : "missing", magCalibrated);
#endif

  int st = radio.begin(LORA_FREQ_MHZ, LORA_BW_KHZ, LORA_SF, LORA_CR, LORA_SYNC_WORD, LORA_TX_DBM);
  radio.setPacketReceivedAction(onRxDone);
  Serial.printf("EVT radio %s (%d)\n", st == RADIOLIB_ERR_NONE ? "ok" : "FAILED", st);

  if (state == BRICKED) { Serial.println("EVT previously_bricked"); setState(BRICKED); return; }
  if (placed && myId != ID_NONE) { Serial.printf("EVT resume placed id=%u prev=%u next=%u\n", myId, prevId, nextId); tDrop = millis(); startArming(); return; }
  myId = ID_NONE; prevId = ID_NONE; nextId = ID_NONE;
  setState(DORMANT);
}

// "Magnet present" = the activation/kill input is asserted.
#if PULL_TAB
// Tab = jumper D6 <-> GND (same on every puck; AVR boards only have pull-ups). In = LOW.
static bool magnetPresent() { return digitalRead(PIN_HALL) == LOW; }
static bool tabIn = false, tabEverIn = false;
static bool tabPulled() {
  static uint32_t outSince = 0;
  uint32_t now = millis();
  if (digitalRead(PIN_HALL) == LOW) { tabIn = true; tabEverIn = true; outSince = 0; return false; }
  if (!outSince) outSince = now;
  if (tabIn) { if (now - outSince > TAB_PULL_MS) { tabIn = false; return true; } return false; }
  if (!tabEverIn && now > TAB_ABSENT_BOOT_MS) { tabEverIn = true; return true; }
  return false;
}
#else
static bool magnetPresent() { return digitalRead(PIN_HALL) == (HALL_ACTIVE_LOW ? LOW : HIGH); }
#endif
static uint32_t hallHeldMs() {
  static uint32_t since = 0, lastSeen = 0; static bool wasOn = false;
  uint32_t now = millis(); bool on = magnetPresent();
  if (state == DORMANT) since = 0;          // a tab sitting in while dormant is not a "hold"; count only after activation
  if (on) { if (!since) since = now; lastSeen = now; }
  else if (since && now - lastSeen > HALL_RELEASE_MS) since = 0;
  if (on != wasOn) { wasOn = on; Serial.printf("EVT magnet %s\n", on ? "on" : "off"); }
  return since ? now - since : 0;
}

// ---- text commands (USB; also Serial1 if the phone link is built in) ---------------------
static bool pendingActivate = false;
static void handleCommand(String l, Stream& reply, bool fromUsb) {
  l.trim();
  if (l == "STATUS") {
    reply.printf("STATUS state=%s id=%u prev=%u next=%u placed=%d ctr=%lu baro=%s pa=%.0f leg=%u/%u/%d nextleg=%u/%u/%d arm_in=%lds magnet=%d pin6=%d transport=%s last=%d up=%lus\n",
                 stateName[state], myId, prevId, nextId, placed, (unsigned long)lastCounter,
                 haveBaro ? "ok" : "none", baroPa, steps, headingDeg, altDeltaM, nextSteps, nextHeading, nextAltDelta,
                 state == ARMING ? (long)((ARM_DELAY_MS - (millis() - tArmStart)) / 1000) : 0L,
                 magnetPresent(), digitalRead(PIN_HALL), TRANSPORT_LORA ? "lora" : "serial", IS_LAST, (unsigned long)(millis() / 1000));
  } else if (l == "ACTIVATE") {
    pendingActivate = true;
  } else if (l == "DROP") {
    // Bench: force the drop (as if a successor paired / stillness elapsed) while CARRIED.
    if (state == CARRIED) { endLeg("manual"); sendDropReport(); startArming(); reply.println("OK DROP"); }
#if HAS_IMU
  } else if (l == "TRACE") {
    traceOn = !traceOn; reply.printf("OK TRACE %s\n", traceOn ? "on" : "off");
  } else if (l == "CALIB") {
    calibStart(); reply.printf("OK CALIB %lus\n", (unsigned long)(MAG_CALIB_MS / 1000));
  } else if (l == "IMU") {
    float x, y, z; float g = gMag(x, y, z); int h = headingNow(x, y, z);
    reply.printf("IMU acc=%.2f,%.2f,%.2f |g|=%.2f hdg=%d |m|=%.0f cal=%d steps=%u dom=%u samples=%lu have=%d/%d\n",
                 x, y, z, g, h, magNorm, magCalibrated, steps, dominantHeading(), (unsigned long)hdgSamples, haveImu, haveMag);
#endif
  } else if (l == "PINTEST") {
    pinMode(PIN_HALL, INPUT_PULLDOWN); delay(5); int pd = digitalRead(PIN_HALL);
    pinMode(PIN_HALL, INPUT_PULLUP);   delay(5); int pu = digitalRead(PIN_HALL);
    pinMode(PIN_HALL, (!PULL_TAB && !HALL_ACTIVE_LOW) ? INPUT_PULLDOWN : INPUT_PULLUP);
    reply.printf("PINTEST d6 pulldown=%d pullup=%d\n", pd, pu);
  } else if (l == "I2CSCAN") {
    reply.print("I2C");
    for (uint8_t a = 1; a < 127; a++) { Wire.beginTransmission(a); if (Wire.endTransmission() == 0) reply.printf(" 0x%02X", a); }
    reply.println();
  } else if (l == "KILL") {
    if (state != DORMANT && state != BRICKED) brick("phone_kill");
  } else if (l == "DISARM") {
    // Bench only, USB only: back to DORMANT without wiping; forget chain identity.
    if (fromUsb && state != BRICKED) {
      tSusp = 0; myId = prevId = nextId = ID_NONE; placed = false; tDrop = 0;
      steps = 0; headingDeg = 0xFFFF; altDeltaM = 0; nextSteps = 0; nextHeading = 0xFFFF; nextAltDelta = 0;
      persistSave(false);
#if PULL_TAB
      tabIn = false; tabEverIn = true;
#endif
      setState(DORMANT); reply.println("OK DISARM");
    }
  } else if (l == "UNBRICK") {
    if (fromUsb && state == BRICKED) {
      lastCounter = 0; myId = prevId = nextId = ID_NONE; placed = false; persistSave(false);
      Serial.println("EVT unbricked_rebooting"); delay(100); rp2040.reboot();
    }
  } else if (l.length()) {
    reply.println("ERR unknown");
  }
}
static void pollCommands() {
  static String usbLine, phoneLine;
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') { handleCommand(usbLine, Serial, true); usbLine = ""; }
    else if (c != '\r' && usbLine.length() < 80) usbLine += c;
  }
#if HAS_PHONE_LINK
  while (Serial1.available()) {
    char c = Serial1.read();
    if (c == '\n') { Serial.print("EVT phone> "); Serial.println(phoneLine); handleCommand(phoneLine, Serial1, false); phoneLine = ""; }
    else if (c >= 0x20 && c < 0x7F && phoneLine.length() < 80) phoneLine += c;
  }
#endif
}

static void pollRadio() {
  uint8_t buf[PACKET_MAX];
  size_t n = rxPacket(buf, sizeof(buf));
  if (n) handlePacket(buf, n);
}

void loop() {
  uint32_t now = millis();
  float x, y, z; float g = gMag(x, y, z);
  baroPoll();
  pollCommands();
#if HAS_IMU
  calibPoll();
  if (calibUntil) { headingNow(x, y, z); digitalWrite(PUCK_LED, (now / 150) & 1); }
#endif
  uint32_t held = hallHeldMs();

  // IP kill: tab re-inserted / magnet held 10 s on an activated puck.
  if (state != DORMANT && state != BRICKED && held > HALL_KILL_MS) { brick("ip_kill"); return; }

  switch (state) {
    case DORMANT:
#if PULL_TAB
      if (tabPulled() || pendingActivate) { pendingActivate = false; Serial.println("EVT tab_pulled"); myId = ID_NONE; lastPairReq = 0; setState(ASK); }
#else
      if (held > HALL_TAP_MS || pendingActivate) { pendingActivate = false; myId = ID_NONE; lastPairReq = 0; setState(ASK); }
#endif
      break;

    case ASK:
      if (now - lastPairReq >= PAIR_REQ_PERIOD_MS) { lastPairReq = now; sendPair(PKT_PAIR_REQ); digitalWrite(PUCK_LED, HIGH); delay(20); digitalWrite(PUCK_LED, LOW); }
      pollRadio();                                   // PAIR_ACK -> CARRIED (in handlePacket)
      if (state == ASK && now - tState > PAIR_ASK_MS) {
        myId = 0; prevId = ID_NONE; persistSave(false);
        Serial.println("EVT nobody_answered -> node 0");
        blink(3);
        setState(WAITING);
      }
      break;

    case WAITING:                                    // node 0 on the ground, unarmed, waiting for its successor
      pollRadio();
      break;

    case CARRIED:
#if HAS_IMU
      deadReckonPoll(x, y, z, g, now);
#endif
      pollRadio();                                   // successor's PAIR_REQ = my drop
#if IS_LAST
      if (fabsf(g - 1.0f) < STILL_G) {
        if (!stillSince) stillSince = now;
        else if (now - stillSince > LAST_STILL_MS) { endLeg("still"); sendDropReport(); startArming(); }
      } else stillSince = 0;
#endif
      break;

    case ARMING:
      pollRadio();
      // fresh millis(): a blocking drop report (or the DROP command) can run before this check in the same loop
      if (millis() - tArmStart > ARM_DELAY_MS && fabsf(g - 1.0f) < STILL_G) {
        bx = x; by = y; bz = z; baroBasePa = baroPa; elevBaseM = altitudeM(baroPa);
        tArmed = now; tSusp = 0;
        Serial.printf("EVT armed base_pa=%.0f elev=%.1f\n", baroBasePa, elevBaseM);
        setState(ARMED);
      }
      break;

    case ARMED: {
      bool moving = fabsf(g - 1.0f) > MOTION_G || tiltDeg(x, y, z) > TILT_DEG;
#if HAS_BARO
      if (!HAS_ACCEL && !HAS_IMU && liftedConfirmed()) moving = true;   // no accel: baro is trigger and confirmation
#endif
      if (moving) {
        if (!tSusp) { tSusp = now; Serial.println("EVT suspicious"); }
        if (now - tSusp > SUSPICIOUS_MS && liftedConfirmed()) { brick("confirmed"); break; }
        if (now - tSusp > TAMPER_ALONE_MS) { brick("sustained"); break; }
      } else tSusp = 0;
      if (now - tArmed > DEADMAN_MS) { brick("deadman"); break; }
      pollRadio();
      break;
    }

    case BRICKED:
      delay(100);
      break;
  }
  delay(1000 / ACCEL_HZ);
}
