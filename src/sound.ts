// Sound: a small Web Audio synth that voices the held notes, plus the pure
// settings helpers behind the Sound tab. Everything above the Synth class is
// DOM- and audio-free so it can be unit-tested in node.
//
// Signal path: one oscillator + envelope gain per held note, all summed into
// a shared lowpass filter (Brightness), a master gain (Volume) and a
// compressor used as a limiter so a big chord never clips.

export type Waveform = 'sine' | 'triangle' | 'square' | 'sawtooth';
export const WAVEFORMS: Waveform[] = ['sine', 'triangle', 'square', 'sawtooth'];

// The numeric settings, each an integer from 0 to SOUND_KNOB_MAX[knob].
export type SoundKnob = 'volume' | 'brightness' | 'attackMs' | 'releaseMs' | 'velocity';

export const SOUND_KNOB_MAX: Record<SoundKnob, number> = {
  volume: 100,
  brightness: 100,
  attackMs: 2000,
  releaseMs: 5000,
  velocity: 100,
};

export interface SoundSettings extends Record<SoundKnob, number> {
  enabled: boolean;
  waveform: Waveform;
}

// Off by default: most MIDI keyboards make their own sound, and doubling it
// through the speakers (with browser latency) is worse than silence.
export const DEFAULT_SOUND: SoundSettings = {
  enabled: false,
  waveform: 'triangle',
  volume: 70,
  brightness: 60,
  attackMs: 5,
  releaseMs: 300,
  velocity: 50,
};

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

// Never ramp over less than this, even with Attack/Release at 0: an
// instant jump in level is an audible click.
const MIN_RAMP_S = 0.005;

export type VoiceKey = number | string;

interface Voice {
  osc: OscillatorNode;
  env: GainNode;
}

export class Synth {
  private ctx: AudioContext | null = null;
  private filter: BiquadFilterNode | null = null;
  private master: GainNode | null = null;
  // Keyed by the caller's voice key, which defaults to the MIDI note. A
  // different key lets the same pitch sound twice, e.g. a tone shared by
  // two overlapping chords, each released on its own.
  private voices = new Map<VoiceKey, Voice>();

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
    this.voices.forEach(voice => {
      voice.osc.type = settings.waveform;
    });
  }

  // Create the audio graph if needed and ask the browser to start it. Call
  // from a user gesture (a click or key press) for it to succeed.
  resume(): void {
    if (!this.settings.enabled) return;
    const ctx = this.ensureContext();
    if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
  }

  noteOn(midi: number, velocity: number, key: VoiceKey = midi): void {
    if (!this.settings.enabled) return;
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
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(peak, now + Math.max(this.settings.attackMs / 1000, MIN_RAMP_S));
    osc.connect(env).connect(this.filter);
    osc.start(now);
    this.voices.set(key, { osc, env });
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
    // Hold the level reached so far (the attack may still be ramping),
    // then fade from there.
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
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
    filter.connect(master).connect(limiter).connect(ctx.destination);
    this.ctx = ctx;
    this.filter = filter;
    this.master = master;
    ctx.addEventListener('statechange', () => this.onStateChange());
    this.onStateChange();
    return ctx;
  }
}
