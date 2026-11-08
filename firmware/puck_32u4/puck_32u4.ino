// Breadcrumbs puck, minimal build for the Adafruit Feather 32u4 RFM95 (28 KB flash, 2.5 KB RAM).
// No sensors: antenna + brain. Same packet contract and chain lifecycle as puck_feather:
//   DORMANT (tab in) -> ASK 15 s (PAIR_REQ) -> id+1 CARRIED | nobody -> id 0 WAITING
//   WAITING/CARRIED: first PAIR_REQ heard = successor; CARRIED drop-reports back; -> ARMING 60 s -> ARMED
//   LAST build (no accelerometer): the drop is a short tab re-insert (1-5 s) or DROP_TIMER after pairing.
// Tab = jumper A5 <-> A4 (A4 is driven LOW; A5 <-> GND also works). In = LOW = dormant. Pulled = HIGH. Re-insert 10 s = kill.
// No tamper on this build (nothing to sense). Kill over LoRa and by tab still work.
// Build: firmware/build.sh puck32 [port]   (env LAST=1 for the final puck)

#include <SPI.h>
#include <RH_RF95.h>
#include <SHA256.h>
#include <EEPROM.h>
#include "packet.h"
#ifndef HAS_ACCEL
#define HAS_ACCEL 0                 // Grove MMA7660 on SDA/SCL (build.sh: ACCEL=1): stillness = drop, step count
#endif
#ifndef HAS_IMU9
#define HAS_IMU9 0                  // Grove 9DOF ICM20600+AK09918 on SDA/SCL (build.sh: IMU9=1): stillness, steps, heading
#endif
#if HAS_IMU9
#include <Wire.h>
#include <ICM20600.h>
#include <AK09918.h>
static ICM20600 icm(true); static AK09918 ak;
static float magOff[3] = {0, 0, 0}; static bool magCal = false; static uint32_t calibUntil = 0; static float calMin[3], calMax[3];
static uint8_t hdgBins[16]; static uint16_t hdgSamples = 0; static uint32_t lastHdg = 0;
#define DECLINATION_DEG (-14)
#endif
#if HAS_ACCEL || HAS_IMU9
#if HAS_ACCEL
#include <Wire.h>
#include <MMA7660.h>
static MMA7660 accel;
#endif
static uint32_t stillSince = 0, lastStep = 0; static bool stepAbove = false;
static uint16_t steps = 0;
#define STILL_G       0.08f
#ifndef NO_TAB
#define NO_TAB 0                    // 1 = node 0 build: no pull tab, DISARM re-activates it
#endif
#define LAST_STILL_MS 20000UL       // LAST: still this long while carried = dropped
#define STEP_HIGH_G   1.15f
#define STEP_LOW_G    0.95f
#define STEP_MIN_MS   300UL
#endif

// ---- config (mirrors puck_feather/config.h) ----
#ifndef CHAIN_KEY_HEX
#define CHAIN_KEY_HEX "00000000000000000000000000000000"
#endif
#ifndef CHAIN_ID
#define CHAIN_ID 1
#endif
#ifndef IS_LAST
#define IS_LAST 0
#endif
#define LORA_FREQ        915.0
#define LORA_TX_DBM      5          // 20 for range
#define LORA_PAIR_TX_DBM 2
#define PAIR_RSSI_MIN    (-60)
#define PAIR_ASK_MS      15000UL
#define PAIR_REQ_PERIOD  1000UL
#define PAIR_RESPOND_MS  20000UL
#define ARM_DELAY_MS     60000UL
#define DROP_ACK_WAIT_MS 1500UL
#define DROP_TRIES       3
#define LAST_DROP_TIMER  600000UL   // LAST: fallback drop 10 min after pairing (stillness or tab normally end it)
#define TAB_PULL_MS      300UL
#define TAB_DROP_MIN_MS  800UL      // LAST: tab re-inserted this long ...
#define TAB_DROP_MAX_MS  5000UL     // ... and released before this = "I'm dropped"
#define TAB_KILL_MS      10000UL
#define SLOT_MS          400UL
#define ANSWER_BASE_MS   700UL      // slot measured from challenge arrival; base covers this chip's ~0.5 s HMAC+EEPROM
#define PIN_TAB          A5         // tab input (pull-up). 32u4 header: A5 is on the analog side, easy to find
#define PIN_TAB_GND      A4         // driven LOW: tab jumper = A5 <-> A4 (or A5 <-> GND)
#define PIN_LED          13
#define RF_CS 8
#define RF_INT 7
#define RF_RST 4

