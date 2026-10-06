# BLOOMIN8 E-Ink Canvas

The original target of the hub, with the most complete support: it talks to the Canvas's own local REST API, with no cloud involved.

## Adding it

- **Search the network** finds Canvases with mDNS and a subnet scan. Wake them first: they don't answer while asleep.
- Or **Add manually → BLOOMIN8** with its IP address. You can add it while it's asleep; the details fill in on first contact.

## Push or pull

| | Push | Scheduled pull (recommended) |
| --- | --- | --- |
| How | The hub uploads to the Canvas (`/upload?show_now=1`) | The Canvas wakes at the time the hub gives it, calls `GET /eink_pull`, downloads the picture and sleeps |
| Speed | Instant, if awake | At the next wake |
| Battery | The Canvas must be awake (or woken over Bluetooth) | Best: it only wakes when there is something new |

To switch to pull: wake the Canvas, open it, go to **Mode → Scheduled pull** and **Save**. Make sure the [local URL](/guide/addresses) is reachable from the Canvas.

## Bluetooth wake

The hub (Linux host with BlueZ) or your phone (Chrome/Edge over HTTPS) can wake a sleeping Canvas over Bluetooth, on demand or automatically before each send. See [Bluetooth wake](/guide/bluetooth).

## On the Canvas

The **On the Canvas** tab manages the frame's own galleries and playlists. **Settings** changes its sleep time and idle timeout. Pictures the hub pushes go to a `hub` gallery that is trimmed to the latest 20.

## Pictures

The hub sends baseline JPEGs at the panel's native resolution (portrait buffer; landscape pictures are rotated 90° or 270° into it) and lets the Canvas dither them itself.

References: [BLOOMIN8 API](https://bloomin8.readme.io/), [Home Assistant integration and OpenAPI spec](https://github.com/ARPOBOT-BLOOMIN8/eink_canvas_home_assistant_component).
