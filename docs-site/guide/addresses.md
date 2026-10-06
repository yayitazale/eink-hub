# Hub addresses

The hub has up to two addresses, both set in **Settings** (or as environment variables).

## Local URL (`LOCAL_URL`)

The address frames on your LAN use to reach the hub, e.g. `http://192.168.1.10:8080`. It is needed by every frame that downloads pictures by itself: BLOOMIN8 in pull mode, TRMNL firmware and DIY frames.

When it is not set, the hub guesses it from the address you browse it at, or from the machine's LAN IP. It can't be `localhost`: the frame must be able to reach it. `PUBLIC_URL` is still accepted as its old name.

## External URL (`EXTERNAL_URL`)

Optional. The address people use to open the hub from outside, through a reverse proxy or Tailscale, e.g. `https://hub.example.com`.

- The QR code on the welcome picture opens it (otherwise the local URL).
- **SwitchBot frames** download photos from it (it must be https), unless you set the address below.

## Public address for cloud frames (`CLOUD_URL`)

Optional. Where SwitchBot's cloud downloads photos from, when it isn't the external URL. Use it when you expose **only** `/u/img/` on a separate public address, e.g. `https://hub.example.ts.net:8443` with Tailscale Funnel, while the UI stays private. See [option 3](#_3-expose-it-to-the-internet-only-for-switchbot).

## Local, remote, or exposed

The hub is designed to **run only on your local network**. That's enough for BLOOMIN8, TRMNL and DIY frames: they all talk to it over your LAN, and nothing has to be reachable from the internet.

From there, pick only what you need:

### 1. Local only (default)

Open `http://<server-ip>:8080` from home. Nothing to set up, nothing exposed.

### 2. Reach the UI from outside, privately

To manage your frames from your phone while away, put the hub behind something that only **you** can reach:

- **[Tailscale Serve](https://tailscale.com/kb/1312/serve)**: `tailscale serve --bg 8080` publishes the hub as `https://<machine>.<tailnet>.ts.net` to the devices in your tailnet only. You also get https, which the phone's Bluetooth wake needs.
- **A reverse proxy on your LAN or VPN** (Caddy, Nginx Proxy Manager, Traefik…) with a certificate.

Set that address as the **external URL** so the QR code on the frames opens it. The hub still isn't on the public internet.

### 3. Expose it to the internet (only for SwitchBot)

[SwitchBot](/devices/switchbot) is the one case that needs the internet: SwitchBot's cloud downloads each photo from the hub, so the hub must be reachable at a **public https address**. Expose **only what's needed**:

- **[Tailscale Funnel](https://tailscale.com/kb/1223/funnel)** on its own port. Funnel makes a whole port public, so keep the UI on Tailscale Serve (port 443, option 2) and publish only the pictures on port 8443:

  ```bash
  tailscale funnel --bg --https=8443 --set-path /u/img http://127.0.0.1:8080/u/img
  ```

  Then set **public address for cloud frames** to `https://<machine>.<tailnet>.ts.net:8443`.
- **A reverse proxy** forwarding only `/u/img/*` to the hub, e.g. with Caddy:

  ```caddyfile
  photos.example.com {
    handle /u/img/* {
      reverse_proxy 192.168.1.10:8080
    }
    respond 404
  }
  ```

- A **Cloudflare Tunnel** with the same path rule.

Set the public https address as the **public address for cloud frames** (or as the external URL, if that one is public anyway). Picture URLs contain a long random token per frame, so nobody can list or guess your photos.

### What each path is for

If you ever do expose more, this is what each path does and how it's protected:

| Path | Used by | Auth |
| --- | --- | --- |
| `/` and `/api/*` | The web UI | Admin password (session cookie) |
| `/u/img/<token>/<file>` | Picture downloads (pull frames, SwitchBot's cloud) | Unguessable per-frame token in the URL |
| `/eink_pull`, `/eink_signal` | BLOOMIN8 scheduled pull | `X-Access-Token` header |
| `/of/v1/*` | DIY frames (Open Frame) | `Authorization: Bearer <token>` |
| `/api/setup`, `/api/display`, `/api/log` | TRMNL firmware | `ID` (MAC) / `Access-Token` headers |

Frames only need the device paths, and only on the LAN. The web UI should never be on the public internet without a VPN or an authenticating proxy in front.
