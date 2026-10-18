# TRMNL firmware <Badge type="warning" text="not tested" />

::: warning Not tested on real hardware
This integration follows the published protocol and is covered by automated tests, but hasn't been tried on a real device yet. Reports are welcome in the [issues](https://github.com/yayitazale/eink-hub/issues).
:::

[TRMNL](https://usetrmnl.com) is an e-ink device whose open-source firmware can talk to your own server ("Bring Your Own Server", [BYOS](https://docs.trmnl.com/go/diy/byos)). The hub implements that server, so anything running TRMNL firmware works without writing any code:

- TRMNL itself
- [Waveshare ESP32-S3 PhotoPainter](https://github.com/paveldn/trmnl-PhotoPainter) with the TRMNL port
- Seeed reTerminal E1001 / E1002
- Any ESP32 + e-paper board the firmware supports

## How it works

1. The device wakes, calls `GET /api/display` with its MAC (`ID`) and token (`Access-Token`), battery voltage, signal and screen size.
2. The hub answers with `image_url`, a `filename` and `refresh_rate` (seconds to sleep).
3. If the filename changed, the device downloads and draws the picture, then sleeps `refresh_rate` seconds.

`refresh_rate` is the time to the next scheduled change, capped by the frame's **longest sleep** (60 minutes by default). When nothing changed the hub returns the same filename, so the device doesn't redraw and the battery lasts.

## Adding it

1. In the hub: **Add Canvas → Add manually → TRMNL** with the device's **MAC address** (it's on the device's setup screen).
2. On the device's Wi-Fi setup portal, choose a **custom server** and enter the hub's local URL, e.g. `http://192.168.1.10:8080`. The **Connection** tab shows it.
3. The device calls `/api/setup`, gets its token and starts showing pictures.

Only devices added in the hub get a token: a TRMNL on your network can't register itself.

## Pictures

By default the hub sends **1-bit BMPs** at the device's resolution, dithered in the hub (what the stock firmware draws). For colour or greyscale panels pick another format under **Connection**, e.g. PNG dithered to Spectra 6 colours, if your firmware build supports it.
