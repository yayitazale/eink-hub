// Open Frame example: ESP32 + e-paper, deep sleep between polls.
//
// Every wake-up: connect to Wi-Fi, ask the hub what to show (GET /of/v1/display), download the
// BMP if there is something new, draw it, and deep-sleep for as long as the hub says.
// Protocol: https://yayitazale.gitlab.io/eink-hub/diy/protocol
#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <WiFi.h>

#include "config.h"

#if defined(PANEL_SPECTRA6_730)
#include <GxEPD2_7C.h>
// A quarter of the panel per page keeps the frame buffer small; the picture itself sits in PSRAM.
GxEPD2_7C<GxEPD2_730c_GDEP073E01, GxEPD2_730c_GDEP073E01::HEIGHT / 4> display(GxEPD2_730c_GDEP073E01(EPD_CS, EPD_DC, EPD_RST, EPD_BUSY));
#define PALETTE "spectra6"
#else
#include <GxEPD2_BW.h>
GxEPD2_BW<GxEPD2_750_GDEY075T7, GxEPD2_750_GDEY075T7::HEIGHT> display(GxEPD2_750_GDEY075T7(EPD_CS, EPD_DC, EPD_RST, EPD_BUSY));
#define PALETTE "bw"
#endif

// Survives deep sleep: the id of the picture on screen, so the hub doesn't resend it.
RTC_DATA_ATTR char currentId[48] = "";

static void sleepFor(uint32_t seconds) {
  Serial.printf("Sleeping %u s\n", seconds);
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
#ifdef WAKE_BUTTON_PIN
  esp_sleep_enable_ext0_wakeup((gpio_num_t)WAKE_BUTTON_PIN, 0);
#endif
  esp_sleep_enable_timer_wakeup((uint64_t)seconds * 1000000ULL);
  esp_deep_sleep_start();
}

static int batteryPercent() {
#ifdef BATTERY_PIN
  float volts = analogReadMilliVolts(BATTERY_PIN) * BATTERY_DIVIDER / 1000.0f;
  // LiPo: ~3.0 V empty, ~4.2 V full. Good enough for a "replace soon" warning.
  return constrain((int)((volts - 3.0f) / 1.2f * 100), 0, 100);
#else
  return -1;
#endif
}

static bool connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  for (int i = 0; i < 100 && WiFi.status() != WL_CONNECTED; i++) delay(100);
  return WiFi.status() == WL_CONNECTED;
}

static void hubLog(const char* level, const String& message) {
  HTTPClient http;
  http.begin(String(HUB_URL) + "/of/v1/log");
  http.addHeader("Authorization", "Bearer " FRAME_TOKEN);
  http.addHeader("Content-Type", "application/json");
  JsonDocument doc;
  doc["level"] = level;
  doc["message"] = message;
  String body;
  serializeJson(doc, body);
  http.POST(body);
  http.end();
}

// Whole file into memory (PSRAM when there is some). The hub always sends Content-Length.
static uint8_t* download(const String& url, size_t& len) {
  HTTPClient http;
  http.begin(url);
  http.setTimeout(20000);
  int code = http.GET();
  int size = http.getSize();
  if (code != 200 || size <= 0) {
    http.end();
    return nullptr;
  }
  uint8_t* buf = (uint8_t*)(psramFound() ? ps_malloc(size) : malloc(size));
  if (!buf) {
    http.end();
    return nullptr;
  }
  WiFiClient* stream = http.getStreamPtr();
  size_t got = 0;
  uint32_t start = millis();
  while (got < (size_t)size && millis() - start < 60000) {
    size_t n = stream->readBytes(buf + got, size - got);
    if (n == 0) delay(5);
    got += n;
  }
  http.end();
  if (got != (size_t)size) {
    free(buf);
    return nullptr;
  }
  len = got;
  return buf;
}

// --- BMP: uncompressed, 1-bit (index 0 black, 1 white) or 24-bit BGR, rows bottom-up ---
struct Bmp {
  int32_t width, height;
  uint16_t bpp;
  uint32_t offset, rowBytes;
  bool bottomUp;
};

static uint32_t rd32(const uint8_t* p) { return p[0] | (p[1] << 8) | (p[2] << 16) | ((uint32_t)p[3] << 24); }
static uint16_t rd16(const uint8_t* p) { return p[0] | (p[1] << 8); }

