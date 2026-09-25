// Sound: a small Web Audio synth that voices the held notes, plus the pure
// settings helpers behind the Sound tab. Everything above the Synth class is
// DOM- and audio-free so it can be unit-tested in node.
//
// Signal path: per held note, one oscillator (or a detuned, stereo-spread
// stack of them with Unison, all wobbled by a shared Vibrato LFO) into the
// note's own lowpass filter (Brightness, swept by the Filter envelope) and
// its envelope gain (attack/decay/sustain/release). All notes sum into a
// master gain (the global Volume). From there a dry path and a convolution
// reverb meet in a compressor used as a limiter, so a big chord never clips.

export type Waveform = 'sine' | 'triangle' | 'square' | 'sawtooth';
export const WAVEFORMS: Waveform[] = ['sine', 'triangle', 'square', 'sawtooth'];

// A sound's numeric settings, each an integer within SOUND_KNOB_RANGE.
export type SoundKnob =
  'brightness' | 'attackMs' | 'decayMs' | 'sustain' | 'releaseMs' | 'velocity' |
  'filterEnvAmount' | 'filterEnvMs' | 'vibratoRate' | 'vibratoDepth' | 'vibratoDelayMs' |
  'unisonVoices' | 'unisonDetune' | 'reverb' | 'reverbLengthMs';

export const SOUND_KNOB_RANGE: Record<SoundKnob, [min: number, max: number]> = {
  brightness: [0, 100],
  attackMs: [0, 2000],
  decayMs: [0, 5000],
  sustain: [0, 100],
  releaseMs: [0, 5000],
  velocity: [0, 100],
  filterEnvAmount: [0, 100],
  filterEnvMs: [10, 5000],
  // In tenths of a hertz, so the slider can pick 5.5 Hz with whole numbers.
  vibratoRate: [10, 120],
  vibratoDepth: [0, 100],
  vibratoDelayMs: [0, 2000],
  unisonVoices: [2, 7],
  unisonDetune: [0, 50],
  reverb: [0, 100],
  reverbLengthMs: [500, 6000],
};

export const SOUND_KNOBS = Object.keys(SOUND_KNOB_RANGE) as SoundKnob[];

// A sound's on/off effects. Each one's options (e.g. unisonVoices) are kept
// while it's off, so switching it back on restores them.
export type SoundToggle = 'filterEnv' | 'vibrato' | 'unison' | 'reverbEnabled';
export const SOUND_TOGGLES: SoundToggle[] = ['filterEnv', 'vibrato', 'unison', 'reverbEnabled'];

// A named sound: the tone, every knob and every effect toggle. The Sound tab
// edits these the way the Themes tab edits color sets (built-ins, custom
// copies, a modified flag). Volume is deliberately not part of a sound: it's
// a global setting, so switching sounds never changes how loud things are.
export interface NamedSound extends Record<SoundKnob, number>, Record<SoundToggle, boolean> {
  name: string;
  waveform: Waveform;
}

// What the synth plays with: the selected sound plus the global settings.
export interface SoundSettings extends NamedSound {
  enabled: boolean;
  volume: number;
}

// Settings added after sounds were first saved, with values that leave a
// sound exactly as it played before they existed. parseNamedSound fills
// them in when a saved sound lacks them. reverbEnabled isn't listed: it
// defaults to whether the saved sound had any reverb (see parseNamedSound).
const ADDED_KNOB_DEFAULTS: Partial<Record<SoundKnob, number>> = {
  decayMs: 0, sustain: 100, reverb: 0, unisonVoices: 3, unisonDetune: 12, reverbLengthMs: 2200,
  filterEnvAmount: 50, filterEnvMs: 400, vibratoRate: 55, vibratoDepth: 15, vibratoDelayMs: 300,
};
const ADDED_KEYS = [...Object.keys(ADDED_KNOB_DEFAULTS), ...SOUND_TOGGLES];

