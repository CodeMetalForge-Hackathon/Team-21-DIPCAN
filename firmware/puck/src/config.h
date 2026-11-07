// config.h — every timer, threshold, and pin lives here. Nothing inline in main.cpp.
#pragma once

#ifndef DEMO
#define DEMO 0
#endif

// ---- timers ----------------------------------------------------------------
#if DEMO
  #define SETTLE_MS        (8UL * 1000)        // stillness before arming
  #define LISTEN_PERIOD_MS (1UL * 1000)        // how often the receiver wakes
  #define DEADMAN_MS       (30UL * 60 * 1000)  // self-brick
#else
  #define SETTLE_MS        (60UL * 1000)
  #define LISTEN_PERIOD_MS (10UL * 1000)       // needs long-preamble challenge
  #define DEADMAN_MS       (72UL * 3600 * 1000)
#endif
#define LISTEN_WINDOW_MS   50
#define SLOT_MS            400        // reply at position * SLOT_MS after challenge
#define PAIR_WINDOW_MS     (10UL * 1000)
#define ARM_GRACE_MS       (10UL * 1000)  // motion here -> back to HANDLING, not brick
#define SUSPICIOUS_MS      2000       // sustained motion/tilt before "suspicious"
#define TAMPER_ALONE_MS    10000      // suspicious with no confirmation -> brick anyway

// ---- tamper thresholds -----------------------------------------------------
#define TILT_DEG           15.0f
#define MOTION_G           0.25f      // |g| off 1.0 by more than this = moving
#define STILL_G            0.08f      // |g| within this of 1.0 = still
#define BARO_DROP_PA       20.0f      // ~1.7 m lift
#define ULTRA_LIFT_CM      10
#define LIGHT_STEP         200        // ADC counts, tune on the bench

// ---- radio -----------------------------------------------------------------
#define LORA_FREQ_MHZ      915.0
#define LORA_BW_KHZ        125.0
#if DEMO
  #define LORA_SF          9
  #define LORA_TX_DBM      2          // across the room
#else
  #define LORA_SF          11
  #define LORA_TX_DBM      22
#endif
#define LORA_PAIR_TX_DBM   -9         // pucks are touching during pairing
#define LORA_SYNC_WORD     0x34

// ---- pins (XIAO ESP32C6 + Wio-SX1262; adjust per board) --------------------
#define PIN_LORA_CS        D0
#define PIN_LORA_DIO1      D1
#define PIN_LORA_RST       D2
#define PIN_LORA_BUSY      D3
#define PIN_HALL           D4
#define PIN_ULTRA          D5
#define PIN_LIGHT          A0
#define PIN_LED            LED_BUILTIN

// ---- sensors ---------------------------------------------------------------
#define ACCEL_HZ           32
#define HAS_BARO           0          // flip to 1 when the BMP280 shows up
#define HAS_ULTRA          1
#define HAS_LIGHT          1

// ---- key -------------------------------------------------------------------
// Pre-shared for the hackathon; ECDH at pairing in production.
#ifndef CHAIN_KEY_HEX
#define CHAIN_KEY_HEX "00000000000000000000000000000000"   // override in platformio.local.ini
#endif
