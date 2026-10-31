# Users & passkeys

The hub can have several accounts, so everyone at home signs in as themselves.
Everything is shared: every account sees the same Canvases, photos and
collections. The role only decides what each one may change.

| | Admin | Member |
| --- | :---: | :---: |
| Upload photos, edit collections | ✓ | ✓ |
| Send photos, schedules, wake a Canvas | ✓ | ✓ |
| Add, configure or delete a Canvas | ✓ | |
| Hub settings, Immich connection, logs | ✓ | |
| Invite and manage users | ✓ | |

There is always at least one admin: the hub refuses to demote or delete the last
one.

## First account

The first time you open the hub it asks for an admin username (`admin` by
default) and a password. With `ADMIN_PASSWORD` set and no accounts yet, the hub
creates `admin` with that password instead.

::: tip Upgrading from 0.6 or earlier
Your existing password keeps working: it now belongs to the account **admin**.
Open sessions stay signed in.
:::

## Inviting someone

1. Go to **Settings → Users** and pick a role under **Invite**.
2. **Create invite** shows a link and a QR code. Scan it with their phone, or copy
   or share the link.
3. Whoever opens it picks a username and a password, or a passkey.

A link works once and expires after 7 days. Pending links are listed under the
invite form, where you can revoke them.

The link uses the address you are browsing the hub at. If they will use the hub
through Tailscale or a reverse proxy, create the invite from that address, so
their passkey is made for it (see below).

## Forgotten password

In **Settings → Users**, the key button next to an account creates a **reset
link**: it lets that person choose a new password or passkey, and signs them out
of every other device.

If no admin can sign in, stop the container, delete the accounts with
`sqlite3 data/hub.db "DELETE FROM users"`, and start it again with
`ADMIN_PASSWORD` set. Photos, Canvases and settings are kept.

## Passkeys

A passkey lets you sign in with **Face ID, a fingerprint or Windows Hello**
instead of typing the password. It works the same in the browser and in the
installed app (PWA). The hub only stores a public key: your fingerprint or face
never leaves the device.

To add one, open **Settings → Security → Passkeys** on the device and tap **Add
this device**. From then on, the sign-in screen shows **Sign in with a passkey**.
Your password keeps working as well.

Two things to know:

- **Passkeys need HTTPS** (or `localhost`). Over `http://192.168.x.x:8080` the
  browser does not offer them, so the option is hidden. Use Tailscale Serve or
  a reverse proxy with a certificate; see
  [Local, remote, or exposed](./addresses#local-remote-or-exposed).
- **A passkey belongs to one address.** A passkey made on
  `https://hub.example.ts.net` does not work on `https://hub.home.lan`. If you
  open the hub at several addresses, add a passkey on each. Settings shows which
  address each passkey is for.