// Built-in sounds, always present: they can be edited (and reset) but not
// renamed or deleted. The first is the default.
//   Classic  - electric-piano-ish: a bright, bell-like strike that mellows
//              as it rings down to a low sustain.
//   Flute    - soft sine that eases in, with vibrato that arrives late.
//   Organ    - no decay (an organ doesn't fade), 2-voice chorus, and a
//              fast shallow vibrato like an organ's scanner.
//   Brass    - 3-voice sawtooth section with a filter "blat" on each note
//              and a delayed vibrato.
//   Pad      - slow, dark and wide: 5 voices, a slow filter sweep, and a
//              long reverb.
//   Chiptune - instant and dry, with a short blip of decay and the wide,
//              quick vibrato of an old game lead.
//   Hoover      - the 90s rave hoover: a huge detuned, sweeping wall.
//   Seasick     - slow, deep pitch sway, like a cassette left in a hot car.
//   Cathedral   - everything melts into a cloud that takes seconds to die.
//   Laser Harp  - zappy "pew" plucks with a long tail.
//   Bees        - a buzzing, angry swarm; best with chords.
//   Ghost Choir - breathy "ooh" pads that swell in from nowhere.
//   Broken Toy  - an out-of-tune toy piano with a dying battery.
//   Drunk Organ - an organ whose vibrato has had several too many.
const FX_OFF = {
  filterEnv: false, filterEnvAmount: 50, filterEnvMs: 400,
  vibrato: false, vibratoRate: 55, vibratoDepth: 15, vibratoDelayMs: 300,
  unison: false, unisonVoices: 3, unisonDetune: 12,
  reverbEnabled: false, reverb: 20, reverbLengthMs: 2000,
};

