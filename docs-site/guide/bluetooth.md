# Bluetooth wake

BLOOMIN8 Canvases spend most of their time in deep sleep, with Wi-Fi off. The
official app wakes them over Bluetooth Low Energy; the hub can do the same, so
you do not have to press the button on the back.

There are two ways, and you can use both:

- **From the hub (server Bluetooth):** the **Wake** button on a Canvas, and
  optionally *automatic wake* before sending photos or actions. Needs a Linux
  host with a Bluetooth adapter within range of the frames.
- **From your phone (Web Bluetooth):** the **Wake with this phone** button wakes
  the Canvas with the Bluetooth of the device you are holding. Needs Chrome or
  Edge, and the hub opened over HTTPS.

## What the wake does

The hub connects to the Canvas over BLE, writes `0x01` and then `0x00` to
characteristic `0xF001` of service `0xF000`, and disconnects: the same pulse the
official app and the [Home Assistant integration](https://github.com/ARPOBOT-BLOOMIN8/eink_canvas_home_assistant_component)
send. Wi-Fi comes up a few seconds later; the hub waits up to ~25 s for the
Canvas to answer and then refreshes its status.

A Canvas that already answers over Wi-Fi is not pulsed. The Bluetooth address
is read from the Canvas (`bt_mac` in `/deviceInfo`) the first time it connects,
and can be edited in **Settings** of the Canvas.

## Compatibility

### From the hub

| Host | Status | Notes |
| --- | --- | --- |
| Linux with BlueZ (Debian, Ubuntu, Raspberry Pi OS, mini-PC…) | ✅ Supported | Mount `/run/dbus` (below). Built-in or USB adapter. Can share the adapter with a Home Assistant Container on the same host. |
| Unraid, TrueNAS SCALE, VM with USB Bluetooth passthrough | ⚠️ Should work | Needs BlueZ (`bluetoothd`) running on that host or VM. |
| Proxmox LXC, rootless Docker or Podman | ⚠️ Advanced | The container must reach the host's system D-Bus, and BlueZ's D-Bus policy must allow it (it allows root by default). |
| Synology / QNAP NAS | ❌ Not supported | No BlueZ for USB dongles on the host. Use the phone, or run the hub on another machine. |
| Docker Desktop on Windows or macOS | ❌ Not supported | Containers run in a VM without access to the host's Bluetooth. Use the phone. |

### From the phone (or computer browser)

| Browser | Status |
| --- | --- |
| Chrome / Edge on Android | ✅ Supported |
| Chrome / Edge on Windows, macOS, Linux, ChromeOS | ✅ Supported |
| Any browser on iPhone / iPad | ❌ No Web Bluetooth (third-party browsers such as Bluefy do support it) |
| Firefox, Safari | ❌ No Web Bluetooth |

Browsers only allow Web Bluetooth on **secure pages**: open the hub over
`https://` (reverse proxy, Tailscale HTTPS…, typically your `EXTERNAL_URL`) or on
`localhost`. On a plain `http://192.168.x.x:8080` address the button is hidden
and the Canvas **Settings** explain why.

Web Bluetooth does not expose addresses, so the browser shows a list of nearby
Canvases and you pick the one in front of you.

## Setting up the hub (Linux)

1. Check Bluetooth works on the host:

   ```bash
   bluetoothctl show
   ```

   It should list a controller with `Powered: yes`. If not, `sudo systemctl enable --now bluetooth` and `bluetoothctl power on`.

2. Uncomment the D-Bus mount in `docker-compose.yml`:

   ```yaml
   volumes:
     - ./data:/data
     - /run/dbus:/run/dbus:ro
   ```

3. Recreate the container: `docker compose up -d`.

4. Open a Canvas → **Settings** → *Bluetooth*. It should say the hub can wake
   Canvases, and name the adapter (`hci0`).

No `privileged` mode, extra capabilities or packages are needed: the hub talks
to the host's BlueZ through D-Bus, the same way Home Assistant Container does.
`network_mode: host` is not required for Bluetooth.

To turn the feature off entirely, set `BLE_DISABLED=true` in `.env`.

### Automatic wake

With **Wake automatically before sending** on (per Canvas, off by default), when
the Canvas does not answer the hub wakes it and retries once:

- sending a photo (instead of queueing it for the next wake),
- the frame actions (next, clear, reboot…) and device settings,
- the push-mode rotation, only when there is a photo to send.

Status polling never wakes a Canvas. If a background wake fails (out of range,
flat battery), the scheduler leaves that Canvas alone for 15 minutes.

Every wake keeps Wi-Fi on for the Canvas's *idle time* (Settings → device), so
it costs battery. For frames in **pull** mode the scheduled wake-ups are usually
enough; automatic wake is most useful for **push** frames and for sending a photo
right away.

## Troubleshooting

| Message | What to do |
| --- | --- |
| *mount /run/dbus into the container* | Step 2 above, or the host is not Linux. |
| *D-Bus but not BlueZ* | `sudo systemctl status bluetooth` on the host. |
| *adapter is off* | `bluetoothctl power on`. |
| *not found over Bluetooth (out of range?)* | Move the adapter closer (BLE reaches ~10 m indoors, less through walls), or use a USB extension for the dongle. `bluetoothctl scan le` should list the Canvas. |
| *did not answer over Wi-Fi* | The pulse arrived but Wi-Fi did not come up in time: check the Canvas is on your Wi-Fi and its IP has not changed, then try again. |

Server logs mention `bluetooth auto-wake` when a background wake fails.
