# Unraid

E-Ink Hub is in Unraid's **Community Applications** (CA), so you can install it from the **Apps** tab without writing a compose file.

## Install

1. In Unraid, open **Apps** and search for **eink-hub**.
2. Click **Install** and fill in:
   - **LOCAL_URL**: your Unraid server's LAN address and the port, e.g. `http://192.168.1.10:8080`. Frames use it to reach the hub, and **Search the network** scans its subnet.
   - **TZ**: your time zone, for schedules and active hours.
   - Optionally **ADMIN_PASSWORD** and your **Immich** address and API key (both can also be set later in **Settings**).
3. Click **Apply**, then open the **WebUI** from the container's menu, choose an admin password and add your frames.

Your data (database, photos and render cache) lives in `/mnt/user/appdata/eink-hub`.

## Tailscale

Unraid 7 integrates [Tailscale](https://docs.unraid.net/go/tailscale-docker/) with Docker containers, and the template is ready for it. This gives the hub a private https address you can reach from anywhere in your tailnet. That https address is also what the phone's [Bluetooth wake](/guide/bluetooth) needs.

1. Install the **Tailscale** plugin from Apps and log in.
2. Edit the **eink-hub** container and turn on **Use Tailscale**. The template already sets the hostname (`eink-hub`), **Serve** on port 8080 and the state folder (`/data/.tailscale_state`, kept across updates).
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

To wake BLOOMIN8 frames with the server's Bluetooth, Unraid must have a Bluetooth adapter with BlueZ running. In the container's **advanced view**, set **D-Bus (Bluetooth wake)** to `/run/dbus`. See [Bluetooth wake](/guide/bluetooth).

## Update

Unraid tells you when a new release is out: in the **Docker** tab click **Check for updates**, then **apply update** on the container. The template follows `:latest`, which is always the latest release. To pin a version, change **Repository** to e.g. `registry.gitlab.com/yayitazale/eink-hub:v0.2.0`.
