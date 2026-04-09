// tuner.js — main app controller
import { PitchDetector } from './pitch-detector.js';
import { TonePlayer, noteToFreq } from './tone-player.js';

// ── Tuning data ──────────────────────────────────────────────────────────────

const TUNINGS = [
  { name: 'Standard',       label: 'Standard EADGBe',    strings: ['E2','A2','D3','G3','B3','E4'] },
  { name: 'Drop D',         label: 'Drop D DADGBe',      strings: ['D2','A2','D3','G3','B3','E4'] },
  { name: 'Open G',         label: 'Open G DGDGBd',      strings: ['D2','G2','D3','G3','B3','D4'] },
  { name: 'Open D',         label: 'Open D DADf#Ad',     strings: ['D2','A2','D3','F#3','A3','D4'] },
  { name: 'Open E',         label: 'Open E EBEg#Be',     strings: ['E2','B2','E3','G#3','B3','E4'] },
  { name: 'DADGAD',         label: 'DADGAD',             strings: ['D2','A2','D3','G3','A3','D4'] },
  { name: 'Half Step Down', label: '½ Step Down Eb',     strings: ['Eb2','Ab2','Db3','Gb3','Bb3','Eb4'] },
  { name: 'Full Step Down', label: 'Full Step Down D',   strings: ['D2','G2','C3','F3','A3','D4'] },
  { name: 'Drop C',         label: 'Drop C CGCFAD',      strings: ['C2','G2','C3','F3','A3','D4'] },
  { name: 'C Standard',     label: 'C Standard C F Bb Eb G C', strings: ['C2','F2','Bb2','Eb3','G3','C4'] },
];
const LOW_MODE_NAMES = new Set(['Drop C', 'C Standard']);

// Note name display labels (strip octave number for display)
const displayNote = n => n.replace(/\d+/, '').replace('#', '♯').replace('b', '♭');
const formatHz = hz => `${hz.toFixed(1)} Hz`;

// ── Note math ────────────────────────────────────────────────────────────────

// Find closest string in current tuning to detected frequency
function closestString(freq, tuning) {
  let best = null, bestDiff = Infinity;
  tuning.strings.forEach((noteStr, idx) => {
    const target = noteToFreq(noteStr);
    const cents  = 1200 * Math.log2(freq / target);
    const diff   = Math.abs(cents);
    if (diff < bestDiff) { bestDiff = diff; best = { idx, noteStr, cents, target }; }
  });
  return best; // null if tuning has no strings
}

function noteInfoFromFreq(freq) {
  const semitones = 12 * Math.log2(freq / 440);
  const rounded   = Math.round(semitones);
  const cents     = Math.round((semitones - rounded) * 100);
  const midi      = rounded + 69;
  const name      = CHROMATIC_NAMES[((midi % 12) + 12) % 12];
  const octave    = Math.floor(midi / 12) - 1;
  return { noteStr: `${name}${octave}`, cents, midi };
}

// ── App state ────────────────────────────────────────────────────────────────

const REPEAT_INTERVAL_MS = 2700; // ms between plays — fires 300ms before note fully fades
const AUTO_REPEAT_COUNT  = 3;    // plays per string when both modes active

const state = {
  tuningIdx:    0,
  micActive:    false,
  activeString: null,
  repeatOn:     false,
  autoOn:       false,
  guideOn:      false,
  guideIdx:     0,
  lowMode:      false,
  chromaticMode: false,
  autoStringIdx: 0,
  playCount:    0,
  _timer:       null,
};

// ── Display state machine ─────────────────────────────────────────────────────
// ACTIVE   — good signal, updating normally
// HOLDING  — signal dropped, display frozen for HOLD_TIME_MS
// DRIFTING — hold expired, needle slowly returning to centre (inside onPitch loop)
// IDLE     — no note, showing dashes
const DS = { IDLE: 0, ACTIVE: 1, HOLDING: 2, DRIFTING: 3 };
let _ds             = DS.IDLE;
let _holdTimer      = null;
let _lastGoodFreq   = null;
let _lowCount       = 0;       // consecutive low-clarity frames before entering hold
const HOLD_TIME_MS  = 1500;
const LOW_THRESH    = 3;       // frames needed to confirm signal is gone (anti-flicker)
let _inTuneFrames   = 0;
const TUNE_CONFIRM  = 6; // ~300ms of consecutive in-tune readings before showing ✓
const GUIDE_CONFIRM  = 6; // same cadence for guided auto-advance

