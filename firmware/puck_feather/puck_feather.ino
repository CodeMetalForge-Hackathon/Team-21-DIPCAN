// Breadcrumbs puck — Adafruit Feather RP2040 RFM95.
// States: DORMANT -> ACTIVATING -> HANDLING -> ARMED -> (BRICKED)
// Log lines: "STATE <name>", "EVT <name> ...". sweep.py ignores anything that isn't "RX ".
//
// Build (serial transport, for bench):
//   arduino-cli compile --fqbn rp2040:rp2040:adafruit_feather_rfm firmware/puck_feather \
//     --build-property "build.extra_flags=-DCHAIN_KEY_HEX=\"<32hex>\" -DPUCK_ID=1"
// Build for LoRa: add -DTRANSPORT_LORA=1

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

// ---------------------------------------------------------------------------
enum State { DORMANT, ACTIVATING, HANDLING, ARMED, BRICKED };
static const char* stateName[] = {"DORMANT", "ACTIVATING", "HANDLING", "ARMED", "BRICKED"};
static State state = DORMANT;
static uint32_t tState = 0, tArmed = 0, tSusp = 0;

static SX1276 radio = new Module(PIN_RF_CS, PIN_RF_DIO0, PIN_RF_RST, RADIOLIB_NC);
static Adafruit_BME680 bme;
static bool haveBaro = false;

static uint8_t  chainKey[KEY_LEN];
static uint16_t chainId  = CHAIN_ID;
static uint8_t  position = PUCK_ID;
static uint32_t lastCounter = 0;

static float bx = 0, by = 0, bz = 1;     // baseline gravity after settle
static float baroBasePa = 0, baroPa = 0, elevBaseM = 0;
static uint16_t steps = 0, headingDeg = 0xFFFF;
static int16_t altDeltaM = 0;

