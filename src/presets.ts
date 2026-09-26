// The MIDI player's built-in files. Each file lives in midi/ (copied into
// dist/ by the build) and must hold a single instrument part. The id is the
// ?midi=<id> link, so keep it stable once published. key, mode and sound
// are applied when the file is loaded; key is a KEYS name, mode a MODES
// name, sound a BUILT_IN_SOUNDS name. key is also what "Play in"
// transposes from.

export interface MidiPreset {
  id: string;
  name: string;
  file: string;
  key: string;
  mode: string;
  sound?: string;
}

export const MIDI_PRESETS: MidiPreset[] = [
  { id: 'bach-prelude-in-c', name: 'Bach - Prelude in C', file: 'bach-prelude-in-c.mid', key: 'C', mode: 'Ionian', sound: 'Classic' },
  { id: 'ode-to-joy', name: 'Beethoven - Ode to Joy', file: 'ode-to-joy.mid', key: 'D', mode: 'Ionian', sound: 'Brass' },
  { id: 'pachelbel-canon', name: 'Pachelbel - Canon in D', file: 'pachelbel-canon.mid', key: 'D', mode: 'Ionian', sound: 'Pad' },
  { id: 'greensleeves', name: 'Greensleeves', file: 'greensleeves.mid', key: 'A', mode: 'Aeolian', sound: 'Flute' },
  { id: 'gymnopedie-no-1', name: 'Satie - Gymnopédie No. 1', file: 'gymnopedie-no-1.mid', key: 'D', mode: 'Ionian', sound: 'Classic' },
];