// ── Chromatic note matching ───────────────────────────────────────────────────
const CHROMATIC_NAMES = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];

function closestChromatic(freq) {
  const info = noteInfoFromFreq(freq);
  return { noteStr: info.noteStr.replace(/\d+$/, ''), cents: info.cents, idx: null };
}

const detector  = new PitchDetector(onPitch);
const player    = new TonePlayer();

// ── DOM refs ─────────────────────────────────────────────────────────────────

const $repeatBtn      = document.getElementById('repeat-btn');
const $autoBtn        = document.getElementById('auto-btn');
const $guideBtn       = document.getElementById('guide-btn');
const $chrBtn         = document.getElementById('chr-btn');
const $lowBtn         = document.getElementById('low-btn');
const $app            = document.getElementById('app');
const $tuningName     = document.getElementById('tuning-name');
const $tuningToggle   = document.getElementById('tuning-toggle');
const $tuningDrawer   = document.getElementById('tuning-drawer');
const $tuningList     = document.getElementById('tuning-list');
const $tuningBackdrop = document.getElementById('tuning-backdrop');
const $signalMeter    = document.getElementById('signal-meter');
const $tuneTick       = document.getElementById('tune-tick');
const $noteName       = document.getElementById('note-name');
const $noteTarget     = document.getElementById('note-target');
const $noteCurrent    = document.getElementById('note-current');
const $noteFreq       = document.getElementById('note-freq');
const $statusMsg      = document.getElementById('status-msg');
const $needle         = document.getElementById('gauge-needle');
const $dot            = document.getElementById('gauge-dot');
const $gauge          = document.getElementById('gauge');
const $cents          = document.getElementById('cents-display');
const $stringBtns     = document.getElementById('string-buttons');
const $micBtn         = document.getElementById('mic-button');
const $micLabel       = document.getElementById('mic-label');
const $errorMsg       = document.getElementById('error-msg');

// ── Render ───────────────────────────────────────────────────────────────────

function renderTuning() {
  const tuning = TUNINGS[state.tuningIdx];
  $tuningName.textContent = tuning.label;

  $stringBtns.innerHTML = '';
  tuning.strings.forEach((noteStr, idx) => {
    const btn = document.createElement('button');
    btn.className  = 'string-btn' + (state.guideOn && idx === state.guideIdx ? ' guide-target' : '');
    btn.textContent = displayNote(noteStr);
    btn.dataset.idx = idx;
    btn.setAttribute('aria-label', `Play ${noteStr}`);
    btn.addEventListener('click', () => {
      // Jump auto/repeat to this string if playback mode is active
      if (state.repeatOn || state.autoOn) {
        state.autoStringIdx = idx;
        state.playCount = 0;
        startPlaybackMode();
      } else {
        try { player.playNote(noteStr); } catch (err) { console.warn(err); }
        flashStringBtn(btn);
      }
    });
    $stringBtns.appendChild(btn);
  });

  resetNeedle();
  state.activeString = null;
  updateSessionDisplay();
  syncModeUI();
  syncTheme();
}

function isLowTuning(idx) {
  return LOW_MODE_NAMES.has(TUNINGS[idx].name);
}

function flashStringBtn(btn) {
  btn.classList.add('active');
  setTimeout(() => btn.classList.remove('active'), 800);
}

function setButtonState(btn, active) {
  btn.classList.toggle('active', active);
  btn.setAttribute('aria-pressed', active ? 'true' : 'false');
}

function syncGuideTargets() {
  const buttons = [...$stringBtns.querySelectorAll('.string-btn')];
  buttons.forEach((btn, i) => {
    btn.classList.toggle('guide-target', state.guideOn && i === state.guideIdx);
  });
}

function syncModeUI() {
  setButtonState($repeatBtn, state.repeatOn);
  setButtonState($autoBtn, state.autoOn);
  setButtonState($guideBtn, state.guideOn);
  setButtonState($chrBtn, state.chromaticMode);
  setButtonState($lowBtn, state.lowMode);
  syncGuideTargets();
}

function syncTheme() {
  let theme = 'default';
  if (state.guideOn) theme = 'guide';
  else if (state.lowMode) theme = 'low';
  else if (state.chromaticMode) theme = 'chromatic';
  $app.dataset.theme = theme;
}

