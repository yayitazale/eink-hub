# ESP32 Open Frame example

An ESP32 + e-paper frame for [E-Ink Hub](https://yayitazale.github.io/eink-hub/diy/esp32), using the
[Open Frame protocol](https://yayitazale.github.io/eink-hub/diy/protocol). It deep-sleeps between polls
and only redraws when the hub has a new picture.

1. In the hub: **Add Canvas → Add manually → DIY frame**, and copy the endpoint and token from **Connection**.
2. Copy `include/config.example.h` to `include/config.h`, then fill in Wi-Fi, `HUB_URL`, `FRAME_TOKEN`, your panel and pins.
3. `pio run -e esp32 -t upload` (or `-e esp32s3` for a colour panel with PSRAM), then `pio device monitor`.

Libraries: [GxEPD2](https://github.com/ZinggJM/GxEPD2) for the panel, [ArduinoJson](https://arduinojson.org) for the reply.
Any panel GxEPD2 supports works: change the display class in `src/main.cpp`.