RH_RF95 rf95(RF_CS, RF_INT);
static uint8_t key[KEY_LEN];
static uint32_t lastCounter = 0;
enum State : uint8_t { DORMANT, ASK, WAITING, CARRIED, ARMING, ARMED, BRICKED };
static const char* const stateNames[] = {"DORMANT", "ASK", "WAITING", "CARRIED", "ARMING", "ARMED", "BRICKED"};
static State state = DORMANT;
static uint32_t tState = 0, tArmStart = 0, tDrop = 0, tPaired = 0, lastReq = 0, pairRespondUntil = 0;
static uint8_t myId = ID_NONE, prevId = ID_NONE, nextId = ID_NONE;
static bool placed = false;
static uint16_t nextSteps = 0, nextHeading = 0xFFFF; static int16_t nextAltDelta = 0;
static int lastRssi = 0;
static uint32_t tChallengeRx = 0;   // millis() when the last packet arrived (answer slots key off it)
static uint32_t stillSinceL = 0;

static uint16_t headingDeg = 0xFFFF;
struct Persist { uint32_t magic; uint32_t counter; uint8_t bricked, myId, prevId, nextId, placed; uint16_t nextSteps, nextHeading; int16_t nextAltDelta; uint8_t magCal; float magOff[3]; uint16_t steps, headingDeg; };
#define MAGIC 0xB4EA3205UL
static void persistSave(bool bricked) {
  Persist p = {MAGIC, lastCounter, bricked, myId, prevId, nextId, placed, nextSteps, nextHeading, nextAltDelta, 0, {0,0,0}, 0, headingDeg};
#if HAS_IMU9
  p.magCal = magCal; memcpy(p.magOff, magOff, sizeof(magOff));
#endif
#if HAS_ACCEL || HAS_IMU9
  p.steps = steps;
#endif
  EEPROM.put(0, p);
}
static void persistLoad() {
  Persist p; EEPROM.get(0, p);
  if (p.magic != MAGIC) return;
  lastCounter = p.counter; if (p.bricked) state = BRICKED;
  myId = p.myId; prevId = p.prevId; nextId = p.nextId; placed = p.placed;
  nextSteps = p.nextSteps; nextHeading = p.nextHeading; nextAltDelta = p.nextAltDelta; headingDeg = p.headingDeg;
#if HAS_IMU9
  magCal = p.magCal; if (magCal) memcpy(magOff, p.magOff, sizeof(magOff));
#endif
#if HAS_ACCEL || HAS_IMU9
  steps = p.steps;
#endif
}

// ---- crypto ----
static void hmac16(const uint8_t* d, uint8_t len, uint8_t* out) {
  SHA256 h; uint8_t full[32];
  h.resetHMAC(key, KEY_LEN); h.update(d, len); h.finalizeHMAC(key, KEY_LEN, full, 32);
  memcpy(out, full, HMAC_LEN);
}
static void signBuf(uint8_t* p, uint8_t n) { hmac16(p, n - HMAC_LEN, p + n - HMAC_LEN); }
static bool verifyBuf(const uint8_t* p, uint8_t n) {
  uint8_t mac[HMAC_LEN]; hmac16(p, n - HMAC_LEN, mac);
  if (memcmp(mac, p + n - HMAC_LEN, HMAC_LEN) != 0) return false;
  uint16_t cid; memcpy(&cid, p + 1, 2);
  return cid == CHAIN_ID;
}
#define SIGN(x)   signBuf((uint8_t*)&(x), sizeof(x))
#define VERIFY(x) verifyBuf((const uint8_t*)&(x), sizeof(x))

