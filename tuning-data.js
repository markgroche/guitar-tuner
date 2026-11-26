const PITCH_CLASSES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const CHROMATIC_NAMES = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
];
export function noteToMidi(note) {
  const m = /^([A-Ga-g])([#♯b♭]?)(-?\d)$/.exec(note.trim());
  if (!m)
    throw new Error(`Use a note and octave, for example E2 or F#3: ${note}`);
  return (
    (Number(m[3]) + 1) * 12 +
    PITCH_CLASSES[m[1].toUpperCase()] +
    (["#", "♯"].includes(m[2]) ? 1 : ["b", "♭"].includes(m[2]) ? -1 : 0)
  );
}
export function noteToFreq(note, reference = 440) {
  return reference * 2 ** ((noteToMidi(note) - 69) / 12);
}
export function noteInfoFromFreq(freq, reference = 440) {
  const value = 69 + 12 * Math.log2(freq / reference),
    midi = Math.round(value);
  return {
    midi,
    noteStr: `${CHROMATIC_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`,
    cents: (value - midi) * 100,
  };
}
const tuning = (name, group, notes) => ({
  name,
  label: name,
  group,
  strings: notes.split(" "),
});
export const TUNINGS = [
  tuning("Standard", "Standard", "E2 A2 D3 G3 B3 E4"),
  tuning("Half Step Down", "Standard", "Eb2 Ab2 Db3 Gb3 Bb3 Eb4"),
  {
    ...tuning("D Standard", "Standard", "D2 G2 C3 F3 A3 D4"),
    label: "D Standard · Full step down",
  },
  tuning("C♯ Standard", "Standard", "C#2 F#2 B2 E3 G#3 C#4"),
  tuning("C Standard", "Standard", "C2 F2 Bb2 Eb3 G3 C4"),
  tuning("Drop D", "Drop", "D2 A2 D3 G3 B3 E4"),
  tuning("Double Drop D", "Drop", "D2 A2 D3 G3 B3 D4"),
  tuning("Drop C♯", "Drop", "C#2 G#2 C#3 F#3 A#3 D#4"),
  tuning("Drop C", "Drop", "C2 G2 C3 F3 A3 D4"),
  tuning("Drop B", "Drop", "B1 F#2 B2 E3 G#3 C#4"),
  tuning("Open C", "Open", "C2 G2 C3 G3 C4 E4"),
  tuning("Open C Minor", "Open", "C2 G2 C3 G3 C4 Eb4"),
  tuning("Open C6", "Open", "C2 G2 C3 G3 A3 E4"),
  tuning("Open D", "Open", "D2 A2 D3 F#3 A3 D4"),
  tuning("Open D Minor", "Open", "D2 A2 D3 F3 A3 D4"),
  tuning("Open E", "Open", "E2 B2 E3 G#3 B3 E4"),
  tuning("Open G", "Open", "D2 G2 D3 G3 B3 D4"),
  tuning("Open G Minor", "Open", "D2 G2 D3 G3 Bb3 D4"),
  tuning("Open A", "Open", "E2 A2 E3 A3 C#4 E4"),
  tuning("DADGAD", "Modal", "D2 A2 D3 G3 A3 D4"),
];
export function closestString(freq, preset, reference = 440) {
  return preset.strings.reduce((best, noteStr, idx) => {
    const target = noteToFreq(noteStr, reference),
      cents = 1200 * Math.log2(freq / target);
    return !best || Math.abs(cents) < Math.abs(best.cents)
      ? { idx, noteStr, target, cents }
      : best;
  }, null);
}