export const BUILT_IN_SOUNDS: NamedSound[] = [
  { name: 'Classic', waveform: 'triangle', brightness: 60, attackMs: 5, decayMs: 1500, sustain: 35, releaseMs: 300, velocity: 60,
    ...FX_OFF, filterEnv: true, filterEnvAmount: 40, filterEnvMs: 800,
    reverbEnabled: true, reverb: 20, reverbLengthMs: 1800 },
  { name: 'Flute', waveform: 'sine', brightness: 45, attackMs: 80, decayMs: 300, sustain: 85, releaseMs: 250, velocity: 40,
    ...FX_OFF, vibrato: true, vibratoRate: 50, vibratoDepth: 12, vibratoDelayMs: 400,
    reverbEnabled: true, reverb: 30, reverbLengthMs: 2200 },
  { name: 'Organ', waveform: 'square', brightness: 40, attackMs: 10, decayMs: 0, sustain: 100, releaseMs: 60, velocity: 0,
    ...FX_OFF, vibrato: true, vibratoRate: 65, vibratoDepth: 6, vibratoDelayMs: 0,
    unison: true, unisonVoices: 2, unisonDetune: 6, reverbEnabled: true, reverb: 25, reverbLengthMs: 1500 },
  { name: 'Brass', waveform: 'sawtooth', brightness: 55, attackMs: 60, decayMs: 400, sustain: 70, releaseMs: 200, velocity: 70,
    ...FX_OFF, filterEnv: true, filterEnvAmount: 60, filterEnvMs: 250,
    vibrato: true, vibratoRate: 55, vibratoDepth: 10, vibratoDelayMs: 500,
    unison: true, unisonVoices: 3, unisonDetune: 10, reverbEnabled: true, reverb: 20, reverbLengthMs: 1600 },
  { name: 'Pad', waveform: 'sawtooth', brightness: 30, attackMs: 700, decayMs: 2000, sustain: 80, releaseMs: 1800, velocity: 20,
    ...FX_OFF, filterEnv: true, filterEnvAmount: 30, filterEnvMs: 2500,
    unison: true, unisonVoices: 5, unisonDetune: 18, reverbEnabled: true, reverb: 60, reverbLengthMs: 4000 },
  { name: 'Chiptune', waveform: 'square', brightness: 100, attackMs: 0, decayMs: 150, sustain: 60, releaseMs: 30, velocity: 0,
    ...FX_OFF, vibrato: true, vibratoRate: 60, vibratoDepth: 25, vibratoDelayMs: 250 },
  // The outrageous ones. They started as hidden "bad" presets and turned
  // out to be too much fun to hide.
  { name: 'Hoover', waveform: 'sawtooth', brightness: 45, attackMs: 20, decayMs: 800, sustain: 80, releaseMs: 400, velocity: 30,
    ...FX_OFF, filterEnv: true, filterEnvAmount: 100, filterEnvMs: 1500,
    vibrato: true, vibratoRate: 50, vibratoDepth: 30, vibratoDelayMs: 200,
    unison: true, unisonVoices: 7, unisonDetune: 50, reverbEnabled: true, reverb: 40, reverbLengthMs: 2500 },
  { name: 'Seasick', waveform: 'triangle', brightness: 55, attackMs: 30, decayMs: 0, sustain: 100, releaseMs: 500, velocity: 30,
    ...FX_OFF, vibrato: true, vibratoRate: 15, vibratoDepth: 100, vibratoDelayMs: 0,
    unison: true, unisonVoices: 3, unisonDetune: 40, reverbEnabled: true, reverb: 50, reverbLengthMs: 3000 },
  { name: 'Cathedral', waveform: 'sine', brightness: 50, attackMs: 400, decayMs: 0, sustain: 100, releaseMs: 5000, velocity: 30,
    ...FX_OFF, reverbEnabled: true, reverb: 100, reverbLengthMs: 6000 },
  { name: 'Laser Harp', waveform: 'square', brightness: 35, attackMs: 0, decayMs: 300, sustain: 0, releaseMs: 200, velocity: 50,
    ...FX_OFF, filterEnv: true, filterEnvAmount: 100, filterEnvMs: 60,
    reverbEnabled: true, reverb: 30, reverbLengthMs: 3000 },
  { name: 'Bees', waveform: 'sawtooth', brightness: 100, attackMs: 10, decayMs: 0, sustain: 100, releaseMs: 100, velocity: 20,
    ...FX_OFF, vibrato: true, vibratoRate: 120, vibratoDepth: 40, vibratoDelayMs: 0,
    unison: true, unisonVoices: 7, unisonDetune: 50 },
  { name: 'Ghost Choir', waveform: 'sine', brightness: 40, attackMs: 1500, decayMs: 0, sustain: 100, releaseMs: 2500, velocity: 20,
    ...FX_OFF, vibrato: true, vibratoRate: 55, vibratoDepth: 20, vibratoDelayMs: 800,
    unison: true, unisonVoices: 5, unisonDetune: 25, reverbEnabled: true, reverb: 80, reverbLengthMs: 5000 },
  { name: 'Broken Toy', waveform: 'square', brightness: 70, attackMs: 0, decayMs: 120, sustain: 20, releaseMs: 150, velocity: 60,
    ...FX_OFF, vibrato: true, vibratoRate: 90, vibratoDepth: 60, vibratoDelayMs: 0,
    unison: true, unisonVoices: 2, unisonDetune: 35 },
  { name: 'Drunk Organ', waveform: 'square', brightness: 45, attackMs: 10, decayMs: 0, sustain: 100, releaseMs: 80, velocity: 0,
    ...FX_OFF, vibrato: true, vibratoRate: 70, vibratoDepth: 70, vibratoDelayMs: 0,
    unison: true, unisonVoices: 2, unisonDetune: 50, reverbEnabled: true, reverb: 25, reverbLengthMs: 1500 },
];

// Off by default: most MIDI keyboards make their own sound, and doubling it
// through the speakers (with browser latency) is worse than silence.
export const DEFAULT_SOUND_ENABLED = false;
export const DEFAULT_VOLUME = 70;
export const MAX_VOLUME = 100;

// Notes from the on-screen keyboard have no velocity; treat them as a
// fairly firm press.
export const MOUSE_VELOCITY = 100;

export function isWaveform(value: unknown): value is Waveform {
  return typeof value === 'string' && (WAVEFORMS as string[]).includes(value);
}

// An integer as typed or stored, within min..max, else null.
function parseIntInRange(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}

export function parseSoundKnob(knob: SoundKnob, value: unknown): number | null {
  return parseIntInRange(value, ...SOUND_KNOB_RANGE[knob]);
}

export function parseVolume(value: unknown): number | null {
  return parseIntInRange(value, 0, MAX_VOLUME);
}

export function soundEqual(a: NamedSound, b: NamedSound): boolean {
  return a.waveform === b.waveform &&
    SOUND_KNOBS.every(knob => a[knob] === b[knob]) &&
    SOUND_TOGGLES.every(toggle => a[toggle] === b[toggle]);
}

