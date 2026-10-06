# Third-party notices

E-Ink Hub is MIT-licensed (see [LICENSE](LICENSE)). It is built on open-source
components that keep their own licenses; the full list of npm dependencies and
their licenses is in `package-lock.json` and each package's `node_modules`
folder.

Components shipped inside the Docker image or the web bundle that are worth
calling out:

| Component | License | Where |
| --- | --- | --- |
| [Manrope](https://github.com/sharanda/manrope) (via `@fontsource-variable/manrope`) | SIL Open Font License 1.1 | Web UI font |
| [Inter](https://rsms.me/inter/) (Debian `fonts-inter`) | SIL Open Font License 1.1 | Text drawn on photos |
| [sharp](https://sharp.pixelplumbing.com/) / libvips | Apache-2.0 / LGPL-3.0-or-later | Image processing |
| [Lucide](https://lucide.dev/) (`lucide-react`) | ISC | Icons |
| [Node.js](https://nodejs.org/) and Debian base image | MIT and various | Runtime |

BLOOMIN8 and Immich are trademarks of their respective owners. This project is
not affiliated with or endorsed by them; it only talks to their documented
local APIs.
