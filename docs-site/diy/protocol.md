# Open Frame protocol v1

A minimal HTTP protocol between a frame and E-Ink Hub. The frame always starts the conversation, so it needs no server, no open ports and no clock. It is designed for battery-powered microcontrollers.

## Pairing

In the hub: **Add Canvas → Add manually → DIY frame**. The frame's **Connection** tab shows:

- the **endpoint**, e.g. `http://192.168.1.10:8080/of/v1/display`
- the **token**, a random string unique to this frame

Put both in your firmware. Treat the token as a password.

## `GET /of/v1/display`

Called on every wake-up.

### Request

```http
GET /of/v1/display?battery=87&w=800&h=480&format=bmp&palette=bw&current=5f0c…e1 HTTP/1.1
Host: 192.168.1.10:8080
Authorization: Bearer 3rZ1kTq9yV0mWc…
```

All query parameters are optional:

| Parameter | Meaning |
| --- | --- |
| `battery` | Battery level, 0–100 (%). Shown in the hub and in its statistics |
| `rssi` | Wi-Fi signal (dBm) |
| `fw` | Your firmware version, shown in the hub |
| `w`, `h` | Panel resolution **as hung** (e.g. `800`×`480` for a landscape panel). The first poll also sets the frame's orientation |
| `format` | `jpeg`, `png` or `bmp`. Saved: you only need to send it once (or set it in the hub instead) |
| `palette` | Dither in the hub to `bw`, `gray4`, `spectra6` or `acep7`. Omit it to get full colour |
| `current` | The `id` of the picture on screen, so the hub doesn't send it again |
| `notify_url` | Always-on frames only: where the hub `POST`s when there's something new. Empty to remove it |

### Response

Always `200` with JSON (unless the token is wrong: `401`).

Nothing new:

```json
{ "action": "none", "next_poll_s": 3600 }
```

A picture to show:

```json
{
  "action": "show",
  "image_url": "http://192.168.1.10:8080/u/img/3rZ1kTq9yV0mWc…/5f0c…e1_L.bmp",
  "id": "5f0c…e1",
  "format": "bmp",
  "palette": "bw",
  "width": 800,
  "height": 480,
  "next_poll_s": 3600
}
```

| Field | Meaning |
| --- | --- |
| `action` | `show` or `none` |
| `image_url` | Picture to download. No auth needed: the token is in the URL |
| `id` | Identifies the picture. Store it and send it back as `current` |
| `format`, `palette` | What `image_url` contains |
| `width`, `height` | Its exact size in pixels, as hung (no rotation needed) |
| `next_poll_s` | Seconds to sleep before the next poll. At least 60 |

### The picture

`GET image_url` returns the file with a `Content-Length` header, no chunked encoding and no compression, so you can stream it straight into a buffer:

- **JPEG**: baseline (not progressive), sRGB, 4:4:4 chroma. Most small decoders (TJpgDec, JPEGDEC) handle it.
- **PNG**: 8-bit RGB, or indexed when dithered.
- **BMP**: uncompressed, bottom-up rows padded to 4 bytes. **1-bit** with a black (index 0) / white (index 1) colour table when `palette=bw`, **24-bit BGR** otherwise. With a palette, every pixel is exactly one of its colours:

| Palette | Colours (RGB) |
| --- | --- |
| `bw` | black `0,0,0` · white `255,255,255` |
| `gray4` | `0` · `85` · `170` · `255` (grey) |
| `spectra6` | black · white · yellow `255,255,0` · red `255,0,0` · blue `0,0,255` · green `0,255,0` |
| `acep7` | black · white · green `0,255,0` · blue `0,0,255` · red `255,0,0` · yellow `255,255,0` · orange `255,128,0` |

## `POST /of/v1/log`

Optional. Anything the frame wants in the hub's log (download errors, low battery…). It appears under **Settings → Logs** and in the frame's log download.

```http
POST /of/v1/log HTTP/1.1
Authorization: Bearer 3rZ1kTq9yV0mWc…
Content-Type: application/json

{ "level": "warn", "message": "image download failed: timeout" }
```

`level` is `info`, `warn` or `error`.

## Notification (always-on frames)

If the frame sent `notify_url`, the hub calls it whenever you send a photo or press **Clear**:

```http
POST <notify_url> HTTP/1.1
Authorization: Bearer <the frame's token>
```

The frame should answer quickly (any 2xx) and then poll `/of/v1/display`. If the notification fails, nothing is lost: the photo waits for the next regular poll.

## What the hub decides

On each poll, in this order:

1. A photo **sent by hand** (queued) is delivered.
2. The **welcome picture** (logo + QR code to the hub) on first contact, and after **Clear**.
3. The **next photo of the schedule**, if a change is due.
4. Otherwise `none`.

`next_poll_s` is the time until the next scheduled change, capped by the frame's **longest sleep** (60 minutes by default), except outside the schedule's active hours, where it's the full time to the next change. Waking early is harmless: the frame just gets `none`.

## Versioning

The path carries the version (`/of/v1/`). New optional fields may be added to requests and responses; firmware should ignore fields it doesn't know. Anything incompatible would go to `/of/v2/`.

A machine-readable spec is in the [API reference](/api/reference).