// ---- radio ----
static void tx(const void* p, uint8_t n, int8_t dbm) {
  rf95.setTxPower(dbm, false);
  rf95.setHeaderTo(RH_BROADCAST); rf95.setHeaderFrom(myId);
  rf95.send((const uint8_t*)p, n); rf95.waitPacketSent();
  rf95.setTxPower(LORA_TX_DBM, false);
}
static uint8_t rx(uint8_t* buf) {
  if (!rf95.available()) return 0;
  uint8_t n = PACKET_MAX;
  if (!rf95.recv(buf, &n)) return 0;
  lastRssi = rf95.lastRssi();
  return n;
}
static void blink(uint8_t n, uint16_t ms) { while (n--) { digitalWrite(PIN_LED, HIGH); delay(ms); digitalWrite(PIN_LED, LOW); delay(ms); } }
static void logState() { Serial.print(F("STATE ")); Serial.println(stateNames[state]); }
static void setState(State s) { state = s; tState = millis(); logState(); }
static void evt(const __FlashStringHelper* s) { Serial.print(F("EVT ")); Serial.println(s); }

static void brick(const __FlashStringHelper* why) {
  Serial.print(F("EVT brick ")); Serial.println(why);
  memset(key, 0, KEY_LEN); persistSave(true); rf95.sleep(); setState(BRICKED);
}

static void sendPair(uint8_t type) {
  Pair p; p.type = type; p.chainId = CHAIN_ID; p.fromId = (type == PKT_PAIR_REQ) ? ID_NONE : myId;
  SIGN(p); tx(&p, sizeof(p), LORA_PAIR_TX_DBM);
}

static void sendAnswer(uint32_t counter) {
  Answer a; memset(&a, 0, sizeof(a));
  a.type = PKT_ANSWER; a.chainId = CHAIN_ID; a.puckId = myId;
  a.status = (myId == 0 ? ST_ANCHOR : 0) | (state != ARMED ? ST_UNARMED : 0);
  a.counterEcho = counter; a.elevM = 0;
  a.minSinceDrop = tDrop ? (uint16_t)((millis() - tDrop) / 60000UL) : 0;
#if HAS_ACCEL || HAS_IMU9
  a.steps = steps;
#else
  a.steps = 0;
#endif
  a.headingDeg = headingDeg; a.altDeltaM = 0;                    // no barometer on this build
  a.nextId = nextId; a.nextSteps = nextSteps; a.nextHeading = nextHeading; a.nextAltDelta = nextAltDelta;
  SIGN(a);
  uint32_t due = tChallengeRx + ANSWER_BASE_MS + (uint32_t)(myId == ID_NONE ? 0 : myId) * SLOT_MS;
  while ((int32_t)(millis() - due) < 0) delay(1);
  tx(&a, sizeof(a), LORA_TX_DBM);
  blink(1, 60);
  Serial.print(F("EVT answered id=")); Serial.print(myId); Serial.print(F(" next=")); Serial.println(nextId);
}

static bool sendDropReport() {
  if (prevId == ID_NONE) return true;
  DropReport r; r.type = PKT_DROP_REPORT; r.chainId = CHAIN_ID; r.fromId = myId; r.toId = prevId;
#if HAS_ACCEL || HAS_IMU9
  r.steps = steps;
#else
  r.steps = 0;
#endif
  r.headingDeg = headingDeg; r.altDeltaM = 0; SIGN(r);
  static const int8_t powers[] = {5, 10, 20};
  for (uint8_t pi = 0; pi < 3; pi++) for (uint8_t t = 0; t < DROP_TRIES; t++) {
    tx(&r, sizeof(r), powers[pi]);
    Serial.print(F("EVT drop_report to=")); Serial.print(prevId); Serial.print(F(" dbm=")); Serial.println(powers[pi]);
    uint32_t t0 = millis(); uint8_t buf[PACKET_MAX]; uint32_t wait = DROP_ACK_WAIT_MS + (millis() % 700);   // jitter breaks lockstep with another reporter
    while (millis() - t0 < wait) {
      uint8_t n = rx(buf);
      if (n == sizeof(DropAck)) {
        DropAck a; memcpy(&a, buf, sizeof(a));
        if (a.type == PKT_DROP_ACK && a.toId == myId && a.fromId == prevId && VERIFY(a)) { evt(F("drop_acked")); return true; }
      } else if (n == sizeof(DropReport) && buf[0] == PKT_DROP_REPORT) handle(buf, n);   // my successor reporting while I wait: store + ack it
    }
  }
  evt(F("drop_report_failed step back")); blink(10, 100); return false;
}

