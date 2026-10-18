# Practice bookmarks

Practice points and ranges are stored only in this browser profile's local
storage. They are not tied to an account or synced to another browser/device;
clearing this site's browser data removes them.

In Arcaea Charts, a saved bookmark is scoped to the catalog song ID, difficulty,
chart version, and exact selected YouTube video. Selecting another upload will
not reuse its timestamps. A range seeks to its start without changing the
requested playback state; looping is always opt-in. Loop boundaries use the
YouTube player's seek API, so they are approximate rather than frame-accurate.
Manually seeking outside the selected range clears it.
