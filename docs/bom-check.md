# Production dipcan: can it be bottle-cap size, 15 g, and 15 dollars?

Checked 2026-11-08 against seller and manufacturer pages read the same day. Where a page did not confirm a figure, the line says so. Prices are per unit at the quantity shown; assembly, potting, and packaging are estimates, not quotes.

## Size: yes, tight

A 32 mm by 10 mm disc holds the stack: CR2032 cell 3.2 mm (20 mm across), PCB 1.0 mm, the tallest module 2.4 mm, and about 1 mm of potting each side, about 8.6 mm of the 10. Area on a 32 mm disc is about 800 mm². The two modules take about 450 mm² (ESP32-C6-MINI-1U 13.2 x 12.5 mm; an SX1262 module such as the Ebyte E22-900M22S at 14 x 20 mm), the chip antenna and its keep-out about 150 mm², the sensors a few mm² each, with the cell on the other face. A real bottle cap is 26 mm by 6 mm, so "about the size of a bottle cap" is honest; "a bottle cap" is not.

## Weight: yes, with a CR2032

| Part | Mass | Source |
|---|---|---|
| CR2032 cell | 2.8 to 3.0 g | Panasonic coin lithium table |
| ESP32-C6-MINI-1U module | about 1 g | not confirmed on a page; typical for a 13 x 12.5 x 2.4 mm shielded module |
| SX1262 module | about 1.5 g | not confirmed; module pages do not list mass |
| 32 mm two-layer PCB, 1.0 mm | about 1.5 g | FR4 density, computed |
| sensors, cap, passives, antenna | about 0.5 g | computed |
| potting, about 5 cm³ at 1.15 g/cm³ | about 5.5 g | computed |
| **Total** | **about 13 to 14 g** | |

With a CR2450 (6.2 g, 620 mAh) the total is about 17 g. "About 15 g" holds; the choice of cell decides which side of it.

## Cost: 15 dollars needs about ten thousand units; under 20 at one thousand

| Part | At 1,000 | Source |
|---|---|---|
| ESP32-C6-MINI-1 | 1.84 to 2.70 USD | Shengyuic 1,000-piece tier 1.84 (currency not stated); TME H4 variant 2.70 USD at 650 |
| SX1262 module | 3.50 to 6.77 USD | Seeed Wio-SX1262 6.77 at 1,000 on DigiKey; Ebyte E22-900M22S 5.25 single at RobotShop, 1,000-piece tier not shown |
| BMP280 barometer | about 1 USD | not confirmed today |
| accelerometer (LIS2DH12 class) | about 1 USD | not confirmed today |
| light sensor | about 0.30 USD | not confirmed today |
| CR2032 | about 0.30 USD | not confirmed today |
| surface-mount supercapacitor | about 1.50 USD | not confirmed today |
| chip antenna | about 0.60 USD | not confirmed today |
| crystal, LDO, FETs, passives | about 1.50 USD | estimate |
| PCB | about 0.80 USD | estimate |
| SMT assembly | 1.50 to 2.00 USD | estimate |
| potting, pull tab, packaging | about 1.00 USD | estimate |
| **Total** | **about 15 to 20 USD** | |

At 1,000 units the parts and assembly land near 17 to 20 dollars. At 10,000 the modules fall and 15 is reachable. The video now says "under 20 dollars in volume."

## Why the supercapacitor is not optional

A CR2032 is rated for continuous currents of a few mA and tested at about 30 mA pulses; its internal resistance is about 30 ohms. An SX1262 at 22 dBm draws about 120 mA for the length of one answer. Without a capacitor the cell's voltage sags below the radio's minimum during the burst. The capacitor carries the burst; the cell recharges it between.

## Sources read today
- Espressif ESP32-C6-MINI-1 datasheet: https://documentation.espressif.com/esp32-c6-mini-1_mini-1u_datasheet_en.pdf
- Shengyuic ESP32-C6-MINI-1-N4: https://shengyuic.com/products/detail/Espressif-Systems/ESP32-C6-MINI-1-N4/16365718.html
- TME ESP32-C6-MINI-1-H4: https://www.tme.com/us/en-us/details/esp32-c6-mini-1-h4/iot-wifi-bluetooth-modules/espressif/
- DigiKey Wio-SX1262: https://www.digikey.com.au/en/products/detail/seeed-technology-co-ltd/114993390/25835823
- RobotShop E22-900M22S: https://www.robotshop.com/products/ebyte-e22-900m22s-ebyte-tcxo-22dbm-6500m-sx1262-900mhz-new-lora-module-smd-wireless-transceiver-module
- Panasonic coin lithium table: https://www.panasonic.com/global/energy/products/battery/coin_lithium_technologies.html
- Energizer lithium coin application manual: https://data.energizer.com/pdfs/lithiumcoin_appman.pdf
