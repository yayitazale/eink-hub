# Third-party notices

E-Ink Hub is MIT-licensed (see [LICENSE](LICENSE)). It is built on open-source
components that keep their own licenses; the full list of npm dependencies and
their licenses is in `package-lock.json` (and `docs-site/package-lock.json`) and
each package's `node_modules` folder.

## Shipped in the Docker image or the web bundle

| Component | License | Where |
| --- | --- | --- |
| [Manrope](https://github.com/sharanda/manrope) (via `@fontsource-variable/manrope`) | SIL Open Font License 1.1 | Web UI font |
| [Inter](https://rsms.me/inter/) (Debian `fonts-inter`) | SIL Open Font License 1.1 | Text drawn on photos |
| [sharp](https://sharp.pixelplumbing.com/) / libvips | Apache-2.0 / LGPL-3.0-or-later | Image processing |
| [Lucide](https://lucide.dev/) (`lucide-react`) | ISC | Icons |
| [node-ble](https://github.com/chrvadala/node-ble) with [`@jellybrick/dbus-next`](https://github.com/JellyBrick/node-dbus-next) | MIT | Bluetooth wake through BlueZ |
| [Node.js](https://nodejs.org/) and Debian base image | MIT and various | Runtime |

## Project website (`docs-site/`)

Not part of the Docker image; used only to build and show the documentation.

| Component | License | Where |
| --- | --- | --- |
| [VitePress](https://vitepress.dev/) (with Vue and Vite) | MIT | Site generator |
| [Scalar API Reference](https://github.com/scalar/scalar) (`@scalar/api-reference`, loaded from jsDelivr) | MIT | Interactive API reference |

## Used by the DIY examples (`examples/`)

The example code is MIT like the rest of the project. It is not included in the
Docker image; these libraries are downloaded when you build or install the
examples, under their own licenses.

| Component | License | Used by |
| --- | --- | --- |
| [GxEPD2](https://github.com/ZinggJM/GxEPD2) | GPL-3.0 | `esp32-openframe` (e-paper driver). A firmware binary you build with it is subject to the GPL |
| [ArduinoJson](https://arduinojson.org/) | MIT | `esp32-openframe` |
| [Arduino core for ESP32](https://github.com/espressif/arduino-esp32) | LGPL-2.1 | `esp32-openframe` |
| [Pimoroni Inky](https://github.com/pimoroni/inky) | MIT | `rpi-inky` |
| [Pillow](https://python-pillow.org/) | MIT-CMU | `rpi-inky` |
| [Requests](https://requests.readthedocs.io/) | Apache-2.0 | `rpi-inky` |

## Trademarks

BLOOMIN8, SwitchBot, TRMNL, Aura, Reflection, Immich, Waveshare, Seeed Studio
and reTerminal, Pimoroni and Inky, Raspberry Pi, Espressif and ESP32, E Ink,
Spectra and ACeP, Arduino, PlatformIO, Witty Pi, PiSugar, Home Assistant,
Tailscale, Cloudflare, Caddy, Nginx, Traefik, Docker, GitLab, Claude and
Anthropic are trademarks of their respective owners.

E-Ink Hub is an independent project. It is not affiliated with, sponsored or
endorsed by any of them. These names are used only to describe compatibility:
the hub talks to the devices and services through their documented APIs or
protocols.
