---
layout: home

hero:
  name: E-Ink Hub
  text: Your photos on e-paper, on your terms.
  tagline: A self-hosted control center for e-ink photo frames. One small Docker container, your own server, your Immich library. No subscriptions, no vendor cloud in the middle (unless the frame needs one).
  image:
    src: /logo.png
    alt: E-Ink Hub
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Supported frames
      link: /devices/
    - theme: alt
      text: Build your own
      link: /diy/

features:
  - icon: 🖼️
    title: Exact previews
    details: See exactly what the panel will show before sending. Smart crop that finds the subject, manual crop, fit with a border or a blurred background, and an optional date caption.
  - icon: 📚
    title: Immich, natively
    details: Collections that stay in sync with an Immich album, a person, your favourites, a smart (CLIP) search or "on this day" memories. Or just upload photos.
  - icon: 🗓️
    title: Rotation that respects the battery
    details: Every hour, every morning at 7, every Monday… with active hours. Frames sleep until the next change and wake exactly when there is something new.
  - icon: 🔋
    title: Built for battery frames
    details: Pull mode lets frames sleep for days. Photos sent while a frame sleeps are queued. BLOOMIN8 frames can be woken over Bluetooth from the server or your phone.
  - icon: 🧩
    title: More than one brand
    details: BLOOMIN8 over the LAN, SwitchBot AI Art Frame through its cloud, anything running TRMNL firmware, and DIY frames through an open protocol.
  - icon: 🛠️
    title: Open and DIY-friendly
    details: A tiny documented protocol, ready-made ESP32 and Raspberry Pi examples, and hub-side dithering to black & white, 4 greys, Spectra 6 or ACeP 7 colours.
---

## Which frames work?

| Frame | Integration | How the hub talks to it | Status |
| --- | --- | --- | --- |
| [BLOOMIN8 E-Ink Canvas](/devices/bloomin8) | 🏠 Local | Local API on your LAN, push or scheduled pull, Bluetooth wake | ✅ Full support |
| [SwitchBot AI Art Frame](/devices/switchbot) | ☁️ Cloud | SwitchBot's official cloud API | ✅ Supported (needs a public https address) <Badge type="warning" text="not tested" /> |
| [TRMNL, Waveshare PhotoPainter, Seeed reTerminal…](/devices/trmnl) | 🏠 Local | The hub acts as their TRMNL "BYOS" server | ✅ Supported <Badge type="warning" text="not tested" /> |
| [Your own ESP32 / Raspberry Pi frame](/diy/) | 🏠 Local | [Open Frame protocol](/diy/protocol) | ✅ Supported <Badge type="warning" text="not tested" /> |
| [Aura](/devices/unsupported#aura-frames) | ☁️ Cloud | Unofficial, reverse-engineered API only | ❌ Not supported |
| [Reflection](/devices/unsupported#reflection-frame) | 📱 NFC | Tap-to-print from a phone, no API | ❌ Not possible |

**Local** frames talk to the hub over your network only and keep working without internet. **Cloud** frames go through the manufacturer's servers.

## A quick look

![My Canvases: every frame with its current photo, battery and status](/screenshots/canvases.webp)

<div class="screenshots">

![A Canvas: device details and its schedule](/screenshots/canvas.webp)

![Browsing an Immich album, filtered to landscape photos](/screenshots/immich.webp)

![Schedule: what each Canvas shows and when it changes](/screenshots/schedule.webp)

</div>

<style>
.screenshots {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  align-items: start;
}
.screenshots p { margin: 0; }
.vp-doc img[src*="/screenshots/"] {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
}
@media (max-width: 640px) {
  .screenshots { grid-template-columns: 1fr; }
}
</style>

## Up and running in two minutes

```bash
mkdir eink-hub && cd eink-hub
curl -O https://raw.githubusercontent.com/yayitazale/eink-hub/main/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/yayitazale/eink-hub/main/.env.example
docker compose up -d
```

Open `http://<your-server>:8080`, choose an admin password and add your first frame. No hardware yet? **Add Canvas → Simulated Canvas** gives you a virtual frame to try everything.

[Read the full guide →](/guide/getting-started)

---

::: info 🤖 Built with Claude
This project has been developed together with [Claude](https://claude.ai).
:::
