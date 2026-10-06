# Immich

[Immich](https://immich.app) is a self-hosted photo library. The hub can use it as a source of photos.

1. In Immich, go to **Account settings → API keys** and create a key with read access to assets, albums, people and memories.
2. In the hub, open **Settings**, enter your Immich URL and the key, and test the connection.
3. Browse Immich from the **Immich** page: send single photos, or create collections from an album, a person, your favourites, a smart (CLIP) search or "on this day" memories.

The key stays on the server: the browser only ever talks to the hub. Dynamic collections are re-synced periodically, so new photos in the album show up on the frame by themselves.

Originals are downloaded once and cached. Formats the hub can't decode (some HEIC or RAW files) fall back to Immich's full-size preview.
