// Sound: a small Web Audio synth that voices the held notes, plus the pure
// settings helpers behind the Sound tab. Everything above the Synth class is
// DOM- and audio-free so it can be unit-tested in node.
//
// Signal path: one oscillator + envelope gain (attack/decay/sustain/release)
// per held note, all summed into a shared lowpass filter (Brightness) and a
// master gain (Volume). From there a dry path and a convolution reverb
// (Reverb sets the mix) meet in a compressor used as a limiter, so a big
// chord never clips.

export type Waveform = 'sine' | 'triangle' | 'square' | 'sawtooth';
export const WAVEFORMS: Waveform[] = ['sine', 'triangle', 'square', 'sawtooth'];

// The numeric settings, each an integer from 0 to SOUND_KNOB_MAX[knob].
export type SoundKnob =
  'volume' | 'brightness' | 'attackMs' | 'decayMs' | 'sustain' | 'releaseMs' | 'velocity' | 'reverb';

export const SOUND_KNOB_MAX: Record<SoundKnob, number> = {
  volume: 100,
  brightness: 100,
  attackMs: 2000,
  decayMs: 5000,
  sustain: 100,
  releaseMs: 5000,
  velocity: 100,
  reverb: 100,
};

export const SOUND_KNOBS: SoundKnob[] =
  ['volume', 'brightness', 'attackMs', 'decayMs', 'sustain', 'releaseMs', 'velocity', 'reverb'];

// Knobs added after sounds were first saved, with the values that leave a
// sound exactly as it played before they existed: no decay, full sustain,
// no reverb. parseNamedSound fills them in when a saved sound lacks them.
const ADDED_KNOB_DEFAULTS: Partial<Record<SoundKnob, number>> = { decayMs: 0, sustain: 100, reverb: 0 };

// A named sound: the tone and every knob. The Sound tab edits these the way
// the Themes tab edits color sets (built-ins, custom copies, a modified flag).
export interface NamedSound extends Record<SoundKnob, number> {
  name: string;
  waveform: Waveform;
}

// What the synth plays with: the selected sound plus the on/off switch,
// which belongs to no sound.
export interface SoundSettings extends NamedSound {
  enabled: boolean;
}

// Built-in sounds, always present: they can be edited (and reset) but not
// renamed or deleted. The first is the default.
//   Classic  - electric-piano-ish: quick attack, rings down to a low sustain.
//   Flute    - soft sine that eases in and holds, a little air from reverb.
//   Organ    - no decay at all (an organ doesn't fade), snappy on and off.
//   Brass    - bright sawtooth that swells, dips slightly, and holds.
//   Pad      - slow, dark, sustained, with a long wash of reverb.
//   Chiptune - instant and dry, with a short blip of decay.
export const BUILT_IN_SOUNDS: NamedSound[] = [
  { name: 'Classic', waveform: 'triangle', volume: 70, brightness: 60, attackMs: 5, decayMs: 1500, sustain: 35, releaseMs: 300, velocity: 60, reverb: 20 },
  { name: 'Flute', waveform: 'sine', volume: 75, brightness: 45, attackMs: 80, decayMs: 300, sustain: 85, releaseMs: 250, velocity: 40, reverb: 30 },
  { name: 'Organ', waveform: 'square', volume: 55, brightness: 40, attackMs: 10, decayMs: 0, sustain: 100, releaseMs: 60, velocity: 0, reverb: 25 },
  { name: 'Brass', waveform: 'sawtooth', volume: 60, brightness: 55, attackMs: 60, decayMs: 400, sustain: 70, releaseMs: 200, velocity: 70, reverb: 20 },
  { name: 'Pad', waveform: 'sawtooth', volume: 60, brightness: 30, attackMs: 700, decayMs: 2000, sustain: 80, releaseMs: 1800, velocity: 20, reverb: 60 },
  { name: 'Chiptune', waveform: 'square', volume: 50, brightness: 100, attackMs: 0, decayMs: 150, sustain: 60, releaseMs: 30, velocity: 0, reverb: 0 },
];

// Off by default: most MIDI keyboards make their own sound, and doubling it
// through the speakers (with browser latency) is worse than silence.
export const DEFAULT_SOUND_ENABLED = false;

// Notes from the on-screen keyboard have no velocity; treat them as a
// fairly firm press.
export const MOUSE_VELOCITY = 100;

export function isWaveform(value: unknown): value is Waveform {
  return typeof value === 'string' && (WAVEFORMS as string[]).includes(value);
}

// A knob value as typed or stored: an integer within 0..max, else null.
export function parseSoundKnob(knob: SoundKnob, value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
  const n = Number(value);
  return n <= SOUND_KNOB_MAX[knob] ? n : null;
}

