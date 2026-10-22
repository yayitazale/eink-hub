#!/usr/bin/env python3
"""Open Frame example: Raspberry Pi + Pimoroni Inky (Impression, wHAT, pHAT…).

Polls E-Ink Hub, shows new pictures and sleeps for as long as the hub says. Because a Pi is
usually on mains power it also listens for the hub's nudge (notify_url), so photos you send
by hand appear within seconds instead of at the next poll.

Protocol: https://yayitazale.github.io/eink-hub/diy/protocol
"""
import io
import os
import shutil
import socket
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import requests
from inky.auto import auto
from PIL import Image

HUB_URL = os.environ["HUB_URL"].rstrip("/")  # e.g. http://192.168.1.10:8080
TOKEN = os.environ["FRAME_TOKEN"]
NOTIFY_PORT = int(os.environ.get("NOTIFY_PORT", "8765"))  # 0 disables the nudge listener
SATURATION = float(os.environ.get("INKY_SATURATION", "0.5"))
RETRY_S = 300

AUTH = {"Authorization": f"Bearer {TOKEN}"}
wake = threading.Event()
inky = auto()
current = None  # id of the picture on screen


def lan_ip() -> str:
    # The address the hub can reach us at: the one used to route towards it.
    host = HUB_URL.split("//", 1)[1].split("/")[0].split(":")[0]
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        s.connect((host, 80))
        return s.getsockname()[0]


def wifi_ssid() -> str:
    # wireless-tools (iwgetid) on older Raspberry Pi OS, NetworkManager (nmcli) on Bookworm and later.
    for cmd in (["iwgetid", "-r"], ["nmcli", "-t", "-f", "active,ssid", "dev", "wifi"]):
        try:
            out = subprocess.run(cmd, capture_output=True, text=True, timeout=5).stdout
        except (OSError, subprocess.SubprocessError):
            continue
        if cmd[0] == "nmcli":
            out = next((line[4:] for line in out.splitlines() if line.startswith("yes:")), "")
        if out.strip():
            return out.strip()
    return ""


class Nudge(BaseHTTPRequestHandler):
    """The hub POSTs here (with our token) when there is something new."""

    def do_POST(self):
        ok = self.headers.get("Authorization") == AUTH["Authorization"]
        self.send_response(204 if ok else 401)
        self.end_headers()
        if ok:
            wake.set()

    def log_message(self, *args):
        pass


def poll() -> int:
    global current
    params = {
        "w": inky.width,
        "h": inky.height,
        # Full-colour PNG: the inky library dithers it with its own tuned palette.
        "format": "png",
        "fw": "rpi-inky-1.1",
        # Shown on the frame's page in the hub (Wi-Fi, address, free space on the SD card).
        "ip": lan_ip(),
    }
    ssid = wifi_ssid()
    if ssid:
        params["ssid"] = ssid
    disk = shutil.disk_usage("/")
    params["storage_free"], params["storage_total"] = disk.free, disk.total
    if current:
        params["current"] = current
    if NOTIFY_PORT:
        params["notify_url"] = f"http://{lan_ip()}:{NOTIFY_PORT}/of/v1/notify"
    reply = requests.get(f"{HUB_URL}/of/v1/display", params=params, headers=AUTH, timeout=20).json()
    if reply["action"] == "show":
        png = requests.get(reply["image_url"], timeout=60).content
        image = Image.open(io.BytesIO(png)).convert("RGB")
        try:
            inky.set_image(image, saturation=SATURATION)
        except TypeError:  # black/white and red/yellow Inkys take no saturation
            inky.set_image(image)
        inky.show()
        current = reply["id"]
        print(f"showing {current}", flush=True)
    return int(reply["next_poll_s"])


def main():
    if NOTIFY_PORT:
        server = HTTPServer(("0.0.0.0", NOTIFY_PORT), Nudge)
        threading.Thread(target=server.serve_forever, daemon=True).start()
    while True:
        try:
            delay = poll()
        except Exception as err:  # network down, hub restarting…
            print(f"poll failed: {err}", flush=True)
            delay = RETRY_S
        wake.wait(timeout=delay)
        wake.clear()


if __name__ == "__main__":
    main()
