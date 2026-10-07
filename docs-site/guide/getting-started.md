# Getting started

E-Ink Hub is a single Docker container (Node.js + SQLite) with a web UI. It keeps your photos, renders them for each frame and delivers them on a schedule.

## Install with Docker

```bash
mkdir eink-hub && cd eink-hub
curl -O https://gitlab.com/yayitazale/eink-hub/-/raw/main/docker-compose.yml
curl -o .env https://gitlab.com/yayitazale/eink-hub/-/raw/main/.env.example
# Edit .env: LOCAL_URL is this machine's LAN address, e.g. http://192.168.1.10:8080
docker compose up -d
```

This pulls `registry.gitlab.com/yayitazale/eink-hub:latest`, the latest release. Your data (database, originals and render cache) lives in `./data`.

The compose file uses Docker's default **bridge networking**, publishing port 8080. **Search the network** finds BLOOMIN8 frames by scanning the subnet of your `LOCAL_URL`, so set it to this machine's LAN address. You can always add a frame by IP too.

::: details Optional: mDNS discovery with host networking
Multicast (mDNS) doesn't cross Docker's bridge. To also discover frames by mDNS, use host networking (Linux hosts only; Docker Desktop on Windows/macOS doesn't support it): in `docker-compose.yml` uncomment `network_mode: host` and remove the `ports` section. The hub then listens directly on the host's port 8080.
:::

Open `http://<host>:8080`, choose an admin password and you're in.

## Install on Unraid

On Unraid, install **eink-hub** from the **Apps** tab (Community Applications). It also works with Unraid's Tailscale integration. See [Unraid](/guide/unraid).

## Add a frame

**Canvas → Add Canvas** offers:

- **Search the network** for BLOOMIN8 frames (wake them first by pressing the button on the back).
- **Add manually**, choosing the kind of frame:
  - **BLOOMIN8**: by IP address.
  - **SwitchBot**: with your SwitchBot token and secret. See [SwitchBot](/devices/switchbot).
  - **TRMNL**: by MAC address. See [TRMNL firmware](/devices/trmnl).
  - **DIY frame**: you get an endpoint and a token for your firmware. See [Build your own](/diy/).
  - **Simulated Canvas**: a virtual frame inside the hub, for trying things out without hardware.

The first time a frame connects it shows a welcome picture with a QR code that opens the hub.

## Send a photo

Upload photos in **Library** (or connect [Immich](/guide/immich)), open one and press **Send**. The preview is exactly what the frame will receive. You can let the hub find the subject (smart crop), crop by hand, fit with a border or fit on a blurred background.

If the frame is asleep, the photo is queued and shown the next time it wakes.

## Rotate photos automatically

Give each frame a collection and a schedule under **Schedule**. See [Collections & schedules](/guide/schedules).

## Update

```bash
docker compose pull && docker compose up -d
```

| Image tag | What it is |
| --- | --- |
| `:latest` | The latest release (recommended) |
| `:vX.Y.Z` | A specific release, to pin a version |
| `:main` | Latest build of `main`. Untested, for trying unreleased changes |
