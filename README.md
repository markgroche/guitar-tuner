# Guitar Tuner

A browser guitar tuner with a realistic walnut headstock, microphone pitch
detection, recorded guitar references and 20 standard, lowered, drop, open and
modal tunings. Audio is analysed on the device and is never uploaded.

**[Open v2 — Acoustic Studio](https://markgroche.github.io/guitar-tuner/)** ·
[Open v1 — Blue](https://markgroche.github.io/guitar-tuner/?v=1)

## Versions

| Version | Experience | Permanent release |
| --- | --- | --- |
| v2 | Large centered walnut headstock in a warm vinyl room, tappable pegs, quiet preset and sound controls | [v2.0.0](https://github.com/markgroche/guitar-tuner/releases/tag/v2.0.0) |
| v1 | The completed blue panel with 20 presets and the upgraded audio engine | [v1.0.0](https://github.com/markgroche/guitar-tuner/releases/tag/v1.0.0) |

The main Pages URL opens v2. Use **Tuner v1** in the header for the blue view;
**Tuner v2** returns to the headstock. Explicit `?v=1` and `?v=2` links keep that
choice across reloads. Both live views share the current audio engine.
The v1.0.0 release preserves the exact pre-redesign blue app as a separate
source checkpoint and downloadable offline-capable package. v2.0.0 is the latest
release. Git history before v1 remains intact.

## Tuning

Start the microphone and play one open string. Read the cents offset and move
towards the center mark. Tap a note label or its brass peg to hear a reference;
while listening, tapping also locks that string. **Auto detect** releases it.

The bottom-left current tuning opens the 20 presets: a side list on desktop or
a sheet on phones. **Sound & mic** contains guitar voices, pure tone, volume,
guide/chromatic/repeat/play-all modes, input selection, sensitivity and concert
pitch. Visible notes use familiar letters without octave numbers.

## Development

Use Node.js 20+ for tests and Python 3 for the local server. No dependency install,
framework build or runtime CDN is needed.

```sh
npm test       # Pitch, capture, recordings, offline and version routing
npm run build  # Curated static Pages artifact in _site/
npm run dev    # http://127.0.0.1:4173/
```

Microphone capture requires HTTPS or localhost. Pages uses HTTPS. The workflow
in `.github/workflows/pages.yml` tests, builds and deploys `_site/` from `master`.
Only runtime assets are published; tests, scripts and repository documents stay
out of the site. `_site/` is generated and ignored by Git.

## Implementation and validation

Pitchy/McLeod analysis runs in a worker with a main-thread fallback. Signal,
clipping and clarity checks feed time-based stable tuning feedback. There are
41 calibrated guitar recordings across steel-string, nylon and clean electric
voices, plus pure-tone playback. Reference playback pauses pitch acceptance.

Tests cover 90 synthetic tones across 44.1/48/96 kHz (maximum error 0.0111 cents),
harmonic/noisy signals, capture concurrency and cleanup, playback races,
calibrated sample coverage, offline files, cache isolation and version routing.
These are software checks; they do not certify real guitar/microphone accuracy.
The approved v2 design was reviewed at desktop, phone and the portfolio preview
width, including presets, settings and recovery to v1.

## Credits

See [CREDITS.txt](CREDITS.txt) and the notices in `vendor/`, `samples/` and
`assets/`. The headstock was generated from the supplied photographic reference;
the room and fonts are reused from the portfolio. Raster provenance is retained
beside each asset. No GuitarTuna or Gieson artwork, code or recordings are included.
