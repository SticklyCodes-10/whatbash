# Background music

Put your `.mp3` files in this folder, then list each filename in `tracks.json` as a JSON array. Example:

```json
[
  "calm-piano.mp3",
  "soft-ambient.mp3"
]
```

The in-game music button starts a randomly selected track. When a track ends, another track is selected at random (without immediately repeating the previous track when there is more than one). Browsers require a user click before audio can start.

Use MP3s that you own or are licensed to use.
