import { PitchDetector } from "./pitch-detector.js";
import { TonePlayer } from "./tone-player.js";
import {
  TUNINGS,
  noteToFreq,
  noteInfoFromFreq,
  closestString,
} from "./tuning-data.js";
import { PitchTracker } from "./pitch-tracker.js";
const $ = (id) => document.getElementById(id);
const display = (n) => n.replace(/-?\d+$/, "").replace("#", "♯").replace("b", "♭");
const tracker = new PitchTracker();
const state = {
  tuningIdx: 0,
  micActive: false,
  micPending: false,
  locked: null,
  guide: false,
  guideIdx: 0,
  chromatic: false,
  repeat: false,
  auto: false,
  playIdx: 0,
  reference: 440,
  lastGood: 0,
  holdShown: false,
  timer: null,
};
const preset = () => TUNINGS[state.tuningIdx];
const player = new TonePlayer((status) => {
  $("sound-status").textContent =
    status === "loading"
      ? "Loading recording…"
      : status === "error"
        ? "Recording unavailable. Choose Pure tone or try again."
        : player.instrument === "sine"
          ? "Pure reference tone"
          : "Recorded guitar · calibrated playback";
});
const detector = new PitchDetector(onPitch, onMicState);
const writeStatus = (text) => {
  if ($("status-msg").textContent !== text) $("status-msg").textContent = text;
};
const error = (message) => {
  $("error-msg").textContent = message;
  $("error-msg").hidden = !message;
};
function syncButtons() {
  for (const [id, value] of [
    ["repeat-btn", state.repeat],
    ["auto-btn", state.auto],
    ["guide-btn", state.guide],
    ["chr-btn", state.chromatic],
  ]) {
    $(id).classList.toggle("active", value);
    $(id).setAttribute("aria-pressed", String(value));
  }
  $("unlock-btn").hidden = state.locked === null || state.guide;
  $("mic-button").disabled = state.micPending;
  $("mic-button").classList.toggle("active", state.micActive);
  $("mic-button").setAttribute("aria-pressed", String(state.micActive));
  $("mic-label").textContent = state.micPending
    ? "Connecting…"
    : state.micActive
      ? "Stop listening"
      : "Start tuning";
  $("mic-input").disabled = state.micPending;
  $("app").dataset.theme = state.guide
    ? "guide"
    : state.chromatic
      ? "chromatic"
      : "default";
}
function needle(cents = null, confirmed = false) {
  const value = cents === null ? 0 : Math.max(-50, Math.min(50, cents));
  const pct = ((value + 50) / 100) * 90 + 5;
  $("gauge-needle").style.left = $("gauge-dot").style.left = `${pct}%`;
  const direction =
    cents === null
      ? "neutral"
      : confirmed
        ? "in-tune"
        : cents < 0
          ? "flat"
          : cents > 0
            ? "sharp"
            : "neutral";
  $("gauge").className = `gauge ${direction}`;
  $("note-name").className =
    `note-name ${cents === null ? "" : confirmed ? "in-tune" : Math.abs(cents) < 20 ? "near" : "off"}`;
  $("gauge-needle").classList.toggle("in-tune", confirmed);
  $("gauge-dot").classList.toggle("in-tune", confirmed);
  $("gauge").setAttribute("aria-valuenow", String(Math.round(value)));
  $("gauge").setAttribute(
    "aria-valuetext",
    cents === null
      ? "No current reading"
      : `${Math.round(Math.abs(cents))} cents ${cents < 0 ? "flat" : cents > 0 ? "sharp" : "from target"}${confirmed ? ", in tune" : ""}`,
  );
  $("tune-tick").classList.toggle("visible", confirmed);
}
function idle() {
  tracker.reset();
  state.lastGood = 0;
  state.holdShown = false;
  $("note-name").textContent = "–";
  $("note-current").textContent = "Play one open string";
  $("cents-display").textContent = "– ¢";
  $("signal-meter").removeAttribute("data-level");
  needle();
  updateTarget();
  writeStatus(
    state.micActive
      ? "Listening. Pluck one string and mute the others."
      : "Start the microphone, or tap a string to hear its note.",
  );
}
function updateTarget() {
  $("note-target").textContent = state.guide
    ? `Guide ${state.guideIdx + 1}/6 · ${display(preset().strings[state.guideIdx])}`
    : state.chromatic
      ? "Chromatic · any note"
      : state.locked !== null
        ? `Locked · string ${6 - state.locked} · ${display(preset().strings[state.locked])}`
        : `${preset().name} · auto string`;
}
function renderStrings() {
  $("tuning-name").textContent = preset().name;
  $("tuning-notes").textContent = preset().strings.map(display).join(" · ");
  $("string-buttons").replaceChildren();
  preset().strings.forEach((note, i) => {
    const b = document.createElement("button");
    b.className = "string-btn";
    b.type = "button";
    b.dataset.idx = i;
    b.setAttribute(
      "aria-label",
      `String ${6 - i}, ${display(note)}. ${state.micActive ? "Lock target and hear note" : "Hear reference note"}`,
    );
    b.setAttribute(
      "aria-pressed",
      String(state.locked === i || (state.guide && state.guideIdx === i)),
    );
    const number = document.createElement("small");
    number.textContent = 6 - i;
    const name = document.createElement("span");
    name.textContent = display(note);
    b.append(number, name);
    b.classList.toggle(
      "guide-target",
      (state.guide && state.guideIdx === i) || state.locked === i,
    );
    b.addEventListener("click", () => {
      state.playIdx = i;
      if (state.micActive) {
        state.guide = false;
        state.chromatic = false;
        state.locked = i;
        tracker.reset();
        syncButtons();
        renderStrings();
        updateTarget();
      }
      if (state.repeat || state.auto) startPlayback();
      else playString(i);
    });
    $("string-buttons").append(b);
  });
}
async function playString(i) {
  tracker.lost();
  needle();
  const buttons = [...$("string-buttons").children];
  buttons.forEach((b, j) => b.classList.toggle("playing", i === j));
  try {
    await player.playNote(preset().strings[i], 3, state.reference);
    error("");
  } catch (e) {
    error(e.message);
  }
  setTimeout(() => buttons[i]?.classList.remove("playing"), 3100);
}
function stopPlayback() {
  clearInterval(state.timer);
  state.timer = null;
  player.stop();
  [...$("string-buttons").children].forEach((b) =>
    b.classList.remove("playing"),
  );
}
function startPlayback() {
  stopPlayback();
  playString(state.playIdx);
  if (!state.repeat && !state.auto) return;
  let count = 0;
  state.timer = setInterval(() => {
    if (state.auto && (!state.repeat || ++count >= 3)) {
      state.playIdx = (state.playIdx + 1) % 6;
      count = 0;
    }
    playString(state.playIdx);
  }, 3500);
}
function onPitch(result) {
  if (!state.micActive) return;
  const now = performance.now();
  if (now < player.soundingUntil) {
    tracker.lost();
    needle();
    writeStatus("Reference playing. Listening resumes after it fades.");
    return;
  }
  const level = Math.max(0, Math.min(4, Math.ceil((result.levelDb + 60) / 12)));
  $("signal-meter").setAttribute("data-level", level);
  $("signal-meter").setAttribute(
    "aria-label",
    `Microphone level ${level} of 4`,
  );
  if (!result.freq) {
    tracker.lost();
    needle();
    if (state.lastGood && now - state.lastGood < 500) {
      $("note-current").textContent = "Last reading · pluck again";
      state.holdShown = true;
    } else if (state.lastGood) {
      $("note-name").textContent = "–";
      $("cents-display").textContent = "– ¢";
      $("note-current").textContent = "No current pitch";
      state.lastGood = 0;
    }
    writeStatus(
      result.reason === "clipping"
        ? "Input is too loud. Move back or reduce the microphone gain."
        : result.reason === "quiet"
          ? "Listening. Pluck a string closer to the microphone."
          : "No steady pitch. Mute the other strings and pluck once.",
    );
    return;
  }
  let match;
  if (state.chromatic) {
    const info = noteInfoFromFreq(result.freq, state.reference);
    match = {
      noteStr: info.noteStr,
      target: noteToFreq(info.noteStr, state.reference),
      idx: null,
    };
  } else {
    const idx = state.guide ? state.guideIdx : state.locked;
    match =
      idx === null
        ? closestString(result.freq, preset(), state.reference)
        : {
            idx,
            noteStr: preset().strings[idx],
            target: noteToFreq(preset().strings[idx], state.reference),
          };
  }
  const key = `${state.tuningIdx}:${match.noteStr}:${match.idx}`;
  const reading = tracker.update(
    result.freq,
    key,
    (f) => 1200 * Math.log2(f / match.target),
    now,
  );
  state.lastGood = now;
  state.holdShown = false;
  $("note-name").textContent = display(match.noteStr);
  const detected = noteInfoFromFreq(reading.freq, state.reference);
  $("note-current").textContent =
    `Heard ${display(detected.noteStr)} · ${reading.freq.toFixed(1)} Hz`;
  const cents = Math.round(reading.cents);
  $("cents-display").textContent = `${cents > 0 ? "+" : ""}${cents} ¢`;
  updateTarget();
  needle(reading.cents, reading.confirmed);
  [...$("string-buttons").children].forEach((b, i) => {
    b.classList.toggle("active", match.idx === i);
    b.classList.toggle("in-tune", match.idx === i && reading.confirmed);
  });
  writeStatus(
    reading.confirmed
      ? "In tune."
      : Math.abs(reading.cents) <= 5
        ? "Hold steady…"
        : `${reading.cents < 0 ? "Raise" : "Lower"} pitch${Math.abs(reading.cents) > 100 ? " · check the intended string" : ""}.`,
  );
  if (state.guide && reading.confirmed) {
    tracker.reset();
    state.guideIdx++;
    if (state.guideIdx === 6) {
      state.guide = false;
      state.locked = null;
      writeStatus(
        "All six strings checked. Play a chord, then check once more.",
      );
    }
    renderStrings();
    syncButtons();
    updateTarget();
  }
}
function onMicState(status) {
  if (status === "ended") {
    state.micActive = false;
    idle();
    error("Microphone disconnected. Reconnect it and start tuning again.");
    syncButtons();
  } else if (status === "suspended" || status === "interrupted")
    writeStatus(
      "Microphone paused by the browser. Stop and restart listening to resume.",
    );
}
async function refreshInputs() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const selected = $("mic-input").value;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    $("mic-input").replaceChildren(new Option("Default microphone", ""));
    devices
      .filter((d) => d.kind === "audioinput" && d.deviceId !== "default")
      .forEach((d, i) =>
        $("mic-input").add(
          new Option(d.label || `Microphone ${i + 1}`, d.deviceId),
        ),
      );
    if ([...$("mic-input").options].some((o) => o.value === selected))
      $("mic-input").value = selected;
  } catch {}
}
async function toggleMic() {
  if (state.micPending) return;
  if (state.micActive) {
    detector.stop();
    state.micActive = false;
    idle();
    syncButtons();
    return;
  }
  state.micPending = true;
  syncButtons();
  stopPlayback();
  state.repeat = state.auto = false;
  syncButtons();
  error("");
  try {
    await detector.start($("mic-input").value);
    if (!detector._running) return;
    state.micActive = true;
    idle();
    await refreshInputs();
    const s = detector.settings;
    $("input-status").textContent =
      `${Math.round((detector.context.sampleRate / 1000) * 10) / 10} kHz · ${s.echoCancellation === true || s.noiseSuppression === true || s.autoGainControl === true ? "Microphone processing is enabled by this device" : "Music input requested"} · audio stays on this device`;
  } catch (e) {
    error(e.message);
  } finally {
    state.micPending = false;
    syncButtons();
    renderStrings();
  }
}
function renderTunings() {
  const query = $("tuning-search").value.trim().toLowerCase();
  $("tuning-list").replaceChildren();
  let group = "",
    count = 0;
  TUNINGS.forEach((t, i) => {
    if (
      !`${t.name} ${t.label} ${t.group} ${t.strings.join(" ")}`
        .toLowerCase()
        .includes(query)
    )
      return;
    if (t.group !== group) {
      const h = document.createElement("div");
      h.className = "preset-group";
      h.textContent = t.group;
      $("tuning-list").append(h);
      group = t.group;
    }
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tuning-drawer-item";
    b.classList.toggle("selected", i === state.tuningIdx);
    b.setAttribute("aria-pressed", String(i === state.tuningIdx));
    const name = document.createElement("span");
    name.className = "tuning-drawer-item-name";
    name.textContent = t.label;
    const notes = document.createElement("span");
    notes.className = "tuning-drawer-item-notes";
    notes.textContent = t.strings.map(display).join(" · ");
    b.append(name, notes);
    b.addEventListener("click", () => selectTuning(i));
    $("tuning-list").append(b);
    count++;
  });
  $("preset-count").textContent =
    `${count} ${count === 1 ? "tuning" : "tunings"}`;
  if (!count) {
    const empty = document.createElement("p");
    empty.className = "preset-empty";
    empty.textContent =
      "No matching tunings. Try a note pattern, such as DADGAD.";
    $("tuning-list").append(empty);
  }
}
function openDrawer() {
  $("tuning-search").value = "";
  renderTunings();
  $("tuning-drawer").inert = false;
  $("tuning-drawer").classList.add("open");
  $("tuning-drawer").setAttribute("aria-hidden", "false");
  $("tuning-toggle").setAttribute("aria-expanded", "true");
  // Keep the page still and avoid summoning the phone keyboard on opening.
  $("drawer-close").focus({ preventScroll: true });
}
function closeDrawer() {
  $("tuning-toggle").focus({ preventScroll: true });
  $("tuning-drawer").classList.remove("open");
  $("tuning-drawer").setAttribute("aria-hidden", "true");
  $("tuning-drawer").inert = true;
  $("tuning-toggle").setAttribute("aria-expanded", "false");
}
function selectTuning(i) {
  state.tuningIdx = i;
  state.guideIdx = 0;
  state.playIdx = 0;
  state.locked = null;
  stopPlayback();
  state.repeat = state.auto = false;
  renderStrings();
  idle();
  syncButtons();
  closeDrawer();
  try {
    localStorage.setItem("tuner-preset", preset().name);
  } catch {}
}
$("tuning-toggle").addEventListener("click", openDrawer);
$("tuning-backdrop").addEventListener("click", closeDrawer);
$("drawer-close").addEventListener("click", closeDrawer);
$("tuning-search").addEventListener("input", renderTunings);
$("tuning-drawer").addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    closeDrawer();
  }
  if (e.key === "Tab") {
    const nodes = [...$("tuning-panel").querySelectorAll("button,input")];
    const first = nodes[0],
      last = nodes.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});
