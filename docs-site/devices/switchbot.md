# SwitchBot AI Art Frame <Badge type="warning" text="not tested" />

::: warning Not tested on real hardware
This integration follows the published protocol and is covered by automated tests, but hasn't been tried on a real device yet. Reports are welcome in the [issues](https://gitlab.com/yayitazale/eink-hub/-/issues).
:::

The [SwitchBot AI Art Frame](https://www.switch-bot.com/products/switchbot-ai-art-frame) (7.3″, 13.3″ and 31.5″, E Ink Spectra 6) has no local API. The hub uses SwitchBot's official cloud API ([OpenAPI v1.1](https://github.com/OpenWonderLabs/SwitchBotAPI)), the same one Home Assistant's SwitchBot Cloud integration uses.

## How it works

```
hub ──uploadImage(imageUrl)──▶ SwitchBot cloud ──(next check-in)──▶ frame
 ▲                                   │
 └────────── GET imageUrl ───────────┘   (over the internet)
```

1. The hub renders the photo at the panel's size (JPEG).
2. It sends the `uploadImage` command with the picture's URL to SwitchBot's cloud.
3. **SwitchBot's cloud downloads the picture from that URL**, then passes it to the frame the next time the frame checks in.
4. Every 30 minutes the hub reads the frame's status (battery, current picture) and marks the delivery as confirmed when the frame shows it.

The hub can't wake the frame or make it check in sooner. Each call counts against your account's limit of 10,000 a day, which is far more than the hub uses.

## Public address

Because SwitchBot's servers download the photo, the hub needs an **https address reachable from the internet**. Only `/u/img/` has to be exposed: the UI can stay private. Set it in **Settings** as the **public address for cloud frames** (or use the external URL if that's already public). Some options, explained in [Hub addresses](/guide/addresses#_3-expose-it-to-the-internet-only-for-switchbot):

- [Tailscale Funnel](https://tailscale.com/kb/1223/funnel) on port 8443 for `/u/img` only, no open ports on your router.
- A reverse proxy (Caddy, Nginx Proxy Manager, Traefik…) with a certificate, forwarding only `/u/img/`.
- A Cloudflare Tunnel with the same path rule.

Picture URLs carry a long random per-frame token, so nobody can list or guess your photos.

## Adding it

1. In the SwitchBot app: **Profile → Preferences → About**, tap **App version** 10 times, then **Developer options** shows your **token** and **secret**.
2. In the hub: **Add Canvas → Add manually → SwitchBot**, paste both and press **Find my frames**.
3. Pick the frame and its size, and add it.

The token and secret are stored on the hub only and never sent back to the browser. You can replace them under **Connection**.

## Limitations

- No local control. Without internet the frame keeps its last picture.
- Only **Next** is available as an action; no sleep, reboot or on-device galleries.
- SwitchBot doesn't document the accepted image formats or sizes. The hub sends JPEGs at the panel's native size, which works.