function getTargetLine() {
  const tuning = TUNINGS[state.tuningIdx];
  if (state.guideOn) {
    if (state.guideIdx >= tuning.strings.length) return `Guide complete · ${tuning.name}`;
    const target = tuning.strings[state.guideIdx];
    return `Guide ${state.guideIdx + 1}/${tuning.strings.length} · Target ${displayNote(target)}`;
  }
  if (state.chromaticMode) return 'Chromatic mode · Swipe for tunings';
  return `Tuning: ${tuning.name}${state.lowMode ? ' · Low mode' : ''}`;
}

function getIdleHint() {
  if (state.guideOn) return 'Pluck the highlighted string until the guide advances.';
  if (state.lowMode) return 'Low mode is on. Give the low strings a firmer attack.';
  if (state.chromaticMode) return 'Chromatic mode tracks any note, not just the current tuning.';
  return 'Tap the mic and pluck a string.';
}

function updateSessionDisplay() {
  $noteTarget.textContent = getTargetLine();
}

function updateSignalHint(freq, clarity, goodSignal) {
  if (!freq) {
    $statusMsg.textContent = state.guideOn
      ? 'Listen for the target string and pluck cleanly once.'
      : 'No clean pitch yet. Try closer to the mic.';
    return;
  }

  if (!goodSignal) {
    if (clarity < 0.2) {
      $statusMsg.textContent = 'Too much noise or no clear note. Mute the other strings.';
    } else if (state.lowMode && freq < LOW_MODE_FREQ_HZ) {
      $statusMsg.textContent = 'Low string detected, but the note is still soft. Pluck harder.';
    } else if (clarity < 0.5) {
      $statusMsg.textContent = 'Hold a cleaner note for a steadier readout.';
    } else {
      $statusMsg.textContent = 'Try a stronger attack or move the mic closer.';
    }
    return;
  }

  $statusMsg.textContent = state.guideOn
    ? 'Keep the string steady until the guide advances.'
    : 'Signal locked. Fine-tune with the gauge.';
}

function advanceGuide() {
  const tuning = TUNINGS[state.tuningIdx];
  state.guideIdx += 1;
  _inTuneFrames = 0;

  if (state.guideIdx >= tuning.strings.length) {
    state.guideOn = false;
    syncModeUI();
    syncTheme();
    updateSessionDisplay();
    $statusMsg.textContent = 'All strings tuned. Pick another tuning to start again.';
    return;
  }

  updateSessionDisplay();
  syncModeUI();
  syncTheme();
  $statusMsg.textContent = `Next up: ${displayNote(tuning.strings[state.guideIdx])}.`;
}

function _clearToIdle() {
  $noteName.textContent = '–';
  $noteName.className   = 'note-name';
  $noteTarget.textContent = getTargetLine();
  $noteCurrent.textContent = 'Detected: –';
  $noteFreq.textContent = '– Hz';
  $cents.textContent    = '– ¢';
  $gauge.className      = 'gauge';
  $tuneTick.classList.remove('visible');
  $statusMsg.textContent = getIdleHint();
}

function resetNeedle() {
  if (_holdTimer) { clearTimeout(_holdTimer); _holdTimer = null; }
  _lastGoodFreq  = null;
  _smoothedFreq  = null;
  _lowCount      = 0;
  _inTuneFrames  = 0;
  _ds            = DS.IDLE;
  _clearToIdle();
  setNeedle(0, false);
  $signalMeter.removeAttribute('data-level');
}

function updateSignal(clarity) {
  const level = clarity < 0.5 ? 0
    : clarity < 0.7  ? 1
    : clarity < 0.85 ? 2
    : clarity < 0.93 ? 3 : 4;
  if (level === 0) $signalMeter.removeAttribute('data-level');
  else $signalMeter.setAttribute('data-level', level);
}

// ── Needle position ──────────────────────────────────────────────────────────

// cents: -50 (flat) → 0 (center) → +50 (sharp)
// maps to gauge left: 5% → 50% → 95%
function setNeedle(cents, inTune) {
  const clamped = Math.max(-50, Math.min(50, cents));
  const pct     = ((clamped + 50) / 100) * 90 + 5; // 5%–95%
  $needle.style.left = `${pct}%`;
  $dot.style.left    = `${pct}%`;
  $needle.classList.toggle('in-tune', inTune);
  $dot.classList.toggle('in-tune', inTune);

  // Gauge direction + note color state
  const absCents = Math.abs(cents);
  const noteState = inTune ? 'in-tune' : absCents > 20 ? 'off' : 'near';
  const gaugeDir  = inTune ? 'in-tune' : cents < 0 ? 'flat' : 'sharp';
  $noteName.className = `note-name ${noteState}`;
  $gauge.className    = `gauge ${gaugeDir}`;
}

