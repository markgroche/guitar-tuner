# Guitar Tuner — v1

The completed blue browser tuner: 20 guitar tunings, microphone detection,
calibrated recorded guitar reference sounds and offline support.

This release preserves the blue app before the Acoustic Studio redesign.
Tag `v1.0.0` is its permanent source checkpoint.

## Run locally

Use Node.js 20+ for tests and Python 3 for the local server. No package installation
or runtime CDN is required.

```sh
npm test
npm run build
npm run dev
```

Open http://127.0.0.1:4173/. Microphone capture needs localhost or HTTPS.
The Pages workflow tests the app, builds only runtime files into `_site/`,
and deploys that directory from `master`.

## Controls

Choose a preset, then start the microphone. Tap a string for its reference sound;
while listening, tap to lock that string. Auto detect releases the lock.
Guide, chromatic mode, repeat and play-all are available alongside sound,
volume, input, sensitivity and concert-pitch controls.

## Validation and credits

12 automated checks cover pitch analysis, noisy/harmonic signals, tuning targets,
microphone capture races, sample calibration, playback cleanup and offline paths.
The synthetic test measures 90 tones across 44.1/48/96 kHz; it does not certify
physical guitar or microphone accuracy. See [CREDITS.txt](CREDITS.txt) for the
sample and vendored-library licenses.
