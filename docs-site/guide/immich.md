# Immich

[Immich](https://immich.app) is a self-hosted photo library. The hub can use it as a source of photos.

1. In Immich, go to **Account settings → API keys** and create a key with the [permissions below](#api-key-permissions).
2. In the hub, open **Settings**, enter your Immich URL and the key, and test the connection.
3. Browse Immich from the **Immich** page: send single photos, or create collections from an album, a person, your favourites, a smart (CLIP) search or "on this day" memories.

The key stays on the server: the browser only ever talks to the hub. Dynamic collections are re-synced periodically, so new photos in the album show up on the frame by themselves.

Originals are downloaded once and cached. Formats the hub can't decode (some HEIC or RAW files) fall back to Immich's full-size preview.

## API key permissions

When you create the key, tick these permissions (or pick **All**):

| Used for | Permission |
| --- | --- |
| Testing the connection and showing your user | `user.read` |
| Listing albums | `album.read` |
| Listing people and their faces | `person.read` |
| Searching photos (filters and smart search) | `asset.read` |
| "On this day" memories | `memory.read` |
| Showing thumbnails in the hub | `asset.view` |
| Downloading the original to send it to a frame | `asset.download` |

If albums and photos are listed but the images don't load, the key is missing `asset.view` or `asset.download`. Add them to the key, or create a new one and paste it in **Settings**.
