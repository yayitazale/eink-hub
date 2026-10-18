# Raspberry Pi example

A Raspberry Pi (Zero 2 W or newer) with a [Pimoroni Inky](https://shop.pimoroni.com/collections/inky) display: Inky Impression (Spectra 6 or 7-colour, 4″ to 13.3″), Inky wHAT or pHAT. It's a ~100-line Python script.

The code is in [`examples/rpi-inky`](https://github.com/yayitazale/eink-hub/tree/main/examples/rpi-inky).

Since a Pi is usually plugged in, this example also uses the **nudge**: it tells the hub a `notify_url`, and the hub pokes it whenever you send a photo, so it shows up within seconds.

## Set up

1. Enable SPI and I2C (`sudo raspi-config` → Interface options) and install the Inky library:

```bash
mkdir -p ~/openframe && cd ~/openframe
python3 -m venv .venv
.venv/bin/pip install "inky[rpi]" pillow requests
curl -O https://raw.githubusercontent.com/yayitazale/eink-hub/main/examples/rpi-inky/openframe.py
```

2. In the hub: **Add Canvas → Add manually → DIY frame** with the display's resolution (e.g. 800×480). Copy the **token** from **Connection**.
3. Try it:

```bash
HUB_URL=http://192.168.1.10:8080 FRAME_TOKEN=… .venv/bin/python openframe.py
```

4. Run it at boot with systemd:

<<< ../../examples/rpi-inky/openframe.service{ini}

```bash
sudo cp openframe.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now openframe
```

## How the code works

- It asks for a full-colour **PNG** at the display's size and lets the `inky` library dither it, because the library's palettes are tuned for each panel's real inks.
- It waits `next_poll_s` seconds, or less if the hub's nudge arrives on `NOTIFY_PORT` (8765 by default). Set `NOTIFY_PORT=0` to turn the listener off.
- On a battery-powered Pi you'd rather shut down between polls: replace the loop with a single `poll()` and a wake-up timer (e.g. a [Witty Pi](https://www.uugear.com/product/witty-pi-4/) or PiSugar) set to `next_poll_s`.

<<< ../../examples/rpi-inky/openframe.py{python}
