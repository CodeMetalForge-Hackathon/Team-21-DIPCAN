// bench_feather — first-light test for the Adafruit Feather RP2040 RFM95 puck.
// Proves: I2C to the BME688 (pressure -> altitude), RFM95 init via RadioLib, LED, serial.
// Also listens: any LoRa packet received is printed as hex with RSSI/SNR.
//
//   arduino-cli compile --fqbn rp2040:rp2040:adafruit_feather_rfm firmware/bench_feather
//   arduino-cli upload  --fqbn rp2040:rp2040:adafruit_feather_rfm -p /dev/cu.usbmodem2101 firmware/bench_feather

#include <Wire.h>
#include <RadioLib.h>
#include <Adafruit_BME680.h>

// Feather RP2040 RFM95: radio on CS 16, RST 17, DIO0 21 (DIO1 not wired on this board).
#define PIN_RF_CS   16
#define PIN_RF_RST  17
#define PIN_RF_DIO0 21

#define LORA_FREQ   915.0
#define LORA_BW     125.0
#define LORA_SF     9
#define LORA_CR     7
#define LORA_SYNC   0x34
#define LORA_TX_DBM 5          // bench power; raise after antennas are soldered

SX1276 radio = new Module(PIN_RF_CS, PIN_RF_DIO0, PIN_RF_RST, RADIOLIB_NC);
Adafruit_BME680 bme;
bool haveBme = false, haveRadio = false;

static float altitudeM(float pressureHpa) {
  return 44330.0f * (1.0f - powf(pressureHpa / 1013.25f, 0.1903f));
}

static void blink(int n) {
  for (int i = 0; i < n; i++) { digitalWrite(LED_BUILTIN, HIGH); delay(80); digitalWrite(LED_BUILTIN, LOW); delay(120); }
}

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(115200);
  uint32_t t0 = millis();
  while (!Serial && millis() - t0 < 3000) {}   // give the monitor a moment, don't hang without it

  Serial.println("\nBENCH feather-rp2040-rfm95");

  Wire.begin();
  haveBme = bme.begin(0x77);
  if (!haveBme) haveBme = bme.begin(0x76);
  Serial.printf("BME688  %s\n", haveBme ? "ok" : "NOT FOUND (check STEMMA cable)");
  if (haveBme) {
    bme.setTemperatureOversampling(BME680_OS_2X);
    bme.setPressureOversampling(BME680_OS_4X);
    bme.setHumidityOversampling(BME680_OS_1X);
    bme.setGasHeater(0, 0);          // gas sensor off: saves power, we don't need it
  }

  int st = radio.begin(LORA_FREQ, LORA_BW, LORA_SF, LORA_CR, LORA_SYNC, LORA_TX_DBM);
  haveRadio = (st == RADIOLIB_ERR_NONE);
  Serial.printf("RFM95   %s (code %d)\n", haveRadio ? "ok" : "FAILED", st);
  if (haveRadio) radio.startReceive();

  blink(haveBme && haveRadio ? 1 : 3);   // one blink = all good, three = something missing
}

void loop() {
  static uint32_t last = 0;
  if (millis() - last > 2000) {
    last = millis();
    Serial.printf("STATUS bme=%s rfm95=%s\n", haveBme ? "ok" : "MISSING", haveRadio ? "ok" : "FAILED");
    if (haveBme && bme.performReading()) {
      float p = bme.pressure / 100.0f;
      Serial.printf("BME  p=%.2f hPa  alt=%.1f m  t=%.1f C  rh=%.0f%%\n", p, altitudeM(p), bme.temperature, bme.humidity);
    }
  }

  if (haveRadio) {
    uint8_t buf[64];
    int st = radio.readData(buf, sizeof(buf));
    if (st == RADIOLIB_ERR_NONE) {
      size_t n = radio.getPacketLength();
      Serial.print("RX ");
      for (size_t i = 0; i < n; i++) Serial.printf("%02x", buf[i]);
      Serial.printf("  rssi=%.0f snr=%.1f\n", radio.getRSSI(), radio.getSNR());
      blink(1);
      radio.startReceive();
    } else if (st != RADIOLIB_ERR_RX_TIMEOUT) {
      radio.startReceive();
    }
  }
}