// ── Pitch callback (called ~60fps from detector) ─────────────────────────────

let _lastUpdateTime = 0;
const UPDATE_INTERVAL_MS = 50; // throttle UI to 20Hz
const SWIPE_THRESHOLD_PX = 60;
const FREQ_SMOOTHING     = 0.75; // EMA factor — higher = smoother, slower to respond
let   _smoothedFreq      = null;
const LOW_NOTE_FREQ_HZ   = 100;
const LOW_NOTE_CLARITY   = 0.65;
const LOW_MODE_FREQ_HZ   = 140;
const LOW_MODE_CLARITY   = 0.55;
const LOW_MODE_CENTS     = 70;
const DEFAULT_CLARITY    = 0.80;
const DEFAULT_CENTS      = 50;

function clarityGateFor(freq) {
  if (!freq) return DEFAULT_CLARITY;
  if (state.lowMode && freq < LOW_MODE_FREQ_HZ) return 0.52;
  if (freq < LOW_NOTE_FREQ_HZ) return LOW_NOTE_CLARITY;
  return DEFAULT_CLARITY;
}

function centsGateFor(freq) {
  if (state.lowMode && freq && freq < LOW_MODE_FREQ_HZ) return 75;
  return DEFAULT_CENTS;
}

function smoothingFor(freq) {
  if (state.lowMode && freq && freq < LOW_MODE_FREQ_HZ) return 0.86;
  return FREQ_SMOOTHING;
}

function onPitch({ freq, clarity }) {
  const now = Date.now();
  if (now - _lastUpdateTime < UPDATE_INTERVAL_MS) return;
  _lastUpdateTime = now;

  const clarityGate = clarityGateFor(freq);
  const goodSignal = !!(freq && clarity >= clarityGate);
  updateSignal(goodSignal ? clarity : 0);

  // ── Good signal ───────────────────────────────────────────────────────────
  if (goodSignal) {
    _lowCount = 0;

    // Cancel hold if signal returned before timer fired
    if (_holdTimer) { clearTimeout(_holdTimer); _holdTimer = null; }
    _ds = DS.ACTIVE;

    // Smooth frequency
    _smoothedFreq = _smoothedFreq === null
      ? freq
      : _smoothedFreq * smoothingFor(freq) + freq * (1 - smoothingFor(freq));
    _lastGoodFreq = _smoothedFreq;

    // Match note
    const tuning = TUNINGS[state.tuningIdx];
    const detected = noteInfoFromFreq(_smoothedFreq);
    let match;
    if (state.chromaticMode) {
      match = closestChromatic(_smoothedFreq);
    } else {
      match = closestString(_smoothedFreq, tuning);
      if (!match || Math.abs(match.cents) > centsGateFor(_smoothedFreq)) { resetNeedle(); return; }
    }

    const inTune = Math.abs(match.cents) <= 5;

    // In-tune confirm counter
    if (inTune) {
      _inTuneFrames = Math.min(_inTuneFrames + 1, TUNE_CONFIRM + 1);
      if (_inTuneFrames >= TUNE_CONFIRM) $tuneTick.classList.add('visible');
    } else {
      _inTuneFrames = 0;
      $tuneTick.classList.remove('visible');
    }

    // Update display
    const visibleNote = state.chromaticMode ? detected.noteStr : match.noteStr;
    $noteName.textContent = displayNote(visibleNote);
    $noteTarget.textContent = getTargetLine();
    $noteCurrent.textContent = `Detected: ${displayNote(detected.noteStr)} · ${formatHz(_smoothedFreq)}`;
    $noteFreq.textContent = formatHz(_smoothedFreq);
    const cr = Math.round(match.cents);
    $cents.textContent = cr === 0 ? '0 ¢' : cr > 0 ? `+${cr} ¢` : `${cr} ¢`;
    setNeedle(match.cents, inTune);
    updateSignalHint(_smoothedFreq, clarity, goodSignal);

    if (!state.chromaticMode) {
      const buttons = [...$stringBtns.querySelectorAll('.string-btn')];
      buttons.forEach((btn, i) => {
        btn.classList.remove('active', 'in-tune', 'guide-target');
        if (i === match.idx) btn.classList.add(inTune ? 'in-tune' : 'active');
        if (state.guideOn && i === state.guideIdx) btn.classList.add('guide-target');
      });
      state.activeString = match.idx;
      if (state.guideOn && match.idx === state.guideIdx && inTune && _inTuneFrames >= GUIDE_CONFIRM) {
        advanceGuide();
      }
    }
    return;
  }

  // ── No signal ─────────────────────────────────────────────────────────────
  if (_ds === DS.ACTIVE) {
    // Require LOW_THRESH consecutive bad frames before entering hold
    // (prevents single-frame clarity dips from triggering hold)
    _lowCount++;
    if (_lowCount < LOW_THRESH) return; // stay ACTIVE, display unchanged

    // Confirmed signal loss — enter hold
    _ds = DS.HOLDING;
    _holdTimer = setTimeout(() => {
      _holdTimer    = null;
      _smoothedFreq = null;
      _inTuneFrames = 0;
      $tuneTick.classList.remove('visible');
      _ds = DS.DRIFTING;
    }, HOLD_TIME_MS);
  }

  if (_ds === DS.HOLDING) {
    // Display frozen — nothing to do, just keep showing last reading
    updateSignalHint(freq, clarity, false);
    return;
  }

  if (_ds === DS.DRIFTING) {
    // Needle drifts back to centre inside this update loop (no separate RAF)
    const l = parseFloat($needle.style.left || '50');
    const d = l + (50 - l) * 0.14;
    $needle.style.left = `${d}%`;
    $dot.style.left    = `${d}%`;
    if (Math.abs(d - 50) < 0.8) {
      _ds = DS.IDLE;
      _clearToIdle();
      setNeedle(0, false);
    }
  }
  updateSignalHint(freq, clarity, false);
  // DS.IDLE: nothing to do
}

