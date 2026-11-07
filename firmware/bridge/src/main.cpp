// LoRa <-> USB serial bridge. The Pi does all the thinking; this just moves bytes.
// Protocol (one line each, hex payloads):
//   Pi -> bridge:  TX <hex>
//   bridge -> Pi:  RX <hex> <rssi> <snr>
//                  OK | ERR <code>
#include <Arduino.h>
#include <RadioLib.h>
#include "packet.h"
#include "config.h"   // radio constants and pins shared with the puck

static SX1262 radio = new Module(PIN_LORA_CS, PIN_LORA_DIO1, PIN_LORA_RST, PIN_LORA_BUSY);
static volatile bool rxFlag = false;
static void onRx() { rxFlag = true; }

static int hexVal(char c) { return isdigit(c) ? c - '0' : (tolower(c) - 'a' + 10); }

void setup() {
  Serial.begin(115200);
  int st = radio.begin(LORA_FREQ_MHZ, LORA_BW_KHZ, LORA_SF, 7, LORA_SYNC_WORD, LORA_TX_DBM);
  Serial.printf("%s %d\n", st == RADIOLIB_ERR_NONE ? "OK" : "ERR", st);
  radio.setPacketReceivedAction(onRx);
  radio.startReceive();
}

void loop() {
  if (rxFlag) {
    rxFlag = false;
    uint8_t buf[PACKET_MAX]; size_t n = radio.getPacketLength();
    if (n <= sizeof(buf) && radio.readData(buf, n) == RADIOLIB_ERR_NONE) {
      Serial.print("RX ");
      for (size_t i = 0; i < n; i++) Serial.printf("%02x", buf[i]);
      Serial.printf(" %.0f %.1f\n", radio.getRSSI(), radio.getSNR());
    }
    radio.startReceive();
  }

  if (Serial.available()) {
    String line = Serial.readStringUntil('\n'); line.trim();
    if (line.startsWith("TX ")) {
      String hex = line.substring(3);
      uint8_t buf[PACKET_MAX]; size_t n = min((size_t)PACKET_MAX, hex.length() / 2);
      for (size_t i = 0; i < n; i++) buf[i] = (hexVal(hex[2*i]) << 4) | hexVal(hex[2*i+1]);
      int st = radio.transmit(buf, n);
      Serial.printf("%s %d\n", st == RADIOLIB_ERR_NONE ? "OK" : "ERR", st);
      radio.startReceive();
    }
  }
}