#if HAS_IMU9
static void readAccel(float& x, float& y, float& z) { int16_t ax, ay, az; icm.getAcceleration(&ax, &ay, &az); x = ax / 1000.0f; y = ay / 1000.0f; z = az / 1000.0f; }
static int headingNow(float ax, float ay, float az) {
  if (ak.isDataReady() != AK09918_ERR_OK) return -1;
  int32_t rx, ry, rz; if (ak.getData(&rx, &ry, &rz) != AK09918_ERR_OK) return -1;
  if (calibUntil) { float r[3] = {(float)rx, (float)ry, (float)rz}; for (uint8_t i = 0; i < 3; i++) { if (r[i] < calMin[i]) calMin[i] = r[i]; if (r[i] > calMax[i]) calMax[i] = r[i]; } }
  float mx = rx - magOff[0], my = ry - magOff[1], mz = rz - magOff[2];
  // sin/cos of roll and pitch straight from the gravity vector (no trig library calls):
  //   roll = atan2(ay, az): cosR = az/nyz, sinR = ay/nyz;  pitch = atan2(-ax, nyz): cosP = nyz/|a|, sinP = -ax/|a|
  float nyz = sqrt(ay * ay + az * az); if (nyz < 1e-3f) nyz = 1e-3f;
  float na = sqrt(ax * ax + nyz * nyz); if (na < 1e-3f) na = 1e-3f;
  float cosR = az / nyz, sinR = ay / nyz, cosP = nyz / na, sinP = -ax / na;
  float xh = mx * cosP + my * sinR * sinP + mz * cosR * sinP;
  float yh = my * cosR - mz * sinR;
  int h = (int)(atan2(-yh, xh) * 57.29578f + 180.0f + DECLINATION_DEG);
  return ((h % 360) + 360) % 360;
}
static uint16_t dominantHeading() {
  if (!hdgSamples) return 0xFFFF;
  uint8_t best = 0; for (uint8_t i = 1; i < 16; i++) if (hdgBins[i] > hdgBins[best]) best = i;
  return (uint16_t)(best * 360 + 180) / 16;
}
static void calibPoll() {
  if (!calibUntil) return;
  float x, y, z; readAccel(x, y, z); headingNow(x, y, z); digitalWrite(PIN_LED, (millis() / 150) & 1);
  if (millis() < calibUntil) return;
  calibUntil = 0; digitalWrite(PIN_LED, LOW);
  float span[3]; for (uint8_t i = 0; i < 3; i++) span[i] = calMax[i] - calMin[i];
  if (span[0] < 70 || span[1] < 70 || span[2] < 70) { Serial.print(F("EVT calib_failed span=")); Serial.print((int)span[0]); Serial.print('/'); Serial.print((int)span[1]); Serial.print('/'); Serial.println((int)span[2]); return; }
  for (uint8_t i = 0; i < 3; i++) magOff[i] = (calMin[i] + calMax[i]) / 2.0f;
  magCal = true; persistSave(state == BRICKED); evt(F("calib_done"));
}
#endif
static void endLeg(const __FlashStringHelper* why) {
#if HAS_IMU9
  headingDeg = dominantHeading();
#endif
  tDrop = millis(); placed = true; persistSave(false);
  Serial.print(F("EVT dropped ")); Serial.println(why);
}
static void startArming() { tArmStart = millis(); setState(ARMING); }

static void onPairReq() {
  bool first = (nextId == ID_NONE);
  if (!first && millis() > pairRespondUntil) return;
  if (lastRssi < PAIR_RSSI_MIN) { Serial.print(F("EVT pair_req too far rssi=")); Serial.println(lastRssi); return; }
  delay(50 + (myId == ID_NONE ? 0 : myId) * 10);
  sendPair(PKT_PAIR_ACK);
  if (!first) return;
  nextId = myId + 1; pairRespondUntil = millis() + PAIR_RESPOND_MS;
  Serial.print(F("EVT successor id=")); Serial.println(nextId);
  if (state == CARRIED) { endLeg(F("successor")); sendDropReport(); } else persistSave(false);
  startArming();
}

