# Supported devices

Each kind of frame is a *driver* in the hub. They differ in how the hub reaches them and, above all, in **how a sleeping frame gets to see a new picture**.

| | BLOOMIN8 | SwitchBot AI Art Frame | TRMNL firmware | DIY (Open Frame) |
| --- | --- | --- | --- | --- |
| Connection | Local HTTP API | SwitchBot cloud (OpenAPI v1.1) | Device polls the hub | Device polls the hub |
| Needs internet | No | Yes, and a public https address for the hub | No | No |
| Image format | JPEG; the frame dithers | JPEG | 1-bit BMP (or PNG) | JPEG, PNG or BMP, optionally dithered by the hub |
| Wakes up | Its own schedule (pull), or Bluetooth from the hub/phone | On its own; the cloud keeps the photo until then | On its own timer; the hub sets it | On its own timer; the hub sets it. Always-on frames can be notified |
| Send a photo now | Yes when awake; queued otherwise | Queued in the cloud | Queued until the next poll | Queued until the next poll, or at once if it can be notified |
| On-device galleries & playlists | Yes | No | No | No |
| Battery level | Yes | Yes | Yes (from voltage) | Yes (if reported) |

## Choosing a wake strategy

E-paper keeps its picture with no power, so the best battery frames are asleep almost all the time. The question is who decides when they wake:

- **The hub (BLOOMIN8 push + Bluetooth)**: the hub wakes the frame when it has something. Instant, costs a bit of battery per wake, needs Bluetooth in range.
- **The frame, told by the hub (BLOOMIN8 pull, TRMNL, DIY)**: every reply says when to come back, which is the next scheduled change, capped to a maximum. This gives the best battery life. A photo sent by hand waits at most that maximum.
- **The vendor's cloud (SwitchBot)**: the hub hands the photo to the cloud, which delivers it when the frame next checks in. The hub can't make it check in sooner.