static bool parseBmp(const uint8_t* b, size_t len, Bmp& bmp) {
  if (len < 54 || b[0] != 'B' || b[1] != 'M' || rd32(b + 30) != 0) return false;
  bmp.offset = rd32(b + 10);
  bmp.width = (int32_t)rd32(b + 18);
  int32_t h = (int32_t)rd32(b + 22);
  bmp.bottomUp = h > 0;
  bmp.height = abs(h);
  bmp.bpp = rd16(b + 28);
  bmp.rowBytes = ((bmp.width * bmp.bpp + 31) / 32) * 4;
  return (bmp.bpp == 1 || bmp.bpp == 24) && bmp.offset + bmp.rowBytes * bmp.height <= len;
}

// The hub already dithered to the panel's palette, so every pixel is exactly one of its colours.
static uint16_t panelColour(uint8_t r, uint8_t g, uint8_t b) {
#if defined(PANEL_SPECTRA6_730)
  if (r > 128 && g > 128 && b > 128) return GxEPD_WHITE;
  if (r > 128 && g > 128) return GxEPD_YELLOW;
  if (r > 128) return GxEPD_RED;
  if (g > 128) return GxEPD_GREEN;
  if (b > 128) return GxEPD_BLUE;
  return GxEPD_BLACK;
#else
  return (r + g + b) > 382 ? GxEPD_WHITE : GxEPD_BLACK;
#endif
}

static uint16_t pixelAt(const uint8_t* buf, const Bmp& bmp, int x, int y) {
  const uint8_t* row = buf + bmp.offset + (bmp.bottomUp ? bmp.height - 1 - y : y) * bmp.rowBytes;
  if (bmp.bpp == 1) return (row[x >> 3] & (0x80 >> (x & 7))) ? GxEPD_WHITE : GxEPD_BLACK;
  return panelColour(row[x * 3 + 2], row[x * 3 + 1], row[x * 3]);
}

static void draw(const uint8_t* buf, const Bmp& bmp) {
  int w = min<int>(bmp.width, display.width());
  int h = min<int>(bmp.height, display.height());
  display.setFullWindow();
  display.firstPage();
  do {
    display.fillScreen(GxEPD_WHITE);
    for (int y = 0; y < h; y++)
      for (int x = 0; x < w; x++) display.drawPixel(x, y, pixelAt(buf, bmp, x, y));
  } while (display.nextPage());
  display.hibernate();
}

void setup() {
  Serial.begin(115200);
#ifdef EPD_SCK
  SPI.begin(EPD_SCK, -1, EPD_MOSI, EPD_CS);
#endif
  display.init(115200, true, 2, false);
  display.setRotation(ROTATION);

  if (!connectWifi()) sleepFor(RETRY_SECONDS);

  String url = String(HUB_URL) + "/of/v1/display?format=bmp&palette=" PALETTE "&fw=" FW_VERSION;
  url += "&w=" + String(display.width()) + "&h=" + String(display.height());
  url += "&rssi=" + String(WiFi.RSSI());
  int battery = batteryPercent();
  if (battery >= 0) url += "&battery=" + String(battery);
  if (currentId[0]) url += "&current=" + String(currentId);

  HTTPClient http;
  http.begin(url);
  http.addHeader("Authorization", "Bearer " FRAME_TOKEN);
  int code = http.GET();
  if (code != 200) {
    Serial.printf("Hub answered %d\n", code);
    http.end();
    sleepFor(RETRY_SECONDS);
  }
  JsonDocument reply;
  DeserializationError err = deserializeJson(reply, http.getString());
  http.end();
  if (err) sleepFor(RETRY_SECONDS);

  uint32_t nextPoll = reply["next_poll_s"] | RETRY_SECONDS;
  if (reply["action"] == "show") {
    size_t len = 0;
    uint8_t* buf = download(reply["image_url"].as<String>(), len);
    Bmp bmp;
    if (buf && parseBmp(buf, len, bmp)) {
      draw(buf, bmp);
      strlcpy(currentId, reply["id"] | "", sizeof(currentId));
    } else {
      hubLog("error", "image download or decode failed");
    }
    free(buf);
  }
  sleepFor(nextPoll);
}

void loop() {}