static void handle(uint8_t* buf, uint8_t n) {
  uint8_t type = buf[0];
  tChallengeRx = millis();
  if ((type == PKT_CHALLENGE || type == PKT_KILL) && n == sizeof(Challenge)) {
    Challenge c; memcpy(&c, buf, sizeof(c));
    if (!VERIFY(c)) { evt(F("bad_hmac")); return; }
    if (c.counter <= lastCounter) { evt(F("replay_rejected")); return; }
    lastCounter = c.counter; persistSave(false);
    if (type == PKT_KILL) { brick(F("kill")); return; }
    if (state == CARRIED || state == ASK) { evt(F("challenge_ignored (carried)")); return; }
    sendAnswer(c.counter);
  } else if (type == PKT_PAIR_REQ && n == sizeof(Pair) && !IS_LAST) {
    Pair p; memcpy(&p, buf, sizeof(p));
    if (state >= WAITING && state <= ARMED && VERIFY(p)) onPairReq();
  } else if (type == PKT_PAIR_ACK && n == sizeof(Pair) && state == ASK) {
    Pair p; memcpy(&p, buf, sizeof(p));
    if (!VERIFY(p) || p.fromId == ID_NONE) return;
    // No RSSI gate on the ack: proximity was already enforced on the request side.
    prevId = p.fromId; myId = p.fromId + 1; tPaired = millis(); stillSinceL = 0; persistSave(false);
#if HAS_ACCEL || HAS_IMU9
    steps = 0; stillSince = 0; stepAbove = false;
#endif
#if HAS_IMU9
    memset(hdgBins, 0, sizeof(hdgBins)); hdgSamples = 0;
#endif
    headingDeg = 0xFFFF;
    Serial.print(F("EVT paired id=")); Serial.print(myId); Serial.print(F(" prev=")); Serial.println(prevId);
    blink(2, 60); setState(CARRIED);
  } else if (type == PKT_DROP_REPORT && n == sizeof(DropReport)) {
    DropReport r; memcpy(&r, buf, sizeof(r));
    if (r.toId != myId || !VERIFY(r)) return;
    nextId = r.fromId; nextSteps = r.steps; nextHeading = r.headingDeg; nextAltDelta = r.altDeltaM; persistSave(false);
    Serial.print(F("EVT next_leg from=")); Serial.print(r.fromId); Serial.print(F(" steps=")); Serial.print(r.steps);
    Serial.print(F(" hdg=")); Serial.print(r.headingDeg); Serial.print(F(" dalt=")); Serial.println(r.altDeltaM);
    DropAck a; a.type = PKT_DROP_ACK; a.chainId = CHAIN_ID; a.fromId = myId; a.toId = r.fromId; SIGN(a);
    delay(30); tx(&a, sizeof(a), LORA_TX_DBM);
  }
}
static void pollRadio() { uint8_t buf[PACKET_MAX]; uint8_t n = rx(buf); if (n) handle(buf, n); }

// ---- tab (D6 <-> GND, pull-up) ----
static bool tabIn() { return digitalRead(PIN_TAB) == LOW; }
static bool tabWasIn = false, tabEverIn = false, tabSeenIn = false, pullPending = false, tabIgnoreUntilOut = false;
static uint32_t tabInSince = 0, tabOutSince = 0;
// Returns: 1 = pulled (was in, now out for TAB_PULL_MS; or never had a tab 2 s after boot),
//          2 = short re-insert released (LAST drop), 0 = nothing. A pull only counts after an insert.
static uint8_t tabEvent() {
  uint32_t now = millis(); bool in = tabIn(); uint8_t ev = 0;
  if (in) {
    if (!tabWasIn) { tabInSince = now; tabWasIn = true; tabEverIn = true; tabSeenIn = true; pullPending = false; evt(F("tab in")); }
    if (!tabIgnoreUntilOut && state != DORMANT && state != BRICKED && now - tabInSince > TAB_KILL_MS) { brick(F("ip_kill")); }
  } else {
    tabIgnoreUntilOut = false;
    if (tabWasIn) {
      uint32_t held = now - tabInSince; tabWasIn = false; tabOutSince = now; evt(F("tab out"));
      if (state != DORMANT && held >= TAB_DROP_MIN_MS && held <= TAB_DROP_MAX_MS) ev = 2;
      else if (state == DORMANT) pullPending = true;
    }
    if (state == DORMANT && ev == 0) {
      if (pullPending && now - tabOutSince > TAB_PULL_MS) { pullPending = false; ev = 1; }
      else if (!tabEverIn && now > 2000) { tabEverIn = true; ev = 1; }
    }
  }
  return ev;
}

