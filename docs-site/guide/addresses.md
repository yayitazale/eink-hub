# Hub addresses

The hub has up to two addresses, both set in **Settings** (or as environment variables).

## Local URL (`LOCAL_URL`)

The address frames on your LAN use to reach the hub, e.g. `http://192.168.1.10:8080`. It is needed by every frame that downloads pictures by itself: BLOOMIN8 in pull mode, TRMNL firmware and DIY frames.

When it is not set, the hub guesses it from the address you browse it at, or from the machine's LAN IP. It can't be `localhost`: the frame must be able to reach it. `PUBLIC_URL` is still accepted as its old name.

## External URL (`EXTERNAL_URL`)

Optional. The address people use to open the hub from outside, through a reverse proxy or Tailscale, e.g. `https://hub.example.com`.

- The QR code on the welcome picture opens it (otherwise the local URL).
- **SwitchBot frames need it, with https.** SwitchBot's cloud downloads each photo from the hub over the internet. See [SwitchBot](/devices/switchbot#public-address).

## Exposing the hub safely

Everything under `/api/` needs a logged-in session, except the device endpoints, which use their own per-frame tokens:

| Path | Used by | Auth |
| --- | --- | --- |
| `/eink_pull`, `/eink_signal` | BLOOMIN8 scheduled pull | `X-Access-Token` header |
| `/of/v1/*` | DIY frames (Open Frame) | `Authorization: Bearer <token>` |
| `/api/setup`, `/api/display`, `/api/log` | TRMNL firmware | `ID` (MAC) / `Access-Token` headers |
| `/u/img/<token>/<file>` | Picture downloads | Unguessable per-frame token in the URL |

If you only need SwitchBot to reach the hub from outside, you can expose just `/u/img/` on your reverse proxy.

::: tip Tailscale Funnel
`tailscale funnel 8080` gives the hub a public `https://<machine>.<tailnet>.ts.net` address without opening ports on your router. Use it as the external URL.
:::