// Validates arbitrary parsed JSON (the soundPresets cookie) into one named
// sound. Strict, like parseChordFormulas: every knob must be a whole number
// in range and every toggle a boolean, else null. The one leniency is a
// setting added later (ADDED_KNOB_DEFAULTS, the toggles), which may be
// absent so older saves still load. Unknown fields (like the old per-sound
// volume) are ignored.
export function parseNamedSound(raw: unknown): NamedSound | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const t = raw as Record<string, unknown>;
  if (typeof t.name !== 'string' || !t.name.trim() || !isWaveform(t.waveform)) return null;
  const sound = { name: t.name.trim(), waveform: t.waveform } as NamedSound;
  for (const knob of SOUND_KNOBS) {
    const n = t[knob] === undefined ? ADDED_KNOB_DEFAULTS[knob] : t[knob];
    const [min, max] = SOUND_KNOB_RANGE[knob];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) return null;
    sound[knob] = n;
  }
  const toggleDefaults: Record<SoundToggle, boolean> = {
    filterEnv: false, vibrato: false, unison: false, reverbEnabled: sound.reverb > 0,
  };
  for (const toggle of SOUND_TOGGLES) {
    const b = t[toggle] === undefined ? toggleDefaults[toggle] : t[toggle];
    if (typeof b !== 'boolean') return null;
    sound[toggle] = b;
  }
  return sound;
}

// The saved list of named sounds; null if it's empty or any entry is
// malformed. A built-in saved before the latest added settings is replaced
// by its current version: the built-ins get retuned around new settings,
// and keeping the old copy would leave it stuck showing "(modified)".
export function parseNamedSounds(raw: unknown): NamedSound[] | null {
  if (!Array.isArray(raw)) return null;
  const result: NamedSound[] = [];
  for (const item of raw) {
    const sound = parseNamedSound(item);
    if (!sound) return null;
    const builtIn = BUILT_IN_SOUNDS.find(b => b.name === sound.name);
    const predatesAddedSettings = ADDED_KEYS.some(key => !(key in (item as object)));
    result.push(builtIn && predatesAddedSettings ? { ...builtIn } : sound);
  }
  return result.length ? result : null;
}

// Unison: the detune in cents of each stacked oscillator, spread evenly
// across -detune..+detune. A single voice sits in tune.
export function unisonDetunes(voices: number, detune: number): number[] {
  if (voices <= 1) return [0];
  return Array.from({ length: voices }, (_, i) => -detune + (2 * detune * i) / (voices - 1));
}

// ...and where each sits in the stereo field, spread the same way, so a
// unison note sounds wide rather than just thick.
const UNISON_PAN_WIDTH = 0.7;

export function unisonPans(voices: number): number[] {
  return unisonDetunes(voices, UNISON_PAN_WIDTH);
}

// Equal temperament, A4 (MIDI 69) = 440 Hz.
export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Brightness 0..100 to a lowpass cutoff, spaced exponentially so each step
// of the slider sounds like roughly the same amount of change.
const MIN_CUTOFF_HZ = 150;
const MAX_CUTOFF_HZ = 18000;

export function brightnessToCutoff(brightness: number): number {
  return MIN_CUTOFF_HZ * Math.pow(MAX_CUTOFF_HZ / MIN_CUTOFF_HZ, brightness / 100);
}

// Filter envelope: where a note's cutoff starts before settling back to
// Brightness. Amount 100 opens it up to FILTER_ENV_OCTAVES octaves higher,
// capped at the top of the Brightness range.
const FILTER_ENV_OCTAVES = 5;

export function filterEnvStartCutoff(brightness: number, amount: number): number {
  return Math.min(brightnessToCutoff(brightness) * Math.pow(2, FILTER_ENV_OCTAVES * amount / 100), MAX_CUTOFF_HZ);
}

// The Vibrato Rate knob is in tenths of a hertz.
export function vibratoHz(rate: number): number {
  return rate / 10;
}

// Volume 0..100 to a master gain. Squared because loudness is perceived
// roughly logarithmically; linear gain crowds all the change at the bottom.
export function volumeToGain(volume: number): number {
  return Math.pow(volume / 100, 2);
}