// ---- serial commands ----
static char line[24]; static uint8_t lineLen = 0;
static void command(const char* l) {
  if (!strcmp(l, "STATUS")) {
    Serial.print(F("STATUS state=")); Serial.print(stateNames[state]);
    Serial.print(F(" id=")); Serial.print(myId); Serial.print(F(" prev=")); Serial.print(prevId); Serial.print(F(" next=")); Serial.print(nextId);
    Serial.print(F(" placed=")); Serial.print(placed); Serial.print(F(" ctr=")); Serial.print(lastCounter);
    Serial.print(F(" nextleg=")); Serial.print(nextSteps); Serial.print('/'); Serial.print(nextHeading); Serial.print('/'); Serial.print(nextAltDelta);
#if HAS_ACCEL || HAS_IMU9
    Serial.print(F(" steps=")); Serial.print(steps); Serial.print(F(" hdg=")); Serial.print(headingDeg);
#endif
    Serial.print(F(" tab=")); Serial.print(tabIn()); Serial.print(F(" last=")); Serial.print(IS_LAST);
    Serial.print(F(" up=")); Serial.println(millis() / 1000);
  } else if (!strcmp(l, "ACTIVATE")) { if (state == DORMANT) { myId = ID_NONE; lastReq = 0; setState(ASK); } }
  else if (!strcmp(l, "DROP")) { if (state == CARRIED) { endLeg(F("manual")); sendDropReport(); startArming(); } }
#if HAS_IMU9
  else if (!strcmp(l, "CALIB")) { for (uint8_t i = 0; i < 3; i++) { calMin[i] = 1e9f; calMax[i] = -1e9f; } calibUntil = millis() + 20000UL; Serial.println(F("OK CALIB 20s tumble")); }
  else if (!strcmp(l, "IMU")) { float x, y, z; readAccel(x, y, z); Serial.print(F("IMU acc_mg=")); Serial.print((int)(x * 1000)); Serial.print(','); Serial.print((int)(y * 1000)); Serial.print(','); Serial.print((int)(z * 1000)); Serial.print(F(" hdg=")); Serial.print(headingNow(x, y, z)); Serial.print(F(" cal=")); Serial.print(magCal); Serial.print(F(" steps=")); Serial.print(steps); Serial.print(F(" dom=")); Serial.println(dominantHeading()); }
#endif
  else if (!strcmp(l, "KILL")) { if (state != DORMANT && state != BRICKED) brick(F("serial_kill")); }
  else if (!strcmp(l, "DISARM")) { if (state != BRICKED) { myId = prevId = nextId = ID_NONE; placed = false; tDrop = 0; nextSteps = 0; nextHeading = 0xFFFF; nextAltDelta = 0; persistSave(false); tabEverIn = NO_TAB ? tabSeenIn : true; pullPending = false; setState(DORMANT); Serial.println(F("OK DISARM")); } }  // NO_TAB build (node 0) re-activates on its own after DISARM
  else if (!strcmp(l, "UNBRICK")) { if (state == BRICKED) { lastCounter = 0; persistSave(false); hexToKey(); rf95.setModeRx(); Serial.println(F("EVT unbricked")); tabIgnoreUntilOut = tabIn(); tabInSince = millis(); if (placed && myId != ID_NONE) { tDrop = millis(); startArming(); } else setState(DORMANT); } }
  else if (l[0]) Serial.println(F("ERR unknown"));
}
static void hexToKey() {
  const char* h = CHAIN_KEY_HEX;
  for (uint8_t i = 0; i < KEY_LEN; i++) { char b[3] = {h[2 * i], h[2 * i + 1], 0}; key[i] = (uint8_t)strtoul(b, NULL, 16); }
}
static void pollSerial() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') { line[lineLen] = 0; if (lineLen) command(line); lineLen = 0; }
    else if (lineLen < sizeof(line) - 1) line[lineLen++] = c;
  }
}