// ── Mic toggle ───────────────────────────────────────────────────────────────

async function toggleMic() {
  if (state.micActive) {
    detector.stop();
    state.micActive = false;
    _smoothedFreq = null;
    $micBtn.classList.remove('active');
    $micLabel.textContent = 'Tap to tune';
    resetNeedle(); // also clears _holdTimer, _lastGoodFreq, tick
    hideError();
  } else {
    try {
      stopPlaybackMode();
      await detector.start();
      state.micActive = true;
      $micBtn.classList.add('active');
      $micLabel.textContent = 'Listening…';
      hideError();
    } catch (err) {
      showError(err.message);
    }
  }
}

function showError(msg) {
  $errorMsg.textContent = msg;
  $errorMsg.hidden = false;
}
function hideError() {
  $errorMsg.hidden = true;
}

// ── Repeat / Auto playback mode ──────────────────────────────────────────────

function playCurrentAutoString() {
  const tuning  = TUNINGS[state.tuningIdx];
  const noteStr = tuning.strings[state.autoStringIdx];
  try { player.playNote(noteStr); } catch (err) { console.warn(err); }
  // Highlight the playing string (amber) — clear others
  const buttons = [...$stringBtns.querySelectorAll('.string-btn')];
  buttons.forEach((btn, i) => btn.classList.toggle('playing', i === state.autoStringIdx));
}

function stopPlaybackMode() {
  if (state._timer) { clearInterval(state._timer); state._timer = null; }
  // Clear playing highlights
  [...$stringBtns.querySelectorAll('.string-btn')].forEach(b => b.classList.remove('playing'));
}

function startPlaybackMode() {
  stopPlaybackMode();
  if (!state.repeatOn && !state.autoOn) return;

  state.playCount = 0;
  playCurrentAutoString(); // play immediately, don't wait for first interval

  state._timer = setInterval(() => {
    const tuning    = TUNINGS[state.tuningIdx];
    const numStr    = tuning.strings.length;
    const both      = state.repeatOn && state.autoOn;
    const autoOnly  = state.autoOn  && !state.repeatOn;

    if (autoOnly) {
      // Advance to next string every tick
      state.autoStringIdx = (state.autoStringIdx + 1) % numStr;
      state.playCount = 0;
    } else if (both) {
      // Repeat N times then advance
      state.playCount++;
      if (state.playCount >= AUTO_REPEAT_COUNT) {
        state.autoStringIdx = (state.autoStringIdx + 1) % numStr;
        state.playCount = 0;
      }
    }
    // Repeat-only: autoStringIdx doesn't change, just plays again

    playCurrentAutoString();
  }, REPEAT_INTERVAL_MS);
}

function toggleChromatic() {
  state.chromaticMode = !state.chromaticMode;
  if (state.chromaticMode) {
    state.guideOn = false;
    state.repeatOn = false;
    state.autoOn = false;
    stopPlaybackMode();
  }
  syncModeUI();
  syncTheme();
  resetNeedle();
}

