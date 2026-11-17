# Collections & schedules

## Collections

A collection is a set of photos a frame rotates through:

- **Manual**: photos you upload or pick.
- **Immich album / person / favourites / smart search**: kept in sync with [Immich](/guide/immich) automatically.
- **On this day**: Immich memories, captioned "X years ago today".

## Schedules

Each frame gets one collection and a schedule:

- **Every N hours** (1, 3, 6 or 12), optionally only between active hours (e.g. 08:00 to 22:00).
- **Every N days / weeks** at a time, **monthly** on a day, or a **cron** expression.
- **Order**: random (avoiding recent repeats), sequential or newest first.

More than one change a day costs battery on battery-powered frames; the UI warns you.

## Captions

A schedule can draw a small label in the bottom-left corner of each photo:

- **Show the photo's date**: the date it was taken ("X years ago today" for *On this day*).
- **Show the photo's location**: the city, or the city and country, as [Immich](/guide/immich) reverse-geocoded it from the photo's GPS data. It is drawn next to the date, or alone when the date is off. Photos you upload to the hub directly have no location.
- **Leave out the home country**: photos taken in your home country show only the city. Set the home country in *Settings* and type it the way Immich shows it, usually in English (for example `Belgium`).

## How each frame gets the next photo

| Frame | What happens at each change |
| --- | --- |
| BLOOMIN8, push mode | The hub uploads the photo (waking the frame over Bluetooth if you enabled auto-wake). |
| BLOOMIN8, pull mode | The frame wakes at the time the hub gave it, downloads the photo and sleeps until the next change. |
| SwitchBot | The hub sends the photo to SwitchBot's cloud; the frame picks it up on its next check-in. |
| TRMNL / DIY | The frame wakes on its own timer. In each reply the hub tells it how long to sleep: until the next change, but never longer than its *longest sleep* setting, so photos sent by hand don't wait for tomorrow. Outside active hours it sleeps right through. |

**Next** on a frame's page runs the schedule now, and the schedule carries on from there.
