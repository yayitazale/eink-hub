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

| Frame | How the hub talks to it | Status |
| --- | --- | --- |
| [BLOOMIN8 E-Ink Canvas](/devices/bloomin8) | Local API on your LAN, push or scheduled pull, Bluetooth wake | ✅ Full support |
| [SwitchBot AI Art Frame](/devices/switchbot) | SwitchBot's official cloud API | ✅ Supported (needs a public https address) |
| [TRMNL, Waveshare PhotoPainter, Seeed reTerminal…](/devices/trmnl) | The hub acts as their TRMNL "BYOS" server | ✅ Supported |
| [Your own ESP32 / Raspberry Pi frame](/diy/) | [Open Frame protocol](/diy/protocol) | ✅ Supported |
| [Aura, Reflection](/devices/unsupported) | No usable API | ❌ Not possible today |

## Up and running in two minutes

```bash
mkdir eink-hub && cd eink-hub
curl -O https://gitlab.com/yayitazale/eink-hub/-/raw/main/docker-compose.yml
curl -o .env https://gitlab.com/yayitazale/eink-hub/-/raw/main/.env.example
docker compose up -d
```

Open `http://<your-server>:8080`, choose an admin password and add your first frame. No hardware yet? **Add Canvas → Simulated Canvas** gives you a virtual frame to try everything.

[Read the full guide →](/guide/getting-started)
