# Unraid template

[`eink-hub.xml`](eink-hub.xml) is the Community Applications (CA) template for Unraid. It is kept here, next to the code, so it changes together with the app (new variables, defaults…).

CA doesn't read it from this repository: it is published from [yayitazale/unraid-templates](https://github.com/yayitazale/unraid-templates), which CA syncs. After changing it here:

1. Copy it to `yayitazale/eink-hub.xml` in that repository (its `TemplateURL` already points there).
2. Make sure `<Support>` is the forum support thread.

User docs: [Unraid](https://eink-hub-7ba3a3.gitlab.io/guide/unraid) (`docs-site/guide/unraid.md`).

## Tailscale

The `Tailscale*` tags pre-fill Unraid 7's "Use Tailscale" options (off by default): Serve on port 8080, hostname `eink-hub` and the Tailscale state in `/data/.tailscale_state`, so it survives updates. Unraid's hook installs Tailscale in the container with `apt-get` when it starts, so the image must stay Debian-based and run as root.

With Serve on, the hub reads its own `https://<name>.<tailnet>.ts.net` address (`apps/server/src/lib/tailscale.ts`) and uses it as the external URL when none is set.
