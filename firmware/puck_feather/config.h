// config.h — every timer, threshold, and pin for the Feather RP2040 RFM95 puck.
#pragma once

#ifndef DEMO
#define DEMO 1
#endif

// ---- transport: 0 = USB serial (sweep.py talks to the puck directly), 1 = LoRa ----
#ifndef TRANSPORT_LORA
#define TRANSPORT_LORA 0
#endif

// ---- timers ----------------------------------------------------------------
#if DEMO
  #define SETTLE_MS        (8UL * 1000)
  #define LISTEN_PERIOD_MS (1UL * 1000)
  #define DEADMAN_MS       (30UL * 60 * 1000)
#else
  #define SETTLE_MS        (60UL * 1000)
  #define LISTEN_PERIOD_MS (10UL * 1000)
  #define DEADMAN_MS       (72UL * 3600 * 1000)
#endif
#define LISTEN_WINDOW_MS   200       // RFM95 has no auto duty-cycle; we open a real RX window
#define LISTEN_MAX_MS      3000      // if a preamble is detected in the window, stay up to this long
#define LISTEN_IDLE_SLEEP  0         // 0 = receiver always on (PoC). 1 = windowed wake-on-radio: not yet
                                     //     working with the bridge's long preamble; revisit after the PoC.
#define SLOT_MS            400
#define PAIR_WINDOW_MS     (10UL * 1000)
#define ARM_GRACE_MS       (10UL * 1000)
#define SUSPICIOUS_MS      2000
#define TAMPER_ALONE_MS    10000

// ---- tamper thresholds -----------------------------------------------------
#define TILT_DEG           15.0f
#define MOTION_G           0.25f
#define STILL_G            0.08f
#define BARO_DROP_PA       8.0f      // ~0.7 m lift (12 Pa/m). Sustained 2 s, so noise won't trip it
#define BARO_SAMPLE_MS     250
#define BARO_BASE_TAU_S    300.0f    // baseline tracks weather with a 5 min time constant while still
#define BARO_LOG_PA        3.0f      // log "EVT baro d=..." when |delta| exceeds this (demo visibility)

// ---- radio (Feather RP2040 RFM95 = SX1276) ---------------------------------
#define LORA_FREQ_MHZ      915.0
#define LORA_BW_KHZ        125.0
#define LORA_CR            7
#define LORA_SYNC_WORD     LORA_SYNC    // 0x12, from packet.h — must match the RadioHead bridge
#if DEMO
  #define LORA_SF          9
  #define LORA_TX_DBM      5         // raise to 20 once antennas are soldered
#else
  #define LORA_SF          11
  #define LORA_TX_DBM      20
#endif
#define LORA_PAIR_TX_DBM   2

// ---- pins ------------------------------------------------------------------
#define PIN_RF_CS          16
#define PIN_RF_RST         17
#define PIN_RF_DIO0        21
#define PIN_HALL           6         // Grove Hall: LOW near magnet
#define HALL_TAP_MS        300       // magnet present this long = activate (debounce)
#define HALL_KILL_MS       10000     // magnet held this long after activation = IP kill
#define PUCK_LED           LED_BUILTIN   // (PIN_LED is taken by the RP2040 core)

// ---- sensors ---------------------------------------------------------------
#define HAS_BARO           1         // BME688 on STEMMA QT, 0x77
#define HAS_ACCEL          0         // MMA7660 on the same I2C bus, 0x4C — flip when wired
#define ACCEL_HZ           32

// ---- identity / key --------------------------------------------------------
// Pre-shared for the hackathon. Pass at compile time:
//   --build-property "build.extra_flags=-DCHAIN_KEY_HEX=\"<32 hex>\" -DPUCK_ID=1"
#ifndef CHAIN_KEY_HEX
#define CHAIN_KEY_HEX "00000000000000000000000000000000"
#endif
#ifndef CHAIN_ID
#define CHAIN_ID 1
#endif
#ifndef PUCK_ID
#define PUCK_ID 1                    // chain position, 1 = first anchor
#endif