function toggleLowMode() {
  state.lowMode = !state.lowMode;
  syncModeUI();
  syncTheme();
  resetNeedle();
}

function toggleRepeat() {
  state.repeatOn = !state.repeatOn;
  if (state.repeatOn) {
    state.guideOn = false;
    syncModeUI();
    syncTheme();
  } else {
    syncModeUI();
  }
  startPlaybackMode();
}

function toggleAuto() {
  state.autoOn = !state.autoOn;
  if (state.autoOn) {
    state.guideOn = false;
  }
  syncModeUI();
  syncTheme();
  startPlaybackMode();
}

function toggleGuide() {
  state.guideOn = !state.guideOn;
  if (state.guideOn) {
    state.repeatOn = false;
    state.autoOn = false;
    state.chromaticMode = false;
    state.guideIdx = 0;
    state.playCount = 0;
    stopPlaybackMode();
  }
  syncModeUI();
  syncTheme();
  updateSessionDisplay();
  [...$stringBtns.querySelectorAll('.string-btn')].forEach((btn, i) => {
    btn.classList.toggle('guide-target', state.guideOn && i === state.guideIdx);
  });
  resetNeedle();
}

// ── Tuning drawer ────────────────────────────────────────────────────────────

function renderTuningList() {
  $tuningList.innerHTML = '';
  TUNINGS.forEach((t, idx) => {
    const item = document.createElement('div');
    item.className = 'tuning-drawer-item' + (idx === state.tuningIdx ? ' selected' : '');
    const name = document.createElement('div');
    name.className = 'tuning-drawer-item-name';
    name.textContent = t.name;

    const notes = document.createElement('div');
    notes.className = 'tuning-drawer-item-notes';
    notes.textContent = t.strings.join(' · ');

    item.append(name, notes);
    item.addEventListener('click', () => selectTuning(idx));
    $tuningList.appendChild(item);
  });
}

function openDrawer() {
  renderTuningList();
  $tuningDrawer.classList.add('open');
  $tuningToggle.setAttribute('aria-expanded', 'true');
  $tuningDrawer.setAttribute('aria-hidden', 'false');
}

function closeDrawer() {
  $tuningDrawer.classList.remove('open');
  $tuningToggle.setAttribute('aria-expanded', 'false');
  $tuningDrawer.setAttribute('aria-hidden', 'true');
}

function selectTuning(idx) {
  if (state.micActive) { detector.stop(); state.micActive = false; _smoothedFreq = null; $micBtn.classList.remove('active'); $micLabel.textContent = 'Tap to tune'; }
  const wasLowTuning = isLowTuning(state.tuningIdx);
  state.tuningIdx     = idx;
  state.autoStringIdx = 0;
  state.playCount     = 0;
  state.guideIdx      = 0;
  const nowLowTuning = isLowTuning(idx);
  if (nowLowTuning) state.lowMode = true;
  else if (wasLowTuning) state.lowMode = false;
  renderTuning();
  hideError();
  closeDrawer();
  if (state.repeatOn || state.autoOn) startPlaybackMode();
}

// ── Tuning navigation (kept for swipe) ───────────────────────────────────────

function changeTuning(delta) {
  selectTuning((state.tuningIdx + delta + TUNINGS.length) % TUNINGS.length);
}

// Touch swipe support for tuning selector
let _touchStartX = null;
document.addEventListener('touchstart', e => { _touchStartX = e.touches[0].clientX; }, { passive: true });
document.addEventListener('touchend', e => {
  if (_touchStartX === null) return;
  const dx = e.changedTouches[0].clientX - _touchStartX;
  _touchStartX = null;
  if (Math.abs(dx) > SWIPE_THRESHOLD_PX) changeTuning(dx < 0 ? 1 : -1);
}, { passive: true });

// ── Event listeners ───────────────────────────────────────────────────────────

$tuningToggle.addEventListener('click', () =>
  $tuningDrawer.classList.contains('open') ? closeDrawer() : openDrawer()
);
$tuningBackdrop.addEventListener('click', closeDrawer);
$micBtn.addEventListener('click', toggleMic);
$repeatBtn.addEventListener('click', toggleRepeat);
$autoBtn.addEventListener('click', toggleAuto);
$guideBtn.addEventListener('click', toggleGuide);
$chrBtn.addEventListener('click', toggleChromatic);
$lowBtn.addEventListener('click', toggleLowMode);

// ── Init ──────────────────────────────────────────────────────────────────────

renderTuning();
player.preload(); // load samples in background before user taps a string
