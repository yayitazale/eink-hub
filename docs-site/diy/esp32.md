# ESP32 example

A battery-friendly frame with an ESP32 and an e-paper panel, written with Arduino + PlatformIO. It wakes, asks the hub, redraws only when there is a new picture, and deep-sleeps for as long as the hub says (a few µA in between).

The code is in [`examples/esp32-openframe`](https://gitlab.com/yayitazale/eink-hub/-/tree/main/examples/esp32-openframe).

## Hardware

- An ESP32 (any classic dev board). Use an **ESP32-S3 with PSRAM** for colour panels: a 24-bit 800×480 picture is about 1.1 MB.
- An e-paper panel [GxEPD2](https://github.com/ZinggJM/GxEPD2) supports, plus its driver board. The example is set up for:
  - 7.5″ 800×480 black & white (GDEY075T7 / Waveshare 7.5″ V2), the default;
  - 7.3″ 800×480 Spectra 6 (GDEP073E01 / Waveshare 7.3″ E).
- Optional: a LiPo with a voltage divider into an ADC pin (battery level), and a button on an RTC pin (check now).

Ready-made boards such as the Waveshare PhotoPainter or Seeed reTerminal E100x can also run [TRMNL firmware](/devices/trmnl) instead.

## Set up

1. In the hub: **Add Canvas → Add manually → DIY frame** with your panel's size. Copy the **endpoint** and **token** from the **Connection** tab.
2. Copy `include/config.example.h` to `include/config.h` and fill it in:

<<< ../../examples/esp32-openframe/include/config.example.h{c}

3. Flash and watch it:

```bash
pio run -e esp32 -t upload && pio device monitor
```

The first poll shows the hub's welcome picture. Give the frame a collection under **Schedule** and it starts rotating.

## How the code works

- The frame asks for `format=bmp` with `palette=bw` (or `spectra6`), so the **hub does the dithering**. A BMP needs no decoder: each 1-bit pixel is black or white, and each 24-bit pixel is exactly one of the panel's six colours.
- The `id` of the picture on screen is kept in RTC memory (`RTC_DATA_ATTR`) and sent back as `current`, so a reset never redraws the same picture.
- Errors (no Wi-Fi, hub down) make it sleep `RETRY_SECONDS` and try again. A failed download is reported to the hub's log with `POST /of/v1/log`.

<<< ../../examples/esp32-openframe/src/main.cpp{cpp}
