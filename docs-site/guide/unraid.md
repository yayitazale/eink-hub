# Unraid

E-Ink Hub is in Unraid's **Community Applications** (CA), so you can install it from the **Apps** tab without writing a compose file.

## Install

1. In Unraid, open **Apps** and search for **eink-hub**.
2. Click **Install** and fill in:
   - **LOCAL_URL**: your Unraid server's LAN address and the port, e.g. `http://192.168.1.10:8080`. Frames use it to reach the hub, and **Search the network** scans its subnet.
   - Optionally **ADMIN_PASSWORD** and your **Immich** address and API key (both can also be set later in **Settings**).
3. Click **Apply**, then open the **WebUI** from the container's menu, choose an admin password and add your frames.

Your data (database, photos and render cache) lives in `/mnt/user/appdata/eink-hub`.

## Tailscale

Unraid 7 integrates [Tailscale](https://docs.unraid.net/go/tailscale-docker/) with Docker containers, and the hub works with it. This gives the hub a private https address you can reach from anywhere in your tailnet. That https address is also what the phone's [Bluetooth wake](/guide/bluetooth) needs.

1. Install the **Tailscale** plugin from Apps and log in.
2. Edit the **eink-hub** container and turn on **Use Tailscale**. Set the hostname (e.g. `eink-hub`), **Serve** on port `8080`, and the state directory to `/data/.tailscale_state` so it is kept across updates.
3. Click **Apply**. The first time, open the container's logs and follow the login link to add it to your tailnet. In your Tailscale account, **MagicDNS** and **HTTPS** must be on.
4. Open `https://eink-hub.<your-tailnet>.ts.net`.

The hub detects that address by itself and uses it as its [external URL](/guide/addresses#external-url-external-url): the QR code on the frames opens it. **Settings** shows it greyed out in the field; type another address there only if you want to override it.

Frames keep talking to the hub over your LAN through `LOCAL_URL`. Tailscale is only for you.

::: warning Funnel publishes the whole hub
Unraid's **Funnel** option makes the whole hub public on the internet, admin page included. You only need something public for [SwitchBot](/devices/switchbot) frames, and then only the pictures (`/u/img/`). Keep **Serve** here and expose just the pictures as explained in [Hub addresses](/guide/addresses#_3-expose-it-to-the-internet-only-for-switchbot).
:::

## Network

The template uses **bridge** networking, which is enough: add frames by IP or with **Search the network**. To also find BLOOMIN8 frames by mDNS, set **Network Type** to `br0` (or your custom network) so the container gets its own LAN IP. Then use that IP in `LOCAL_URL`.

## Bluetooth wake

Unraid ships without BlueZ, the Linux Bluetooth service the hub uses, so the server's Bluetooth cannot wake frames out of the box. Wake them **from your phone** instead: open the hub over its Tailscale https address and use **Wake with this phone**. See [Bluetooth wake](/guide/bluetooth).

::: details Advanced: use the server's Bluetooth
This is not supported by Unraid and may need redoing after an Unraid update.

1. Plug in a Bluetooth adapter and check that Unraid sees it: `ls /sys/class/bluetooth` should list `hci0`. If not, run `modprobe btusb`. If the kernel log (`dmesg`) shows `error -71`, try another port, preferably a USB 2.0 port at the back.
2. Install the Slackware BlueZ package. Packages in `/boot/extra` are reinstalled on every boot:

   ```bash
   wget -P /boot/extra https://mirrors.slackware.com/slackware/slackware64-15.0/slackware64/n/bluez-5.63-x86_64-2.txz
   installpkg /boot/extra/bluez-5.63-x86_64-2.txz
   ```

3. Start BlueZ now and on every boot by adding this to `/boot/config/go` and running it once:

   ```bash
   modprobe btusb
   kill -HUP $(pgrep -x dbus-daemon)
   $(find /usr -name bluetoothd -type f | head -1) &
   sleep 3 && bluetoothctl power on
   ```

4. Edit the container, add a **Path** with container path `/run/dbus`, host path `/run/dbus` and access mode **Read Only**, and apply. Bridge networking is fine.

The Canvas **Settings** should then say the hub can wake Canvases with `hci0`.
:::

## Help

Ask in the [Unraid forum support thread](https://forums.unraid.net/topic/200820-support-yayitazale-eink-hub/), or open an issue on [GitHub](https://github.com/yayitazale/eink-hub/issues).

## Update

Unraid tells you when a new release is out: in the **Docker** tab click **Check for updates**, then **apply update** on the container. The template follows `:latest`, which is always the latest release. To pin a version, change **Repository** to e.g. `ghcr.io/yayitazale/eink-hub:v0.3.5` (releases up to v0.3.4 are only on `registry.gitlab.com/yayitazale/eink-hub`). Containers installed before the move to GitHub keep updating from GitLab's registry; to switch, set **Repository** to `ghcr.io/yayitazale/eink-hub:latest`.
