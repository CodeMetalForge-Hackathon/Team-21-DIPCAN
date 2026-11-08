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
#define ANSWER_BASE_MS     700       // answers start this long after the challenge arrived (covers the 32u4 HMAC time)
#define SUSPICIOUS_MS      2000
#define TAMPER_ALONE_MS    10000

// ---- chain lifecycle (CLAUDE.md "Chain lifecycle"). Field values; the demo is recorded. ----
#define PAIR_ASK_MS        (15UL * 1000)   // broadcast PAIR_REQ this long; nobody answers -> I am node 0
#define PAIR_REQ_PERIOD_MS 1000            // PAIR_REQ repeat period during ASK
#define PAIR_RESPOND_MS    (20UL * 1000)   // keep answering the successor's PAIR_REQs this long after the first (lost ACKs)
#define PAIR_RSSI_MIN      (-60)           // dBm; pairing must be hand-to-hand. Ignored on the serial transport.
#define ARM_DELAY_MS       (60UL * 1000)   // from "successor paired" (= my drop) to tamper live
#define DROP_ACK_WAIT_MS   1500            // wait for DROP_ACK after each report attempt
#define DROP_POWERS        { 5, 10, 20 }   // dBm steps for the drop report
#define DROP_TRIES         3               // attempts per power step
#define LAST_STILL_MS      (20UL * 1000)   // LAST build: still this long while carried = dropped
#ifndef IS_LAST
#define IS_LAST            0               // build.sh: LAST=1 for the final (different-colour) puck
#endif

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

// ---- phone link (ESP32-S3 BLE bridge on Serial1) — parked; IMU does heading now ----------
#ifndef HAS_PHONE_LINK
#define HAS_PHONE_LINK     0         // Serial1 = TX GPIO0 / RX GPIO1 on the Feather RP2040 RFM95 (build.sh: PHONE=1)
#endif
#define PHONE_BAUD         9600

// ---- pins ------------------------------------------------------------------
#define PIN_RF_CS          16
#define PIN_RF_RST         17
#define PIN_RF_DIO0        21
#define PIN_TAB_GND        5         // driven LOW in pull-tab mode: tab jumper can be D6<->D5 instead of D6<->GND
#define PIN_HALL           6         // Grove Hall (A1104): LOW near magnet. Grove magnetic (reed) switch: HIGH near magnet.
#ifndef HALL_ACTIVE_LOW
#define HALL_ACTIVE_LOW    1         // 1 = Hall sensor, 0 = reed switch (build.sh: REED=1)
#endif
// Pull-tab mode (build.sh: TAB=1): a jumper from D6 to GND is the "tab" (same on the 32u4 pucks).
// Tab IN (LOW) = dormant. Pull it (HIGH via pull-up) = activate. Re-insert and hold 10 s = IP kill.
#ifndef PULL_TAB
#define PULL_TAB           0
#endif
#define TAB_PULL_MS        600       // out this long = tab pulled (> HALL_RELEASE_MS so the hold timer has cleared)
#define TAB_ABSENT_BOOT_MS 2000      // never saw a tab after boot for this long = treat as pulled
#define HALL_TAP_MS        300       // magnet present this long = activate (debounce)
#define HALL_KILL_MS       10000     // magnet held this long after activation = IP kill
#define HALL_RELEASE_MS    400       // a gap shorter than this doesn't end the hold (reed contact flickers)
#define PUCK_LED           LED_BUILTIN   // (PIN_LED is taken by the RP2040 core)

// ---- sensors ---------------------------------------------------------------
#ifndef HAS_BARO
#define HAS_BARO           1         // BME688 on STEMMA QT, 0x77 (build.sh: BARO=0 for a puck without one)
#endif
#ifndef HAS_ACCEL
#define HAS_ACCEL          0         // MMA7660 on the same I2C bus, 0x4C (build.sh: ACCEL=1). Superseded by HAS_IMU.
#endif
#ifndef HAS_IMU
#define HAS_IMU            0         // Grove IMU 9DOF: ICM20600 accel/gyro 0x69 + AK09918 mag 0x0C (build.sh: IMU=1)
#endif
#define ACCEL_HZ           50        // main loop target; real rate ~40 Hz with I2C reads

// ---- dead reckoning (HAS_IMU) ---------------------------------------------
#define STEP_HIGH_G        1.15f     // |a| must rise above this ...
#define STEP_LOW_G         0.95f     // ... after having dipped below this
#define STEP_MIN_MS        300       // and no sooner than this after the last step
#define HEADING_SAMPLE_MS  100       // histogram sample period while carried
#define HEADING_BINS       16        // 22.5 deg sectors
#define MAG_CALIB_MS       20000     // tumble window for hard-iron calibration ("CALIB" command)
#define MAG_CALIB_MIN_SPAN 70        // uT; each axis must swing at least this much (field ~52 uT -> full tumble ~100)
#define DECLINATION_DEG    (-14)     // Boston: magnetic -> true. Set for the AO.

// ---- identity / key --------------------------------------------------------
// Pre-shared for the hackathon. Pass at compile time:
//   --build-property "build.extra_flags=-DCHAIN_KEY_HEX=\"<32 hex>\" -DPUCK_ID=1"
#ifndef CHAIN_KEY_HEX
#define CHAIN_KEY_HEX "00000000000000000000000000000000"
#endif
#ifndef CHAIN_ID
#define CHAIN_ID 1
#endif
// PUCK_ID is no longer baked in: IDs come from pairing (node 0 = heard nobody for 15 s).
