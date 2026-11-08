// LoRa <-> USB serial bridge for the interrogator Pi.
// Feather 32u4 RFM95 (default): RadioHead, because RadioLib doesn't fit in 28 KB.
// Feather RP2040 RFM95 (fallback): RadioLib, with the same 4-byte RadioHead header on the air.
// The Pi does all crypto and logic; this only moves bytes.
//
//   Pi -> bridge:  TX <hex>\n
//   bridge -> Pi:  RX <hex> <rssi> <snr>\n   |   OK <n>  |  ERR <code>
//
// Build:  firmware/build.sh bridge [port]        (32u4)
//         firmware/build.sh bridge rp2040 [port]  (RP2040)
// Keep this tiny on the 32u4: no String, no printf.

#include "packet.h"   // PACKET_MAX (48) and RH_HDR_LEN from the shared contract; built with -I firmware/common
#define LORA_FREQ  915.0
#define LORA_TX_DBM 5          // raise to 20 once antennas are soldered
// Preamble length in symbols. 8 = normal. For wake-on-radio (pucks duty-cycling their receiver,
// deferred until after the PoC) set ~300: that's ~1.23 s at SF9/BW125, longer than a 1 s sleep.
#define LORA_PREAMBLE_SYMS 8

#if defined(ARDUINO_ARCH_RP2040)
  // ---------------------------------------------------------------- RP2040 + RadioLib
  #include <RadioLib.h>
  SX1276 radio = new Module(16, 21, 17, RADIOLIB_NC);     // CS, DIO0, RST
  volatile bool rxFlag = false;
  void onRx() { rxFlag = true; }
  static bool radioInit() {
    int st = radio.begin(LORA_FREQ, 125.0, 9, 7, 0x12, LORA_TX_DBM, LORA_PREAMBLE_SYMS);
    radio.setDio0Action(onRx, RISING); radio.startReceive();
    return st == RADIOLIB_ERR_NONE;
  }
  static bool radioAvailable() { return rxFlag; }
  // Fills buf with the payload (header stripped). Returns length or 0.
  static size_t radioRecv(uint8_t* buf, float& rssi, float& snr) {
    rxFlag = false;
    uint8_t f[RH_HDR_LEN + PACKET_MAX]; size_t n = radio.getPacketLength(); if (n > sizeof(f)) n = sizeof(f);
    bool ok = radio.readData(f, n) == RADIOLIB_ERR_NONE && n > RH_HDR_LEN;
    rssi = radio.getRSSI(); snr = radio.getSNR(); radio.startReceive();
    if (!ok) return 0;
    n -= RH_HDR_LEN; memcpy(buf, f + RH_HDR_LEN, n); return n;
  }
  static bool radioSend(const uint8_t* buf, size_t n) {
    uint8_t f[RH_HDR_LEN + PACKET_MAX]; f[0] = 0xFF; f[1] = 0; f[2] = 0; f[3] = 0; memcpy(f + RH_HDR_LEN, buf, n);
    int st = radio.transmit(f, RH_HDR_LEN + n); radio.startReceive(); return st == RADIOLIB_ERR_NONE;
  }
#else
  // ---------------------------------------------------------------- 32u4 + RadioHead
  #include <SPI.h>
  #include <RH_RF95.h>
  RH_RF95 rf95(8, 7);                                      // CS, INT (DIO0); RST on 4
  static bool radioInit() {
    pinMode(4, OUTPUT); digitalWrite(4, HIGH); delay(10); digitalWrite(4, LOW); delay(10); digitalWrite(4, HIGH); delay(10);
    if (!rf95.init()) return false;
    rf95.setFrequency(LORA_FREQ);
    // BW 125 kHz, CR 4/7, SF9, CRC on, AGC auto — matches the RadioLib pucks. Sync word stays 0x12.
    RH_RF95::ModemConfig cfg = { 0x76, 0x94, 0x04 };
    rf95.setModemRegisters(&cfg);
    rf95.setPreambleLength(LORA_PREAMBLE_SYMS);
    rf95.setTxPower(LORA_TX_DBM, false);
    rf95.setPromiscuous(true);                             // accept any "to" address
    return true;
  }
  static bool radioAvailable() { return rf95.available(); }
  static size_t radioRecv(uint8_t* buf, float& rssi, float& snr) {
    uint8_t n = PACKET_MAX;
    if (!rf95.recv(buf, &n)) return 0;                     // RadioHead strips its header
    rssi = rf95.lastRssi(); snr = rf95.lastSNR(); return n;
  }
  static bool radioSend(const uint8_t* buf, size_t n) {
    rf95.setHeaderTo(0xFF); rf95.setHeaderFrom(0);
    bool ok = rf95.send((uint8_t*)buf, n); rf95.waitPacketSent(); return ok;
  }
#endif

static char line[2 * PACKET_MAX + 8];
static uint8_t lineLen = 0;

static int hexVal(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}
static void printHex(const uint8_t* b, size_t n) {
  static const char* d = "0123456789abcdef";
  for (size_t i = 0; i < n; i++) { Serial.write(d[b[i] >> 4]); Serial.write(d[b[i] & 15]); }
}

void setup() {
  Serial.begin(115200);
  uint32_t t0 = millis(); while (!Serial && millis() - t0 < 3000) {}
  bool ok = radioInit();
  Serial.println(ok ? F("OK bridge") : F("ERR bridge radio init failed"));
}

void loop() {
  if (radioAvailable()) {
    uint8_t buf[PACKET_MAX]; float rssi = 0, snr = 0;
    size_t n = radioRecv(buf, rssi, snr);
    if (n) {
      Serial.print(F("RX ")); printHex(buf, n);
      Serial.print(' '); Serial.print(rssi, 0);
      Serial.print(' '); Serial.println(snr, 1);
    }
  }

  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (lineLen >= 4 && line[0] == 'T' && line[1] == 'X' && line[2] == ' ') {
        uint8_t buf[PACKET_MAX]; size_t n = 0;
        for (uint8_t i = 3; i + 1 < lineLen && n < PACKET_MAX; i += 2) {
          int hi = hexVal(line[i]), lo = hexVal(line[i + 1]);
          if (hi < 0 || lo < 0) break;
          buf[n++] = (hi << 4) | lo;
        }
        if (radioSend(buf, n)) { Serial.print(F("OK ")); Serial.println(n); }
        else Serial.println(F("ERR tx"));
      }
      lineLen = 0;
    } else if (lineLen < sizeof(line) - 1) {
      line[lineLen++] = c;
    }
  }
}
