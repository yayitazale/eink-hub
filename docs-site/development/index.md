# Contributing

Bug reports, ideas and merge requests are welcome. The full guide is in [CONTRIBUTING.md](https://gitlab.com/yayitazale/eink-hub/-/blob/main/CONTRIBUTING.md). In short:

1. Open an [issue](https://gitlab.com/yayitazale/eink-hub/-/issues) for bugs or ideas.
2. Fork, branch from `main` and open a **merge request** against `main`.
3. Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) (`feat: …`, `fix: …`): the changelog is generated from them.
4. Make sure `npm run build` and `npm test` pass; the MR pipeline runs them too.

## Run it locally

```bash
npm install
npm run dev:server          # API on :8080 (tsx watch, data in apps/server/data)
npm run dev:web             # UI on :5173, proxies /api to :8080
npm run fake-frame          # simulated BLOOMIN8 on :8090 (add it as 127.0.0.1:8090)
npm test                    # vitest
```

This website lives in `docs-site/` (VitePress):

```bash
cd docs-site && npm install && npm run dev
```

## Adding a new kind of frame

Everything brand-specific sits behind a driver in `apps/server/src/device/drivers/`:

| File | What it is |
| --- | --- |
| `types.ts` | The `FrameDriver` interface: capabilities, wake model, image format, `info()`, `show()`, `action()` |
| `bloomin8.ts` | Local REST API, push + Bluetooth wake |
| `switchbot.ts` | Cloud API, push through the vendor's cloud |
| `pull.ts` | Frames that poll the hub (Open Frame, TRMNL) |
| `index.ts` | `driverFor(frame)` |

A **push** frame (local or cloud API) needs a driver with `info()` and `show()`. A **pull** frame needs an endpoint in `apps/server/src/upstream/` that calls `servePull()` (`lib/pull.ts`) and formats its answer. The UI adapts to the driver's `capabilities`.

## Known limitations

- Bluetooth wake is tested against a mocked BlueZ; verify it on real hardware and hosts.
- SwitchBot and TRMNL support is tested against mocks and the published protocols, not real devices yet.
- Pre-dithered uploads to BLOOMIN8 (`/image/dataUpload`) aren't used: the frame dithers JPEGs itself.
