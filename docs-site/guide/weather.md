# Weather

The Hub can fetch the weather for a place and use it wherever a picture, a label or a prompt needs it. It does not depend on AI: any feature can use it.

## Where it comes from

Under **Settings > Weather** you choose the weather source for the whole Hub. [Open-Meteo](https://open-meteo.com/) is the default: it is free and needs no account. A source that needs an API key shows a field for it. The key is saved on the Hub, never sent back to the browser, and forgotten when you choose another source.

Below the choice the Hub shows the weather it gets for your hub location right now, so you can see at once that the source works. If nothing shows, check that a location is set under **Settings > Location**.

## Which place

The weather is for the **hub location** (Settings > Location): a town or city from the offline place list, or coordinates you enter. A Canvas can have its own location in its settings, for example a frame at work in another town. Features that use the weather take the Canvas's location when it has one, otherwise the hub's.

## What it gives

For a place the Hub knows the weather now, hour by hour for the next two days, and a summary per day (lowest and highest temperature, chance of rain, sunrise and sunset). A feature can ask for the weather now or a number of hours ahead, up to 47. The forecast is kept for 15 minutes per place, so several Canvases do not ask the service again and again.

Want another source? See [Adding a weather provider](/development/weather-providers).
