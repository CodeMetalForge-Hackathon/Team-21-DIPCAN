// BLE <-> UART bridge on an ESP32-S3, so the IP's phone can talk to the puck.
// Advertises the Nordic UART Service (NUS). Anything the phone writes to the RX characteristic
// is forwarded to the puck over UART as a line; anything the puck prints on that UART goes back
// to the phone via the TX characteristic (notify). No logic here: the puck parses the commands.
//
// Wiring to the Feather RP2040 RFM95:
//   ESP32 TX_PIN -> Feather RX (GPIO1 / "RX")     ESP32 RX_PIN <- Feather TX (GPIO0 / "TX")
//   3V3 -> 3V3, GND -> GND. All 3.3 V logic.
//
// Build:  firmware/build.sh ble [port]   (XIAO ESP32S3 by default; see build.sh for other S3 boards)

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// XIAO ESP32S3 and ESP32S3 Plus: D6 = GPIO43 (TX), D7 = GPIO44 (RX). Change for other S3 boards.
#ifndef UART_TX_PIN
#define UART_TX_PIN 43
#endif
#ifndef UART_RX_PIN
#define UART_RX_PIN 44
#endif
#define UART_BAUD   9600
#define DEVICE_NAME "PUCK-LINK"

#define NUS_SERVICE "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define NUS_RX      "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"   // phone writes here
#define NUS_TX      "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"   // phone subscribes here

static BLECharacteristic* txChar = nullptr;
static volatile bool connected = false;

class ServerCB : public BLEServerCallbacks {
  void onConnect(BLEServer*) override { connected = true; Serial.println("BLE connected"); }
  void onDisconnect(BLEServer* s) override { connected = false; Serial.println("BLE disconnected"); s->getAdvertising()->start(); }
};

class RxCB : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    String v = c->getValue().c_str();
    if (v.length() == 0) return;
    if (!v.endsWith("\n")) v += "\n";
    Serial1.print(v);                   // to the puck
    Serial.print("phone> "); Serial.print(v);
  }
};

void setup() {
  Serial.begin(115200);
  Serial1.begin(UART_BAUD, SERIAL_8N1, UART_RX_PIN, UART_TX_PIN);

  BLEDevice::init(DEVICE_NAME);
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new ServerCB());
  BLEService* svc = server->createService(NUS_SERVICE);

  txChar = svc->createCharacteristic(NUS_TX, BLECharacteristic::PROPERTY_NOTIFY);
  txChar->addDescriptor(new BLE2902());

  BLECharacteristic* rxChar = svc->createCharacteristic(NUS_RX, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  rxChar->setCallbacks(new RxCB());

  svc->start();
  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(NUS_SERVICE);
  adv->setScanResponse(true);
  adv->start();
  Serial.println("BLE bridge advertising as " DEVICE_NAME);
}

void loop() {
  // puck -> phone: forward whole lines
  static String line;
  while (Serial1.available()) {
    char c = Serial1.read();
    if (c == '\n') {
      if (connected && txChar && line.length()) { txChar->setValue((uint8_t*)line.c_str(), line.length()); txChar->notify(); }
      Serial.print("puck> "); Serial.println(line);
      line = "";
    } else if (c != '\r' && line.length() < 120) line += c;
  }
  delay(5);
}
