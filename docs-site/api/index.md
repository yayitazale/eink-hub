# API

The hub has two kinds of HTTP endpoints. Both are described in [`openapi.yaml`](/openapi.yaml), which you can browse in the [interactive reference](/api/reference).

## Device endpoints (stable)

What frames call. They don't use the web session: each frame authenticates with its own token, shown on its **Connection** tab (DIY, TRMNL) or set up by the hub (BLOOMIN8).

| Endpoint | For | Docs |
| --- | --- | --- |
| `GET /of/v1/display`, `POST /of/v1/log` | DIY frames | [Open Frame protocol](/diy/protocol) |
| `GET /api/setup`, `GET /api/display`, `POST /api/log` | TRMNL firmware | [TRMNL](/devices/trmnl) |
| `GET /eink_pull`, `GET /eink_signal` | BLOOMIN8 in pull mode | [BLOOMIN8](/devices/bloomin8) |
| `GET /u/img/{token}/{file}` | Picture downloads (pull frames, SwitchBot's cloud) | |

These are versioned (`/of/v1/`) or follow the device makers' protocols, so firmware you write against them keeps working.

## Management endpoints

Everything else under `/api/` is what the web UI uses: frames, library, collections, schedules, Immich and settings. They need a session cookie from `POST /api/auth/login`, unless the hub runs with `AUTH_DISABLED=true`.

You can script the hub with them, for example to send a photo from a Home Assistant automation:

```bash
# Log in once and keep the cookie
curl -c hub.cookie -H 'content-type: application/json' \
  -d '{"password":"…"}' http://192.168.1.10:8080/api/auth/login

# Upload a photo, then show it on frame 1
curl -b hub.cookie -F file=@photo.jpg http://192.168.1.10:8080/api/images
curl -b hub.cookie -H 'content-type: application/json' \
  -d '{"imageId": 42, "fit": "cover"}' http://192.168.1.10:8080/api/frames/1/display
```

They are not versioned yet and can change between releases. Check the [changelog](https://github.com/yayitazale/eink-hub/blob/main/CHANGELOG.md) when you upgrade.
