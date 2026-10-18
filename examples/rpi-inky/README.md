# Raspberry Pi + Pimoroni Inky Open Frame example

A Raspberry Pi with a [Pimoroni Inky](https://shop.pimoroni.com/collections/inky) display as an
[E-Ink Hub](https://yayitazale.github.io/eink-hub/diy/raspberry-pi) frame. See the site for the full walkthrough.

```bash
mkdir -p ~/openframe && cd ~/openframe
python3 -m venv .venv
.venv/bin/pip install inky[rpi] pillow requests
# copy openframe.py here, then try it:
HUB_URL=http://192.168.1.10:8080 FRAME_TOKEN=… .venv/bin/python openframe.py
```

Run it as a service with `openframe.service`.
