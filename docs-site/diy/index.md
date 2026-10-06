# Build your own frame <Badge type="warning" text="not tested" />

::: warning Not tested on real hardware
This integration follows the published protocol and is covered by automated tests, but hasn't been tried on a real device yet. Reports are welcome in the [issues](https://gitlab.com/yayitazale/eink-hub/-/issues).
:::

Any microcontroller or single-board computer with Wi-Fi and an e-paper panel can be an E-Ink Hub frame. The hub does the hard parts: picking the photo, cropping, resizing, rotating, captions and, if you want, **dithering to your panel's exact colours**. Your firmware only has to download a picture and draw it.

You have two options:

- **[TRMNL firmware](/devices/trmnl)**: if your board is supported (Waveshare PhotoPainter, Seeed reTerminal, TRMNL…), flash it and point it at the hub. No code needed.
- **Open Frame protocol**: write your own firmware in a few dozen lines. Read on.

## What the frame must do

Every wake-up is the same loop:

1. **Connect to Wi-Fi.**
2. **Ask the hub** `GET {hub}/of/v1/display` with `Authorization: Bearer <token>`. Optionally say how it is: battery, resolution, format it wants.
3. If the answer is `"action": "show"`: **download `image_url`** and **draw it**. Remember its `id`.
4. **Sleep `next_poll_s` seconds** (deep sleep on an ESP32), then go back to 1.

That's all. The full contract is in [Open Frame protocol](/diy/protocol).

## Requirements

| | Minimum | Notes |
| --- | --- | --- |
| Network | Wi-Fi with HTTP | HTTPS only if your hub URL is https |
| Memory | Enough for one picture, or stream it | 800×480 1-bit BMP = 48 KB; 24-bit BMP = 1.1 MB (stream it row by row) |
| Image decoding | One of BMP, PNG or JPEG | BMP is the easiest on a microcontroller: no decoder at all |
| Clock | A timer that can wake it from deep sleep | The hub tells it how long to sleep, so no RTC or NTP needed |
| Storage | 41 bytes that survive sleep | For the `id` of the picture on screen (ESP32: `RTC_DATA_ATTR`) |

### Pick an image format

| Panel | Ask for | Why |
| --- | --- | --- |
| Black & white | `format=bmp&palette=bw` | 1-bit BMP, dithered by the hub. Draw each bit as a pixel |
| 4 greys | `format=png&palette=gray4` | Dithered to the 4 levels |
| Spectra 6 (black, white, red, yellow, blue, green) | `format=bmp&palette=spectra6` | 24-bit BMP whose every pixel is exactly one of the 6 colours: map RGB to your driver's colour index |
| ACeP / 7-colour | `format=bmp&palette=acep7` | As above, plus orange |
| Anything with a good library (Pimoroni Inky, Raspberry Pi) | `format=png` | Let the library dither it with its own tuned palette |

### Battery life

The best e-paper frames wake for a few seconds a day. Some tips:

- **Deep sleep** for `next_poll_s`. The hub sends the time until the next scheduled change, capped by the frame's *longest sleep* (60 minutes by default, set under **Connection**). Outside the schedule's active hours it sends the full time to the morning.
- **Don't redraw** when the answer is `none`. A refresh is the most expensive thing an e-paper frame does.
- **Send `current=<id>`** after a reboot, so the hub doesn't resend what's already on screen.
- **A button** wired to a wake-up pin lets you force a check without waiting.

### Always-on frames

A Raspberry Pi on mains power can also listen for a nudge: send `notify_url=http://<its-ip>:<port>/…` in each poll and the hub will `POST` to it (with the same Bearer token) whenever you send a photo by hand, so the frame polls right away. See the [Raspberry Pi example](/diy/raspberry-pi).

## Examples

- [ESP32 + e-paper (Arduino / PlatformIO)](/diy/esp32): deep sleep, BMP decoding, battery reading.
- [Raspberry Pi + Pimoroni Inky (Python)](/diy/raspberry-pi): PNG, the library's own dithering, instant updates through `notify_url`.