$("mic-button").addEventListener("click", toggleMic);
$("mic-input").addEventListener("change", async () => {
  if (state.micActive) {
    detector.stop();
    state.micActive = false;
    await toggleMic();
  }
});
$("sensitivity").addEventListener("input", () => {
  detector.options.minRms = 10 ** (-Number($("sensitivity").value) / 20);
});
$("reference-pitch").addEventListener("change", () => {
  const value = Number($("reference-pitch").value);
  state.reference = Number.isFinite(value)
    ? Math.max(415, Math.min(466, value))
    : 440;
  $("reference-pitch").value = state.reference;
  stopPlayback();
  state.repeat = state.auto = false;
  syncButtons();
  idle();
});
$("sound-select").addEventListener("change", () => {
  player.instrument = $("sound-select").value;
  stopPlayback();
  state.repeat = state.auto = false;
  syncButtons();
  $("sound-status").textContent =
    player.instrument === "sine"
      ? "Pure reference tone"
      : "Recorded guitar · calibrated playback";
});
$("volume").addEventListener("input", () => {
  player.volume = Number($("volume").value) / 100;
});
$("unlock-btn").addEventListener("click", () => {
  state.locked = null;
  tracker.reset();
  renderStrings();
  syncButtons();
  updateTarget();
});
$("repeat-btn").addEventListener("click", () => {
  state.repeat = !state.repeat;
  state.guide = false;
  syncButtons();
  renderStrings();
  if (state.repeat || state.auto) startPlayback();
  else stopPlayback();
});
$("auto-btn").addEventListener("click", () => {
  state.auto = !state.auto;
  state.guide = false;
  syncButtons();
  renderStrings();
  if (state.repeat || state.auto) startPlayback();
  else stopPlayback();
});
$("chr-btn").addEventListener("click", () => {
  state.chromatic = !state.chromatic;
  state.guide = false;
  state.locked = null;
  idle();
  renderStrings();
  syncButtons();
});
$("guide-btn").addEventListener("click", async () => {
  state.guide = !state.guide;
  state.guideIdx = 0;
  state.locked = null;
  state.chromatic = false;
  state.repeat = state.auto = false;
  stopPlayback();
  if (state.guide && !state.micActive) await toggleMic();
  if (!state.micActive) state.guide = false;
  idle();
  renderStrings();
  syncButtons();
});
window.addEventListener("pagehide", () => {
  detector.stop();
  stopPlayback();
  state.micActive = false;
  state.micPending = false;
  idle();
  syncButtons();
});
navigator.mediaDevices?.addEventListener("devicechange", refreshInputs);
document.addEventListener("keydown", (e) => {
  if (
    e.target.matches("input,select,textarea,button") ||
    $("tuning-drawer").classList.contains("open") ||
    e.metaKey ||
    e.ctrlKey ||
    e.altKey
  )
    return;
  if (/^[1-6]$/.test(e.key)) {
    e.preventDefault();
    $("string-buttons").children[6 - Number(e.key)].click();
  }
});
try {
  const saved = TUNINGS.findIndex(
    (t) => t.name === localStorage.getItem("tuner-preset"),
  );
  if (saved >= 0) state.tuningIdx = saved;
} catch {}
renderStrings();
idle();
syncButtons();
refreshInputs();
player.preload();
