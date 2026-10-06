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

## How each frame gets the next photo

| Frame | What happens at each change |
| --- | --- |
| BLOOMIN8, push mode | The hub uploads the photo (waking the frame over Bluetooth if you enabled auto-wake). |
| BLOOMIN8, pull mode | The frame wakes at the time the hub gave it, downloads the photo and sleeps until the next change. |
| SwitchBot | The hub sends the photo to SwitchBot's cloud; the frame picks it up on its next check-in. |
| TRMNL / DIY | The frame wakes on its own timer. In each reply the hub tells it how long to sleep: until the next change, but never longer than its *longest sleep* setting, so photos sent by hand don't wait for tomorrow. Outside active hours it sleeps right through. |

**Next** on a frame's page runs the schedule now, and the schedule carries on from there.