export function soundEqual(a: NamedSound, b: NamedSound): boolean {
  return a.waveform === b.waveform && SOUND_KNOBS.every(knob => a[knob] === b[knob]);
}

// Validates arbitrary parsed JSON (the soundPresets cookie) into one named
// sound. Strict, like parseChordFormulas: every knob must be a whole number
// in range, else null. The one leniency is a knob added later
// (ADDED_KNOB_DEFAULTS), which may be absent so older saves still load.
export function parseNamedSound(raw: unknown): NamedSound | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const t = raw as Record<string, unknown>;
  if (typeof t.name !== 'string' || !t.name.trim() || !isWaveform(t.waveform)) return null;
  const sound = { name: t.name.trim(), waveform: t.waveform } as NamedSound;
  for (const knob of SOUND_KNOBS) {
    const n = t[knob] === undefined ? ADDED_KNOB_DEFAULTS[knob] : t[knob];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > SOUND_KNOB_MAX[knob]) return null;
    sound[knob] = n;
  }
  return sound;
}

// The saved list of named sounds; null if it's empty or any entry is
// malformed. A built-in saved before the added knobs existed is replaced
// by its current version: the built-ins were retuned around those knobs,
// and keeping the old copy would leave it stuck showing "(modified)".
export function parseNamedSounds(raw: unknown): NamedSound[] | null {
  if (!Array.isArray(raw)) return null;
  const result: NamedSound[] = [];
  for (const item of raw) {
    const sound = parseNamedSound(item);
    if (!sound) return null;
    const builtIn = BUILT_IN_SOUNDS.find(b => b.name === sound.name);
    const predatesAddedKnobs = Object.keys(ADDED_KNOB_DEFAULTS).some(knob => !(knob in (item as object)));
    result.push(builtIn && predatesAddedKnobs ? { ...builtIn } : sound);
  }
  return result.length ? result : null;
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
// so turning reverb up adds room rather than pushing the note away.
export function reverbMix(reverb: number): { dry: number; wet: number } {
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
  osc: OscillatorNode;
  env: GainNode;
  shape: EnvelopeShape;
}

export class Synth {
  private ctx: AudioContext | null = null;
  private filter: BiquadFilterNode | null = null;
  private master: GainNode | null = null;
  private dry: GainNode | null = null;
  private wet: GainNode | null = null;
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
    if (!this.ctx || !this.filter || !this.master) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(volumeToGain(settings.volume), now, 0.02);
    this.filter.frequency.setTargetAtTime(brightnessToCutoff(settings.brightness), now, 0.02);
    const mix = reverbMix(settings.reverb);
    this.dry?.gain.setTargetAtTime(mix.dry, now, 0.02);
    this.wet?.gain.setTargetAtTime(mix.wet, now, 0.02);
    this.voices.forEach(voice => {
      voice.osc.type = settings.waveform;
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
    if (!ctx || !this.filter) return;
    this.release(key, MIN_RAMP_S);

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = this.settings.waveform;
    osc.frequency.value = midiToFrequency(midi);
    const env = ctx.createGain();
    const peak = VOICE_LEVEL * WAVEFORM_LEVEL[this.settings.waveform] *
      velocityGain(velocity, this.settings.velocity);
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
    osc.connect(env).connect(this.filter);
    osc.start(now);
    this.voices.set(key, { osc, env, shape });
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
    voice.osc.stop(end + 0.02);
    voice.osc.onended = () => voice.env.disconnect();
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof AudioContext === 'undefined') return null;
    const ctx = new AudioContext();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.7;
    filter.frequency.value = brightnessToCutoff(this.settings.brightness);
    const master = ctx.createGain();
    master.gain.value = volumeToGain(this.settings.volume);
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.1;
    const mix = reverbMix(this.settings.reverb);
    const dry = ctx.createGain();
    dry.gain.value = mix.dry;
    const wet = ctx.createGain();
    wet.gain.value = mix.wet;
    const reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(ctx);
    filter.connect(master);
    master.connect(dry).connect(limiter);
    master.connect(reverb).connect(wet).connect(limiter);
    limiter.connect(ctx.destination);
    this.ctx = ctx;
    this.filter = filter;
    this.master = master;
    this.dry = dry;
    this.wet = wet;
    ctx.addEventListener('statechange', () => this.onStateChange());
    this.onStateChange();
    return ctx;
  }
}

// A synthetic room: stereo noise under an exponential fade, independent per
// channel so the tail is wide. Generated once per audio context, so there's
// no impulse-response file to fetch.
const REVERB_SECONDS = 2.2;
const REVERB_PREDELAY_S = 0.012;

function makeImpulse(ctx: BaseAudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * REVERB_SECONDS);
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
