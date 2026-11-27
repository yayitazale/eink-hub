# Adding a weather provider

The Hub gets its [weather](/guide/weather) through a small interface, so another service can be added without touching the rest of the code. [Open-Meteo](https://open-meteo.com/) is the first provider and the default. The source is chosen under **Settings > Weather**.

## What a provider does

A provider is an object with four fields, defined in `apps/server/src/lib/weather/provider.ts`:

| Field | Meaning |
| --- | --- |
| `id` | Stable name that is saved in the settings, for example `open-meteo`. |
| `name` | Name shown in Settings. |
| `key` | `'none'`, `'optional'` or `'required'`: whether Settings shows a field for an API key. |
| `fetch({ latitude, longitude, apiKey })` | Returns a `WeatherForecast`, or throws a `WeatherError` with a readable message. |

A `WeatherForecast` is the same for every provider. Temperatures are degrees Celsius, wind is km/h, and times are local at the place (`YYYY-MM-DDTHH:MM`, no time zone suffix):

| Part | Meaning |
| --- | --- |
| `current` | Conditions right now: `time`, `code`, `temperature`, `wind` (or `null`), `isDay`. |
| `hourly` | One entry per full hour from the current hour onward, for at least 48 hours: `time`, `code`, `temperature`, `wind`, `isDay` and `rain` (chance of rain in percent, or `null`). |
| `daily` | One entry per day from today onward, for at least three days: `date` (`YYYY-MM-DD`), `code` (the sky of the day, or `null`), `high`, `low`, `rain`, `sunrise`, `sunset` (each may be `null`). |

`code` is a WMO weather code (`0` clear, `3` overcast, `63` rain, `95` thunderstorm...). Convert the service's own codes to WMO.

Everything that uses the weather asks for a `WeatherSnapshot`: the forecast at one moment (now, or a number of hours ahead) together with the figures of that day. The Hub builds it from your forecast with `snapshotAt`, so a provider never has to know about hours ahead, labels or prompts.

## Steps

1. Add `apps/server/src/lib/weather/<name>.ts` that exports a `WeatherProvider`. `openmeteo.ts` is a complete example, including the function that turns the service's answer into a forecast.
2. Add the provider to the `weatherProviders` list in `apps/server/src/lib/weather/index.ts`. Settings lists it from there, and shows the key field when `key` is not `'none'`.
3. Add tests that turn a sample answer of the service into a forecast (see `apps/server/test/weather.test.ts`). Do not call the real service in tests.

Keep the provider's key out of logs and error messages. The key is saved on the Hub, never sent back to the browser, and forgotten when another provider is chosen.