// How loud one note plays, 0..1. At sensitivity 0 every note is full level;
// at 100 the level follows velocity (squared, like volume).
export function velocityGain(velocity: number, sensitivity: number): number {
  const v = Math.min(Math.max(velocity, 0), 127) / 127;
  const s = sensitivity / 100;
  return 1 - s + s * v * v;
}

// Square and sawtooth carry far more energy than a sine at the same
// amplitude; scale them down so switching the tone doesn't jump the volume.
const WAVEFORM_LEVEL: Record<Waveform, number> = {
  sine: 1,
  triangle: 0.9,
  square: 0.4,
  sawtooth: 0.5,
};

// Per-voice headroom before the limiter: a few notes sum well under 1.
const VOICE_LEVEL = 0.3;

// Reverb 0..100 to the dry and wet levels. The dry path only dips a little
// so turning reverb up adds room rather than pushing the note away. Off is
// fully dry.
export function reverbMix(reverb: number, enabled = true): { dry: number; wet: number } {
  if (!enabled) return { dry: 1, wet: 0 };
  const r = reverb / 100;
  return { dry: 1 - 0.4 * r, wet: 0.9 * r };
}

// The attack/decay part of a note's envelope, as scheduled at note-on. Times
// are in audio-context seconds; decayTau is setTargetAtTime's time constant
// (0 means the level jumps straight to sustain after the attack).
export interface EnvelopeShape {
  start: number;
  attackEnd: number;
  peak: number;
  sustainLevel: number;
  decayTau: number;
}

// The envelope's level at time t, mirroring what noteOn schedules. Release
// fades from this value rather than reading AudioParam.value, which isn't
// reliably the live level in every browser, and rather than
// cancelAndHoldAtTime, which Chromium gets wrong mid-decay (the fade after
// it drops straight to 0).
export function envelopeLevelAt(env: EnvelopeShape, t: number): number {
  if (t <= env.start) return 0;
  if (t < env.attackEnd) return env.peak * (t - env.start) / (env.attackEnd - env.start);
  if (env.decayTau <= 0) return env.sustainLevel;
  return env.sustainLevel + (env.peak - env.sustainLevel) * Math.exp(-(t - env.attackEnd) / env.decayTau);
}

// Never ramp over less than this, even with Attack/Release at 0: an
// instant jump in level is an audible click.
const MIN_RAMP_S = 0.005;

export type VoiceKey = number | string;

interface Voice {
  oscs: OscillatorNode[];
  filter: BiquadFilterNode;
  env: GainNode;
  shape: EnvelopeShape;
  // The vibrato LFO and the gain that scales it to cents; null when the
  // note started with vibrato off.
  lfo: OscillatorNode | null;
  lfoDepth: GainNode | null;
}

