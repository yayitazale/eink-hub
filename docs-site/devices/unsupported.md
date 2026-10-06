# Not supported (yet)

We looked into these frames. Here is why they aren't supported, and what would change that.

## Aura Frames

Aura frames (Carver, Aspen, Walden…) only receive photos through Aura's cloud. Aura publishes **no API**. Community projects such as [auraframes](https://github.com/zmanowar/auraframes) and [pushframe](https://github.com/coredmp95/pushframe) reverse-engineered the phone app's private API. They log in with your Aura email and password, upload to Aura's storage and attach the photo to a frame.

We don't ship this because it:

- needs your Aura password stored on the hub;
- can break whenever Aura changes its app, and today fails intermittently;
- may go against Aura's terms of service.

**What would change it:** an official API, or the community project becoming stable. A driver would be small: it is the same "push through a cloud" model as [SwitchBot](/devices/switchbot).

## Reflection Frame

The [Reflection Frame](https://www.reflectionframe.com/) (Spectra 6, 10″ and 13.3″) receives photos only through **"Tap-to-Print"**: you tap your phone on the frame (NFC) from its app. There is no Wi-Fi delivery, no cloud and no API.

**What would change it:** a documented NFC/Bluetooth protocol. Even then, delivery needs a phone next to the frame, so remote scheduling would not be possible.

## Something else?

If your frame has a local or cloud API, a driver is usually a small file (see `apps/server/src/device/drivers/`). [Open an issue](https://gitlab.com/yayitazale/eink-hub/-/issues) with links to its API. If it's an ESP32 or Raspberry Pi board, it can probably run the [Open Frame](/diy/) examples or [TRMNL firmware](/devices/trmnl) today.