// ---- persistence (EEPROM emulation in flash) --------------------------------
struct Persist { uint32_t magic; uint32_t counter; uint8_t bricked; };
#define MAGIC 0xB4EADC01
static void persistLoad() {
  Persist p; EEPROM.get(0, p);
  if (p.magic == MAGIC) { lastCounter = p.counter; if (p.bricked) state = BRICKED; }
}
static void persistSave(bool bricked) {
  Persist p{MAGIC, lastCounter, (uint8_t)bricked};
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
static bool verifyChallenge(const Challenge& c) {
  uint8_t mac[HMAC_LEN]; hmac16((const uint8_t*)&c, sizeof(c) - HMAC_LEN, mac);
  if (memcmp(mac, c.hmac, HMAC_LEN) != 0) { Serial.println("EVT bad_hmac"); return false; }
  if (c.chainId != chainId) { Serial.println("EVT wrong_chain"); return false; }
  if (c.counter <= lastCounter) { Serial.println("EVT replay_rejected"); return false; }
  lastCounter = c.counter; persistSave(false);
  return true;
}

// ---- transport -------------------------------------------------------------
static void txPacket(const uint8_t* buf, size_t n) {
#if TRANSPORT_LORA
  radio.transmit((uint8_t*)buf, n);
  radio.startReceive();
#else
  Serial.print("RX ");
  for (size_t i = 0; i < n; i++) Serial.printf("%02x", buf[i]);
  Serial.println(" 0 0");
#endif
}

// Returns bytes received into buf, or 0. Non-blocking-ish: opens one LISTEN_WINDOW_MS window on LoRa.
static size_t rxPacket(uint8_t* buf, size_t max) {
#if TRANSPORT_LORA
  int st = radio.receive(buf, max, LISTEN_WINDOW_MS * 1000UL);   // RadioLib timeout is in µs
  if (st == RADIOLIB_ERR_NONE) return radio.getPacketLength();
  return 0;
#else
  static String line;
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

// ---- sensors ---------------------------------------------------------------
static float gMag(float& x, float& y, float& z) {
#if HAS_ACCEL
  accel.getAcceleration(&x, &y, &z);
#else
  x = 0; y = 0; z = 1;          // no accel wired: pretend perfectly still
#endif
  return sqrtf(x * x + y * y + z * z);
}
static float tiltDeg(float x, float y, float z) {
  float dot = x * bx + y * by + z * bz;
  float n = sqrtf(x * x + y * y + z * z) * sqrtf(bx * bx + by * by + bz * bz);
  if (n == 0) return 0;
  return degrees(acosf(constrain(dot / n, -1.0f, 1.0f)));
}
static void baroPoll() {
#if HAS_BARO
  static uint32_t last = 0;
  if (!haveBaro || millis() - last < BARO_SAMPLE_MS) return;
  last = millis();
  if (bme.performReading()) baroPa = bme.pressure;
#endif
}
static float altitudeM(float pa) { return 44330.0f * (1.0f - powf(pa / 101325.0f, 0.1903f)); }

// Confirmation that the puck was lifted, not just jostled.
static bool liftedConfirmed() {
#if HAS_BARO
  if (haveBaro && baroBasePa > 0 && (baroBasePa - baroPa) > BARO_DROP_PA) { Serial.println("EVT baro_lift"); return true; }
#endif
  return false;
}

// ---- actions ---------------------------------------------------------------
static void setState(State s) { state = s; tState = millis(); Serial.printf("STATE %s\n", stateName[s]); }

static void brick(const char* why) {
  Serial.printf("EVT brick %s\n", why);
  memset(chainKey, 0, KEY_LEN);
  persistSave(true);
  radio.sleep();
  setState(BRICKED);
}

static void sendAnswer(uint32_t counter) {
  Answer a{};
  a.type = PKT_ANSWER; a.chainId = chainId; a.puckId = position;
  a.status = ST_LISTENING | (position == 1 ? ST_ANCHOR : 0);
  a.counterEcho = counter;
  a.elevM = (int16_t)(haveBaro ? altitudeM(baroPa) : 0);
  a.minSinceDrop = (uint16_t)((millis() - tArmed) / 60000UL);
  a.steps = steps; a.headingDeg = headingDeg; a.altDeltaM = altDeltaM;
  hmac16((const uint8_t*)&a, sizeof(a) - HMAC_LEN, a.hmac);
  delay(position * SLOT_MS);
  txPacket((const uint8_t*)&a, sizeof(a));
  digitalWrite(PUCK_LED, HIGH); delay(60); digitalWrite(PUCK_LED, LOW);
  Serial.printf("EVT answered ctr=%lu elev=%d\n", (unsigned long)counter, a.elevM);
}

static void handlePacket(const uint8_t* buf, size_t n) {
  if (n != sizeof(Challenge)) { Serial.printf("EVT len_mismatch %u\n", (unsigned)n); return; }
  Challenge c; memcpy(&c, buf, sizeof(c));
  if (!verifyChallenge(c)) return;
  if (c.type == PKT_KILL) brick("kill");
  else if (c.type == PKT_CHALLENGE) sendAnswer(c.counter);
}

// ---------------------------------------------------------------------------
void setup() {
  pinMode(PUCK_LED, OUTPUT);
  pinMode(PIN_HALL, INPUT_PULLUP);
  Serial.begin(115200);
  uint32_t t0 = millis(); while (!Serial && millis() - t0 < 3000) {}
  Serial.printf("\nPUCK feather-rp2040-rfm95 id=%u chain=%u transport=%s demo=%d\n",
                position, chainId, TRANSPORT_LORA ? "lora" : "serial", DEMO);

  EEPROM.begin(256);
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

  int st = radio.begin(LORA_FREQ_MHZ, LORA_BW_KHZ, LORA_SF, LORA_CR, LORA_SYNC_WORD, LORA_TX_DBM);
  Serial.printf("EVT radio %s (%d)\n", st == RADIOLIB_ERR_NONE ? "ok" : "FAILED", st);

  if (state == BRICKED) { Serial.println("EVT previously_bricked"); setState(BRICKED); return; }
  setState(DORMANT);
}

void loop() {
  uint32_t now = millis();
  float x, y, z; float g = gMag(x, y, z);
  baroPoll();

  switch (state) {
    case DORMANT:
      // Hall LOW = magnet present = stay dormant. In serial bench mode, also accept "ACTIVATE" on serial.
      if (digitalRead(PIN_HALL) == LOW) setState(ACTIVATING);
#if !TRANSPORT_LORA
      if (Serial.available() && Serial.peek() == 'A') { Serial.readStringUntil('\n'); setState(ACTIVATING); }
#endif
      break;

    case ACTIVATING:
      // Pairing over LoRa goes here. Bench: fall through after the window.
      digitalWrite(PUCK_LED, HIGH); delay(100); digitalWrite(PUCK_LED, LOW);
      Serial.println("EVT activated");
      setState(HANDLING);
      break;

    case HANDLING:
      if (fabsf(g - 1.0f) < STILL_G) {
        if (now - tState > SETTLE_MS) {
          bx = x; by = y; bz = z; baroBasePa = baroPa; elevBaseM = altitudeM(baroPa);
          tArmed = now; tSusp = 0;
          Serial.printf("EVT armed base_pa=%.0f elev=%.1f\n", baroBasePa, elevBaseM);
          setState(ARMED);
        }
      } else tState = now;
      break;

    case ARMED: {
      bool moving = fabsf(g - 1.0f) > MOTION_G || tiltDeg(x, y, z) > TILT_DEG;
#if HAS_BARO
      // No accel? Treat a confirmed baro lift as both the trigger and the confirmation.
      if (!HAS_ACCEL && liftedConfirmed()) moving = true;
#endif
      if (moving) {
        if (now - tArmed < ARM_GRACE_MS) { Serial.println("EVT grace_rehandle"); setState(HANDLING); break; }
        if (!tSusp) { tSusp = now; Serial.println("EVT suspicious"); }
        if (now - tSusp > SUSPICIOUS_MS && liftedConfirmed()) { brick("confirmed"); break; }
        if (now - tSusp > TAMPER_ALONE_MS) { brick("sustained"); break; }
      } else tSusp = 0;

      if (now - tArmed > DEADMAN_MS) { brick("deadman"); break; }

      uint8_t buf[PACKET_MAX];
      size_t n = rxPacket(buf, sizeof(buf));
      if (n) handlePacket(buf, n);
#if TRANSPORT_LORA
      radio.sleep();
      delay(LISTEN_PERIOD_MS - LISTEN_WINDOW_MS);
#endif
      break;
    }

    case BRICKED:
      // Bench escape hatch, USB serial only (never over the radio): "UNBRICK" clears EEPROM and reboots.
      if (Serial.available()) {
        String l = Serial.readStringUntil('\n'); l.trim();
        if (l == "UNBRICK") { lastCounter = 0; persistSave(false); Serial.println("EVT unbricked_rebooting"); delay(100); rp2040.reboot(); }
      }
      delay(100);
      break;
  }
  delay(1000 / ACCEL_HZ);
}