export class Synth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private dry: GainNode | null = null;
  private wet: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private impulseLengthMs = 0;
  // Keyed by the caller's voice key, which defaults to the MIDI note. A
  // different key lets the same pitch sound twice, e.g. a tone shared by
  // two overlapping chords, each released on its own.
  private voices = new Map<VoiceKey, Voice>();
  private muted = false;

  // onStateChange fires whenever the audio context starts, suspends or is
  // first created, so the UI can offer to unlock sound (see isRunning).
  constructor(private settings: SoundSettings, private onStateChange: () => void = () => {}) {}

  // False until the browser lets audio play. Chrome and Safari keep a new
  // AudioContext suspended until the page gets a click or key press; MIDI
  // input doesn't count.
  get isRunning(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  configure(settings: SoundSettings): void {
    this.settings = settings;
    if (!settings.enabled) {
      this.allOff();
      return;
    }
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(volumeToGain(settings.volume), now, 0.02);
    const mix = reverbMix(settings.reverb, settings.reverbEnabled);
    this.dry?.gain.setTargetAtTime(mix.dry, now, 0.02);
    this.wet?.gain.setTargetAtTime(mix.wet, now, 0.02);
    this.updateImpulse();
    // Tone, brightness, detune and vibrato rate/depth follow live on held
    // notes (a brightness change overrides a filter sweep in progress).
    // Turning an effect on or off, or the number of unison voices, only
    // applies from the next note.
    const cutoff = brightnessToCutoff(settings.brightness);
    this.voices.forEach(voice => {
      const detunes = unisonDetunes(voice.oscs.length, settings.unisonDetune);
      voice.oscs.forEach((osc, i) => {
        osc.type = settings.waveform;
        if (voice.oscs.length > 1) osc.detune.setTargetAtTime(detunes[i], now, 0.02);
      });
      voice.filter.frequency.setTargetAtTime(cutoff, now, 0.02);
      voice.lfo?.frequency.setTargetAtTime(vibratoHz(settings.vibratoRate), now, 0.02);
      voice.lfoDepth?.gain.setTargetAtTime(settings.vibratoDepth, now, 0.02);
    });
  }

  // While muted, notes are ignored; muting also cuts whatever is sounding.
  // The app mutes while its tab is hidden: every open tab receives MIDI, so
  // otherwise each one would play along, each with its own sound.
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.allOff();
  }

  // Create the audio graph if needed and ask the browser to start it. Call
  // from a user gesture (a click or key press) for it to succeed.
  resume(): void {
    if (!this.settings.enabled) return;
    const ctx = this.ensureContext();
    if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
  }

  noteOn(midi: number, velocity: number, key: VoiceKey = midi): void {
    if (!this.settings.enabled || this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    this.release(key, MIN_RAMP_S);

    const now = ctx.currentTime;
    const env = ctx.createGain();
    const filter = this.createVoiceFilter(ctx, now);
    const { lfo, lfoDepth } = this.createVibrato(ctx, now);
    const count = this.settings.unison ? this.settings.unisonVoices : 1;
    const detunes = unisonDetunes(count, this.settings.unisonDetune);
    const pans = unisonPans(count);
    const oscs = detunes.map((cents, i) => {
      const osc = ctx.createOscillator();
      osc.type = this.settings.waveform;
      osc.frequency.value = midiToFrequency(midi);
      osc.detune.value = cents;
      if (count > 1) {
        // A panner at centre sends ~71% to each side, where an unpanned
        // mono note goes full level to both: make up the 3 dB.
        const pan = ctx.createStereoPanner();
        pan.pan.value = pans[i];
        const makeup = ctx.createGain();
        makeup.gain.value = Math.SQRT2;
        osc.connect(pan).connect(makeup).connect(filter);
      } else {
        osc.connect(filter);
      }
      lfoDepth?.connect(osc.detune);
      return osc;
    });
    // Detuned copies drift in and out of phase, so they add up by power,
    // not amplitude: scale by 1/sqrt(n) to keep unison about as loud.
    const peak = VOICE_LEVEL * WAVEFORM_LEVEL[this.settings.waveform] *
      velocityGain(velocity, this.settings.velocity) / Math.sqrt(count);
    // Attack up to the peak, then decay toward the sustain level. The decay
    // is exponential (a time constant of a third of Decay gets ~95% of the
    // way there), which is how real instruments ring down.
    const shape: EnvelopeShape = {
      start: now,
      attackEnd: now + Math.max(this.settings.attackMs / 1000, MIN_RAMP_S),
      peak,
      sustainLevel: peak * this.settings.sustain / 100,
      decayTau: this.settings.decayMs / 1000 / 3,
    };
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(peak, shape.attackEnd);
    if (shape.sustainLevel !== peak) {
      if (shape.decayTau > 0) {
        env.gain.setTargetAtTime(shape.sustainLevel, shape.attackEnd, shape.decayTau);
      } else {
        env.gain.setValueAtTime(shape.sustainLevel, shape.attackEnd);
      }
    }
    filter.connect(env).connect(this.master);
    // Unison copies start at random points in their cycle, as on a
    // hardware synth; started in step they'd sweep through a phasey swoosh
    // on every note, and sum louder or softer depending on the detune.
    const period = 1 / midiToFrequency(midi);
    oscs.forEach(osc => osc.start(count > 1 ? now + Math.random() * period : now));
    lfo?.start(now);
    this.voices.set(key, { oscs, filter, env, shape, lfo, lfoDepth });
  }

  // The note's own lowpass. With the Filter envelope on, the cutoff starts
  // high and settles exponentially back to Brightness over Time (a third
  // of it as the time constant, like Decay), so the attack is brighter
  // than the rest of the note.
  private createVoiceFilter(ctx: AudioContext, now: number): BiquadFilterNode {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.7;
    const cutoff = brightnessToCutoff(this.settings.brightness);
    if (this.settings.filterEnv && this.settings.filterEnvAmount > 0) {
      filter.frequency.setValueAtTime(filterEnvStartCutoff(this.settings.brightness, this.settings.filterEnvAmount), now);
      filter.frequency.setTargetAtTime(cutoff, now, this.settings.filterEnvMs / 1000 / 3);
    } else {
      filter.frequency.value = cutoff;
    }
    return filter;
  }

  // A sine LFO whose output, scaled to Depth in cents, drives every copy's
  // detune. With a Delay the depth fades in, so a held note starts steady
  // and blooms into vibrato the way a player adds it.
  private createVibrato(ctx: AudioContext, now: number): { lfo: OscillatorNode | null; lfoDepth: GainNode | null } {
    if (!this.settings.vibrato) return { lfo: null, lfoDepth: null };
    const lfo = ctx.createOscillator();
    lfo.frequency.value = vibratoHz(this.settings.vibratoRate);
    const lfoDepth = ctx.createGain();
    const depth = this.settings.vibratoDepth;
    const delay = this.settings.vibratoDelayMs / 1000;
    if (delay > 0) {
      lfoDepth.gain.setValueAtTime(0, now);
      lfoDepth.gain.linearRampToValueAtTime(depth, now + delay);
    } else {
      lfoDepth.gain.value = depth;
    }
    lfo.connect(lfoDepth);
    return { lfo, lfoDepth };
  }

  noteOff(key: VoiceKey): void {
    this.release(key, this.settings.releaseMs / 1000);
  }

  allOff(): void {
    Array.from(this.voices.keys()).forEach(key => this.release(key, MIN_RAMP_S));
  }

  private release(key: VoiceKey, seconds: number): void {
    const voice = this.voices.get(key);
    if (!voice || !this.ctx) return;
    this.voices.delete(key);
    const now = this.ctx.currentTime;
    const end = now + Math.max(seconds, MIN_RAMP_S);
    const gain = voice.env.gain;
    // Pin the level reached so far (the attack or decay may still be
    // moving), then fade from there. See envelopeLevelAt for why it's
    // computed rather than read back.
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(envelopeLevelAt(voice.shape, now), now);
    gain.linearRampToValueAtTime(0, end);
    voice.oscs.forEach(osc => osc.stop(end + 0.02));
    voice.lfo?.stop(end + 0.02);
    voice.oscs[0].onended = () => voice.env.disconnect();
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof AudioContext === 'undefined') return null;
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = volumeToGain(this.settings.volume);
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.1;
    const mix = reverbMix(this.settings.reverb, this.settings.reverbEnabled);
    const dry = ctx.createGain();
    dry.gain.value = mix.dry;
    const wet = ctx.createGain();
    wet.gain.value = mix.wet;
    const reverb = ctx.createConvolver();
    master.connect(dry).connect(limiter);
    master.connect(reverb).connect(wet).connect(limiter);
    limiter.connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
    this.dry = dry;
    this.wet = wet;
    this.convolver = reverb;
    this.updateImpulse();
    ctx.addEventListener('statechange', () => this.onStateChange());
    this.onStateChange();
    return ctx;
  }

  // Regenerate the reverb's room when Length changes. Only when it changes:
  // a fresh impulse is a few hundred thousand random samples.
  private updateImpulse(): void {
    if (!this.ctx || !this.convolver || this.impulseLengthMs === this.settings.reverbLengthMs) return;
    this.impulseLengthMs = this.settings.reverbLengthMs;
    this.convolver.buffer = makeImpulse(this.ctx, this.impulseLengthMs / 1000);
  }
}

// A synthetic room: stereo noise under a fade, independent per channel so
// the tail is wide. Generated in code (per Length), so there's no
// impulse-response file to fetch.
const REVERB_PREDELAY_S = 0.012;

function makeImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const predelay = Math.floor(ctx.sampleRate * REVERB_PREDELAY_S);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = predelay; i < length; i++) {
      const t = (i - predelay) / (length - predelay);
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3);
    }
  }
  return buffer;
}