void setup() {
  pinMode(PIN_LED, OUTPUT); pinMode(PIN_TAB, INPUT_PULLUP);
  pinMode(PIN_TAB_GND, OUTPUT); digitalWrite(PIN_TAB_GND, LOW);
  Serial.begin(115200);
  uint32_t t0 = millis(); while (!Serial && millis() - t0 < 3000) {}
  Serial.print(F("PUCK feather-32u4-rfm95 last=")); Serial.println(IS_LAST);
  hexToKey(); persistLoad();
#if HAS_ACCEL
  Wire.begin(); accel.init();
#endif
#if HAS_IMU9
  Wire.begin(); icm.initialize(); icm.setAccScaleRange(RANGE_2G); ak.initialize(AK09918_CONTINUOUS_50HZ);
  Serial.print(F("EVT imu id=0x")); Serial.print(icm.getDeviceID(), HEX); Serial.print(F(" magcal=")); Serial.println(magCal);
#endif

  pinMode(RF_RST, OUTPUT); digitalWrite(RF_RST, HIGH); delay(10); digitalWrite(RF_RST, LOW); delay(10); digitalWrite(RF_RST, HIGH); delay(10);
  bool ok = rf95.init();
  if (ok) {
    rf95.setFrequency(LORA_FREQ);
    RH_RF95::ModemConfig cfg = {0x76, 0x94, 0x04};   // BW125 CR4/7 SF9 CRC on — matches the RP2040 pucks and the bridge
    rf95.setModemRegisters(&cfg); rf95.setPreambleLength(8);
    rf95.setTxPower(LORA_TX_DBM, false); rf95.setPromiscuous(true);
  }
  Serial.print(F("EVT radio ")); Serial.println(ok ? F("ok") : F("FAILED"));
  if (state == BRICKED) { evt(F("previously_bricked")); logState(); return; }
  if (placed && myId != ID_NONE) { evt(F("resume placed")); tabIgnoreUntilOut = tabIn(); tDrop = millis(); startArming(); return; }
  myId = prevId = nextId = ID_NONE;
  setState(DORMANT);
}

void loop() {
  uint32_t now = millis();
  pollSerial();
#if HAS_IMU9
  calibPoll();
#endif
  uint8_t tev = tabEvent();
  if (state == BRICKED) { delay(100); return; }

  switch (state) {
    case DORMANT:
      if (tev == 1) { evt(F("tab_pulled")); myId = ID_NONE; lastReq = 0; setState(ASK); }
      break;
    case ASK:
      if (now - lastReq >= PAIR_REQ_PERIOD) { lastReq = now; sendPair(PKT_PAIR_REQ); digitalWrite(PIN_LED, HIGH); delay(20); digitalWrite(PIN_LED, LOW); }
      pollRadio();
      if (state == ASK && now - tState > PAIR_ASK_MS) { myId = 0; prevId = ID_NONE; persistSave(false); evt(F("nobody_answered -> node 0")); blink(3, 60); setState(WAITING); }
      break;
    case WAITING:
      pollRadio();
      break;
    case CARRIED: {
      pollRadio();
#if HAS_ACCEL || HAS_IMU9
      float ax, ay, az;
#if HAS_IMU9
      readAccel(ax, ay, az);
      if (now - lastHdg >= 100) { lastHdg = now; int h = headingNow(ax, ay, az); if (h >= 0 && hdgBins[(h * 16) / 360] < 255) { hdgBins[(h * 16) / 360]++; hdgSamples++; } }
#else
      accel.getAcceleration(&ax, &ay, &az);
#endif
      float g = sqrt(ax * ax + ay * ay + az * az);
      if (!stepAbove && g > STEP_HIGH_G && now - lastStep > STEP_MIN_MS) { stepAbove = true; lastStep = now; steps++; }
      if (stepAbove && g < STEP_LOW_G) stepAbove = false;
      bool still = fabs(g - 1.0f) < STILL_G;
#else
      bool still = false;
#endif
#if IS_LAST
      if (tev == 2) { endLeg(F("tab")); sendDropReport(); startArming(); break; }
      if (still) { if (!stillSinceL) stillSinceL = now; else if (now - stillSinceL > 60000UL) { endLeg(F("still")); sendDropReport(); startArming(); break; } }
      else stillSinceL = 0;
      if (now - tPaired > LAST_DROP_TIMER) { endLeg(F("timer")); sendDropReport(); startArming(); }
#else
      (void)still;
#endif
      break;
    }
    case ARMING:
      pollRadio();
      if (millis() - tArmStart > ARM_DELAY_MS) { evt(F("armed (no tamper on this build)")); setState(ARMED); }   // fresh millis(): startArming() may have run earlier this loop
      break;
    case ARMED:
      pollRadio();
      break;
    default: break;
  }
  delay(10);
}
