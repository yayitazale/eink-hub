// Copy to config.h and fill in. config.h is git-ignored: it holds your Wi-Fi password and token.
#pragma once

#define WIFI_SSID "my-wifi"
#define WIFI_PASS "my-wifi-password"

// From the frame's Connection tab in E-Ink Hub (no trailing slash).
#define HUB_URL "http://192.168.1.10:8080"
#define FRAME_TOKEN "paste-the-token-here"

#define FW_VERSION "esp32-openframe-1.1"

// Pick one panel. Black & white is the easiest (1-bit BMP, ~48 KB, fits in RAM).
#define PANEL_BW_750      // 7.5" 800×480 black/white (GDEY075T7, Waveshare 7.5" V2)
// #define PANEL_SPECTRA6_730  // 7.3" 800×480 Spectra 6 (GDEP073E01, Waveshare 7.3" E). Needs PSRAM.

// 0 = landscape as the panel is built, 1/3 = portrait, 2 = upside down.
#define ROTATION 0

// SPI pins of the e-paper driver board (Waveshare ESP32 driver board defaults).
#define EPD_CS 15
#define EPD_DC 27
#define EPD_RST 26
#define EPD_BUSY 25
// Only if your board doesn't use the default SPI pins:
// #define EPD_SCK 13
// #define EPD_MOSI 14

// Optional: battery voltage through a divider into an ADC pin (e.g. 2×100k → divider 2.0).
// #define BATTERY_PIN 35
// #define BATTERY_DIVIDER 2.0

// Optional: a button to GND on an RTC-capable pin wakes the frame to check right away.
// #define WAKE_BUTTON_PIN 33

// If the hub can't be reached, try again after this many seconds.
#define RETRY_SECONDS 900
