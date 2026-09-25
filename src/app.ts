// App orchestrator: owns state, wires up DOM events, and initializes MIDI.

declare const __COMMIT_HASH__: string;

import { ALL_DEVICES, MidiState, initMIDI, midiPickerModel } from './midi';
import { Params, analytics, initAnalytics } from './analytics';
import {
  DEFAULT_HOLD_MS,
  DEFAULT_SMOOTHING,
  NoteSettler,
  SMOOTHING_DELAYS,
  SmoothingDelays,
  SmoothingLevel,
  holdDurationValue,
  isSmoothingLevel,
  parseDelayMs,
  parseHoldMs,
} from './settle';
import {
  BUILT_IN_SOUNDS,
  DEFAULT_SOUND_ENABLED,
  DEFAULT_VOLUME,
  MOUSE_VELOCITY,
  NamedSound,
  SOUND_KNOBS,
  SoundKnob,
  SoundSettings,
  SoundToggle,
  Synth,
  VoiceKey,
  isWaveform,
  parseNamedSounds,
  parseSoundKnob,
  parseVolume,
  soundEqual,
  vibratoHz,
} from './sound';
import {
  ChordFormula,
  DEFAULT_CHORD_FORMULAS,
  HIGHLIGHT_CHORDS,
  HIGHLIGHT_SCALES,
  HighlightChord,
  HighlightScale,
  KEYS,
  Level,
  MODES,
  Mode,
  buildChordVoicing,
  buildKeyNoteNames,
  keyPitchClass,
  levelAtLeast,
  parseChordFormulas,
  scalePitchClasses,
} from './theory';
import {
  BUILT_IN_THEMES,
  FONT_OPTIONS,
  FontSizes,
  MAX_MIDI,
  MIN_MIDI,
  NamedTheme,
  Piano,
  Theme,
  TOTAL_KEYS,
  applyTheme,
  attachPianoMouseInput,
  centerOnMiddleC,
  computeKeyDimensions,
  createPiano,
  downloadJSON,
  parseNamedTheme,
  parseNamedThemes,
  renderChordDisplay,
  renderChordTable,
  renderKeyboard,
  setErrorMessage,
  setSettingsOpen,
  themeEqual,
  trackMouseIsDown,
  updateOffscreenIndicators,
} from './ui';

// ---- Cookie-backed chord table persistence ----

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, days: number): void {
  document.cookie = name + '=' + encodeURIComponent(value) +
    '; path=/; max-age=' + days * 24 * 60 * 60 + '; SameSite=Lax';
}

function deleteCookie(name: string): void {
  document.cookie = name + '=; path=/; max-age=0';
}

// ---- Level (progressive disclosure) ----

function loadLevel(): Level {
  const raw = getCookie('level');
  return raw === 'basic' || raw === 'intermediate' || raw === 'nerd' ? raw : 'basic';
}

function saveLevel(level: Level): void {
  setCookie('level', level, 365);
  syncSettingsSnapshot();
}

// ---- Chord-display line toggles and octave labels ----

function loadBoolSetting(cookieName: string, defaultValue: boolean): boolean {
  const raw = getCookie(cookieName);
  if (raw === '1') return true;
  if (raw === '0') return false;
  return defaultValue;
}

function saveBoolSetting(cookieName: string, value: boolean): void {
  setCookie(cookieName, value ? '1' : '0', 365);
  syncSettingsSnapshot();
}

// ---- Chord smoothing (see settle.ts) ----

function loadSmoothing(): SmoothingLevel {
  const raw = getCookie('chordSmoothing');
  return isSmoothingLevel(raw) ? raw : DEFAULT_SMOOTHING;
}

function saveSmoothing(level: SmoothingLevel): void {
  setCookie('chordSmoothing', level, 365);
  syncSettingsSnapshot();
}

// The directly entered delays behind the "Advanced" choice. Kept even while
// a preset is selected, so switching back restores them. Unset or bad values
// start from the Light preset.
function loadCustomDelays(): SmoothingDelays {
  return {
    attackMs: parseDelayMs(getCookie('chordSmoothingAttackMs')) ?? SMOOTHING_DELAYS.light.attackMs,
    releaseMs: parseDelayMs(getCookie('chordSmoothingReleaseMs')) ?? SMOOTHING_DELAYS.light.releaseMs,
  };
}

function saveCustomDelays(delays: SmoothingDelays): void {
  setCookie('chordSmoothingAttackMs', String(delays.attackMs), 365);
  setCookie('chordSmoothingReleaseMs', String(delays.releaseMs), 365);
}

function loadHoldDuration(): number {
  return parseHoldMs(getCookie('holdDuration')) ?? DEFAULT_HOLD_MS;
}

function saveHoldDuration(ms: number): void {
  setCookie('holdDuration', holdDurationValue(ms), 365);
}

// ---- Sound (named sounds, like themes; see sound.ts) ----

// The cookie holds only what can't be rebuilt: custom sounds and edited
// built-ins. Every built-in is always present (they can't be deleted), so
// the list is rebuilt as the built-ins in their usual order, each replaced
// by its saved edit if there is one, then the custom sounds in saved order.
// Storing all fourteen built-ins would overflow the ~4 KB cookie limit, and
// the browser drops an oversized cookie silently.
function loadSounds(): NamedSound[] {
  const raw = getCookie('soundPresets');
  let saved: NamedSound[] = [];
  if (raw) {
    try {
      saved = parseNamedSounds(JSON.parse(raw)) ?? [];
    } catch (e) {
      saved = [];
    }
  }
  const builtIns = BUILT_IN_SOUNDS.map(b => ({ ...(saved.find(t => t.name === b.name) ?? b) }));
  return [...builtIns, ...saved.filter(t => !isBuiltInSound(t.name))];
}

function saveSounds(): void {
  const worthSaving = sounds.filter(t => !isBuiltInSound(t.name) || isSoundModifiedFromBuiltIn(t));
  if (worthSaving.length) {
    setCookie('soundPresets', JSON.stringify(worthSaving), 365);
  } else {
    deleteCookie('soundPresets');
  }
}

function loadSoundName(sounds: NamedSound[]): string {
  const raw = getCookie('soundPresetName');
  return raw !== null && sounds.some(t => t.name === raw) ? raw : sounds[0].name;
}

function saveSoundName(name: string): void {
  setCookie('soundPresetName', name, 365);
}

// Volume is global, not part of any sound.
function loadVolume(): number {
  return parseVolume(getCookie('soundVolume')) ?? DEFAULT_VOLUME;
}

function saveVolume(volume: number): void {
  setCookie('soundVolume', String(volume), 365);
}

// ---- Visible keys (zoom level: how many of the 88 keys fit on screen) ----

const DEFAULT_VISIBLE_KEYS = 52;

function loadVisibleKeys(): number {
  const raw = getCookie('visibleKeys');
  const n = raw !== null ? Number(raw) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= TOTAL_KEYS ? n : DEFAULT_VISIBLE_KEYS;
}

function saveVisibleKeys(n: number): void {
  setCookie('visibleKeys', String(n), 365);
  syncSettingsSnapshot();
}

// ---- Theme (named color sets) ----

function cloneBuiltInThemes(): NamedTheme[] {
  return BUILT_IN_THEMES.map(t => ({ ...t }));
}

function loadThemes(): NamedTheme[] {
  const raw = getCookie('themes');
  if (!raw) return cloneBuiltInThemes();
  try {
    const saved = parseNamedThemes(JSON.parse(raw));
    if (!saved) return cloneBuiltInThemes();
    // Built-in themes added since this cookie was saved (e.g. a new app
    // release) won't be in it yet; append them so they still show up.
    // Safe because built-ins can't be deleted, so a missing one always
    // means "new," never "the user removed it."
    const missing = BUILT_IN_THEMES.filter(b => !saved.some(t => t.name === b.name));
    return missing.length ? [...saved, ...missing.map(t => ({ ...t }))] : saved;
  } catch (e) {
    return cloneBuiltInThemes();
  }
}

function saveThemes(): void {
  setCookie('themes', JSON.stringify(themes), 365);
}

function loadThemeName(themes: NamedTheme[]): string {
  const raw = getCookie('themeName');
  return raw !== null && themes.some(t => t.name === raw) ? raw : themes[0].name;
}

function saveThemeName(name: string): void {
  setCookie('themeName', name, 365);
  syncSettingsSnapshot();
}

function cloneDefaultChordFormulas(): ChordFormula[] {
  return DEFAULT_CHORD_FORMULAS.map(f => ({ symbol: f.symbol, intervals: f.intervals.slice() }));
}

function loadChordFormulas(): ChordFormula[] {
  const raw = getCookie('chordFormulas');
  if (!raw) return cloneDefaultChordFormulas();
  try {
    return parseChordFormulas(JSON.parse(raw)) ?? cloneDefaultChordFormulas();
  } catch (e) {
    return cloneDefaultChordFormulas();
  }
}

function saveChordFormulas(): void {
  setCookie('chordFormulas', JSON.stringify(chordFormulas), 365);
  syncSettingsSnapshot();
}

function parseIntervals(text: string): number[] {
  return Array.from(new Set(
    text.split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !Number.isNaN(n))
      .map(n => ((n % 12) + 12) % 12)
  ));
}

// ---- App state ----

let currentNoteNames: string[] = buildKeyNoteNames(KEYS[0]);
let currentTonicPc: number = keyPitchClass(KEYS[0]);
let currentMode: Mode = MODES[0];
let chordFormulas: ChordFormula[] = loadChordFormulas();
let currentLevel: Level = loadLevel();
let currentVisibleKeys: number = loadVisibleKeys();
let themes: NamedTheme[] = loadThemes();
let currentThemeName: string = loadThemeName(themes);
let showSecondaryLine: boolean = loadBoolSetting('showSecondaryLine', true);
let showTertiaryLine: boolean = loadBoolSetting('showTertiaryLine', true);
let showRomanNumerals: boolean = loadBoolSetting('showRomanNumerals', true);
let showOctaveLabels: boolean = loadBoolSetting('showOctaveLabels', true);
let showNoteLabels: boolean = loadBoolSetting('showNoteLabels', true);
let showOffscreenArrows: boolean = loadBoolSetting('showOffscreenArrows', true);
let showNoChord: boolean = loadBoolSetting('showNoChord', true);
let chordSmoothing: SmoothingLevel = loadSmoothing();
let customDelays: SmoothingDelays = loadCustomDelays();
let holdLastChord: boolean = loadBoolSetting('holdLastChord', false);
let holdDurationMs: number = loadHoldDuration();
let sounds: NamedSound[] = loadSounds();
let currentSoundName: string = loadSoundName(sounds);
let soundEnabled: boolean = loadBoolSetting('soundEnabled', DEFAULT_SOUND_ENABLED);
let soundVolume: number = loadVolume();
// The selected sound plus the global on/off and volume, as the synth plays
// it. Rebuilt by applySound() after any change to them.
let soundSettings: SoundSettings = {
  ...(sounds.find(t => t.name === currentSoundName) ?? sounds[0]),
  enabled: soundEnabled,
  volume: soundVolume,
};
const activeNotes = new Set<number>();
let hasPlayedNote = false;
// Where a note came from. Each source gets its own once-only first-note
// event, so clicking the on-screen keyboard first never hides later MIDI use.
type NoteSource = 'midi' | 'mouse';
let sustainOn = false;
// Notes released while the sustain pedal is held: kept sounding until the pedal comes up.
const sustainedNotes = new Set<number>();

type HighlightMode = 'scale' | 'chord' | null;
let highlighterOpen = false;
let highlightMode: HighlightMode = null;
let scaleRootIndex: number | null = null;
let scaleTypeName: string = HIGHLIGHT_SCALES[0].name;
let chordRootIndex: number | null = null;
let chordTypeSymbol: string = HIGHLIGHT_CHORDS[0].symbol;
// A picked chord's keys hide once you start playing with it auto-played
// (see soundOn), so they don't compete with the auto keys. The selection
// itself stays; picking a chord again shows them.
let chordHighlightHidden = false;

// ---- DOM references ----

const svg = document.getElementById('piano') as unknown as SVGSVGElement;
const chordDisplayEl = document.getElementById('chordDisplay') as HTMLElement;
const pianoContainer = document.getElementById('pianoContainer') as HTMLElement;
const offscreenLeftEl = document.getElementById('offscreenLeft') as HTMLElement;
const offscreenRightEl = document.getElementById('offscreenRight') as HTMLElement;
const rangeInput = document.getElementById('rangeInput') as HTMLInputElement;
const keySelect = document.getElementById('keySelect') as HTMLSelectElement;
const modeSelect = document.getElementById('modeSelect') as HTMLSelectElement;
const modeLabelText = document.getElementById('modeLabelText') as HTMLElement;
const secondaryLineCheckbox = document.getElementById('secondaryLineCheckbox') as HTMLInputElement;
const tertiaryLineCheckbox = document.getElementById('tertiaryLineCheckbox') as HTMLInputElement;
const romanNumeralsCheckbox = document.getElementById('romanNumeralsCheckbox') as HTMLInputElement;
const noChordCheckbox = document.getElementById('noChordCheckbox') as HTMLInputElement;
const octaveLabelsCheckbox = document.getElementById('octaveLabelsCheckbox') as HTMLInputElement;
const noteLabelsCheckbox = document.getElementById('noteLabelsCheckbox') as HTMLInputElement;
const offscreenArrowsCheckbox = document.getElementById('offscreenArrowsCheckbox') as HTMLInputElement;
const chordSmoothingSelect = document.getElementById('chordSmoothingSelect') as HTMLSelectElement;
const holdLastChordCheckbox = document.getElementById('holdLastChordCheckbox') as HTMLInputElement;
const holdDurationRow = document.getElementById('holdDurationRow') as HTMLElement;
const holdDurationInput = document.getElementById('holdDurationInput') as HTMLInputElement;
const smoothingAdvancedEl = document.getElementById('smoothingAdvanced') as HTMLElement;
const smoothingAttackInput = document.getElementById('smoothingAttackInput') as HTMLInputElement;
const smoothingReleaseInput = document.getElementById('smoothingReleaseInput') as HTMLInputElement;
const levelButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.level-btn'));
const chordTableBody = document.getElementById('chordTableBody') as HTMLElement;
const addChordBtn = document.getElementById('addChordBtn') as HTMLButtonElement;
const resetChordsBtn = document.getElementById('resetChordsBtn') as HTMLButtonElement;
const exportChordsBtn = document.getElementById('exportChordsBtn') as HTMLButtonElement;
const importChordsBtn = document.getElementById('importChordsBtn') as HTMLButtonElement;
const importFileInput = document.getElementById('importFileInput') as HTMLInputElement;
const chordImportError = document.getElementById('chordImportError') as HTMLElement;
const menuButton = document.getElementById('menuButton') as HTMLElement;
const settingsOverlay = document.getElementById('settingsOverlay') as HTMLElement;
const settingsPanel = document.getElementById('settingsPanel') as HTMLElement;
const settingsCloseBtn = document.getElementById('settingsCloseBtn') as HTMLButtonElement;
const midiPickerRow = document.getElementById('midiPickerRow') as HTMLElement;
const midiPickerSelect = document.getElementById('midiPickerSelect') as HTMLSelectElement;
const versionInfoEl = document.getElementById('versionInfo') as HTMLElement;
const highlighterToggle = document.getElementById('highlighterToggle') as HTMLButtonElement;
const highlighterBody = document.getElementById('highlighterBody') as HTMLElement;
const scaleRootButtonsEl = document.getElementById('scaleRootButtons') as HTMLElement;
const scaleTypeButtonsEl = document.getElementById('scaleTypeButtons') as HTMLElement;
const chordRootButtonsEl = document.getElementById('chordRootButtons') as HTMLElement;
const chordTypeSelect = document.getElementById('chordTypeSelect') as HTMLSelectElement;
const themeSelect = document.getElementById('themeSelect') as HTMLSelectElement;
const themeSelectThemes = document.getElementById('themeSelectThemes') as HTMLSelectElement;
const themeNameInput = document.getElementById('themeNameInput') as HTMLInputElement;
const themeBackgroundInput = document.getElementById('themeBackgroundInput') as HTMLInputElement;
const themeFontInput = document.getElementById('themeFontInput') as HTMLInputElement;
const themeWhiteKeyInput = document.getElementById('themeWhiteKeyInput') as HTMLInputElement;
const themeBlackKeyInput = document.getElementById('themeBlackKeyInput') as HTMLInputElement;
const themeActiveKeyInput = document.getElementById('themeActiveKeyInput') as HTMLInputElement;
const themeHighlightInput = document.getElementById('themeHighlightInput') as HTMLInputElement;
const themeGradientCheckbox = document.getElementById('themeGradientCheckbox') as HTMLInputElement;
const themeBackgroundGradientInput = document.getElementById('themeBackgroundGradientInput') as HTMLInputElement;
const themeWhiteKeyGradientInput = document.getElementById('themeWhiteKeyGradientInput') as HTMLInputElement;
const themeBlackKeyGradientInput = document.getElementById('themeBlackKeyGradientInput') as HTMLInputElement;
const themeActiveKeyGradientInput = document.getElementById('themeActiveKeyGradientInput') as HTMLInputElement;
const themeHighlightGradientInput = document.getElementById('themeHighlightGradientInput') as HTMLInputElement;
const themeGlowCheckbox = document.getElementById('themeGlowCheckbox') as HTMLInputElement;
const newThemeBtn = document.getElementById('newThemeBtn') as HTMLButtonElement;
const deleteThemeBtn = document.getElementById('deleteThemeBtn') as HTMLButtonElement;
const themeResetBtn = document.getElementById('themeResetBtn') as HTMLButtonElement;
const exportThemeBtn = document.getElementById('exportThemeBtn') as HTMLButtonElement;
const importThemeBtn = document.getElementById('importThemeBtn') as HTMLButtonElement;
const importThemeFileInput = document.getElementById('importThemeFileInput') as HTMLInputElement;
const themeImportError = document.getElementById('themeImportError') as HTMLElement;
const fontFamilySelect = document.getElementById('fontFamilySelect') as HTMLSelectElement;
const chordFontSizeInput = document.getElementById('chordFontSizeInput') as HTMLInputElement;
const secondaryFontSizeInput = document.getElementById('secondaryFontSizeInput') as HTMLInputElement;
const tertiaryFontSizeInput = document.getElementById('tertiaryFontSizeInput') as HTMLInputElement;
const noteFontSizeInput = document.getElementById('noteFontSizeInput') as HTMLInputElement;
const octaveFontSizeInput = document.getElementById('octaveFontSizeInput') as HTMLInputElement;
const soundEnabledCheckbox = document.getElementById('soundEnabledCheckbox') as HTMLInputElement;
const soundControlsEl = document.getElementById('soundControls') as HTMLFieldSetElement;
const soundWaveformSelect = document.getElementById('soundWaveformSelect') as HTMLSelectElement;
const soundTestBtn = document.getElementById('soundTestBtn') as HTMLButtonElement;
const soundResetBtn = document.getElementById('soundResetBtn') as HTMLButtonElement;
const soundPresetSelect = document.getElementById('soundPresetSelect') as HTMLSelectElement;
const soundPickerSelect = document.getElementById('soundPickerSelect') as HTMLSelectElement;
const soundNameInput = document.getElementById('soundNameInput') as HTMLInputElement;
const soundNewBtn = document.getElementById('soundNewBtn') as HTMLButtonElement;
const soundDeleteBtn = document.getElementById('soundDeleteBtn') as HTMLButtonElement;
const soundPickerRow = document.getElementById('soundPickerRow') as HTMLElement;
const soundPickerIcon = document.getElementById('soundPickerIcon') as HTMLElement;

versionInfoEl.textContent = `Build ${__COMMIT_HASH__}`;

// ---- Piano setup ----

let piano: Piano;
const isMouseDown = trackMouseIsDown();

// The off-screen arrows are a display option; when off, both stay hidden
// regardless of what is playing or where the piano is scrolled.
function refreshOffscreenIndicators(): void {
  if (showOffscreenArrows) {
    updateOffscreenIndicators(pianoContainer, piano, soundingNotes(), offscreenLeftEl, offscreenRightEl);
  } else {
    offscreenLeftEl.hidden = true;
    offscreenRightEl.hidden = true;
  }
}

// The keyboard follows activeNotes immediately; the chord readout follows
// the settler's debounced copy so it skips the in-between sets real playing
// produces.
function smoothingDelays(): SmoothingDelays {
  return chordSmoothing === 'custom' ? customDelays : SMOOTHING_DELAYS[chordSmoothing];
}

function holdMs(): number {
  return holdLastChord ? holdDurationMs : 0;
}

const noteSettler = new NoteSettler(smoothingDelays(), holdMs(), renderChord);

// While sound is on but the browser hasn't let it start yet (see
// Synth.isRunning), the top-bar sound picker says so: muted icon, amber
// outline, and a tooltip. Any click or key press starts it, including a
// click on the picker itself.
const SOUND_PICKER_TITLE = 'The sound notes play with. Pick Sound off to silence the page. Edit sounds on the Sound tab in Settings.';
const SOUND_LOCKED_TITLE = 'Your browser is holding sound back until you click or press a key on the page. Click here (or anywhere) to start it.';

function refreshSoundUnlock(): void {
  const locked = soundSettings.enabled && !synth.isRunning;
  soundPickerRow.classList.toggle('locked', locked);
  soundPickerIcon.textContent = locked ? '\u{1F507}' : '\u{1F50A}';
  soundPickerRow.title = locked ? SOUND_LOCKED_TITLE : SOUND_PICKER_TITLE;
}

const synth = new Synth(soundSettings, refreshSoundUnlock);

// Only the visible tab plays: every open tab gets the MIDI notes.
synth.setMuted(document.hidden);
document.addEventListener('visibilitychange', () => synth.setMuted(document.hidden));

// While sound is on and the highlighter shows a chord, each key played
// sounds that chord type rooted on the key instead of the lone note. The
// chord's other keys light up as auto keys and count toward the chord
// readout. The voicing is fixed at note-on, so changing the highlight
// mid-hold still releases what's sounding.
const soundingVoicings = new Map<number, number[]>();

// Every note sounding: the held keys plus their auto-played chord tones.
function soundingNotes(): Set<number> {
  const notes = new Set(activeNotes);
  soundingVoicings.forEach(voicing => voicing.forEach(m => notes.add(m)));
  return notes;
}

// The auto-played chord tones that aren't themselves held keys.
function autoNotes(): Set<number> {
  const notes = soundingNotes();
  activeNotes.forEach(m => notes.delete(m));
  return notes;
}

function chordVoiceKey(pressed: number, midi: number): VoiceKey {
  return `${pressed}:${midi}`;
}

function soundOn(midi: number, velocity: number): void {
  soundOff(midi);
  const chord = soundSettings.enabled && highlightMode === 'chord' ? HIGHLIGHT_CHORDS.find(c => c.symbol === chordTypeSymbol) : undefined;
  if (chord) chordHighlightHidden = true;
  const voicing = chord ? buildChordVoicing(midi % 12, chord.voicing, midi) : [midi];
  soundingVoicings.set(midi, voicing);
  voicing.forEach(m => synth.noteOn(m, velocity, chordVoiceKey(midi, m)));
}

function soundOff(midi: number): void {
  soundingVoicings.get(midi)?.forEach(m => synth.noteOff(chordVoiceKey(midi, m)));
  soundingVoicings.delete(midi);
}

// Sounds a chord briefly without touching the keyboard or readout: the
// Sound tab's test chord, and a chord picked in the highlighter.
const PREVIEW_MS = 700;
function previewChord(midis: number[]): void {
  synth.resume();
  midis.forEach(m => synth.noteOn(m, MOUSE_VELOCITY, `preview:${m}`));
  setTimeout(() => midis.forEach(m => synth.noteOff(`preview:${m}`)), PREVIEW_MS);
}

function render(): void {
  renderKeys();
  renderChord();
}

function renderKeys(): void {
  const highlighted = highlightMode === 'chord' && chordHighlightHidden ? new Set<number>() : computeHighlightedNotes();
  renderKeyboard(piano, activeNotes, currentNoteNames, highlighted, showNoteLabels, autoNotes());
  refreshOffscreenIndicators();
}

function renderChord(): void {
  const activeMidiSorted = noteSettler.notes;
  const pitchClasses = Array.from(new Set(activeMidiSorted.map(m => m % 12)));
  renderChordDisplay(
    chordDisplayEl, activeMidiSorted, pitchClasses, chordFormulas, currentNoteNames, currentTonicPc, currentMode,
    hasPlayedNote, showSecondaryLine, showTertiaryLine, showRomanNumerals, showNoChord
  );
}

function noteOn(midi: number, source: NoteSource, velocity: number = MOUSE_VELOCITY): void {
  hasPlayedNote = true;
  analytics().once(source === 'midi' ? 'first_midi_note' : 'first_mouse_note');
  sustainedNotes.delete(midi);
  activeNotes.add(midi);
  soundOn(midi, velocity);
  renderKeys();
  noteSettler.update(soundingNotes(), 'on');
}

function noteOff(midi: number): void {
  if (sustainOn) {
    sustainedNotes.add(midi);
    return;
  }
  activeNotes.delete(midi);
  soundOff(midi);
  renderKeys();
  noteSettler.update(soundingNotes(), 'off');
}

// Lift every held key and the pedal at once, e.g. when the MIDI device
// being listened to changes and its note-offs will never arrive.
function releaseAllNotes(): void {
  sustainOn = false;
  sustainedNotes.clear();
  activeNotes.forEach(midi => soundOff(midi));
  activeNotes.clear();
  renderKeys();
  noteSettler.update(soundingNotes(), 'off');
}

function setSustain(isDown: boolean): void {
  sustainOn = isDown;
  if (!isDown) {
    sustainedNotes.forEach(midi => {
      activeNotes.delete(midi);
      soundOff(midi);
    });
    sustainedNotes.clear();
    renderKeys();
    noteSettler.update(soundingNotes(), 'off');
  }
}

// All 88 keys always exist; visibleKeys is a zoom level. Key size is
// recomputed from the container's current width so that exactly that many
// keys fit on screen - the rest stay reachable via horizontal scroll.
pianoContainer.addEventListener('scroll', refreshOffscreenIndicators);

function rebuildPiano(): void {
  const availableWidth = Math.max(pianoContainer.clientWidth - 32, 50);
  const dims = computeKeyDimensions(currentVisibleKeys, availableWidth);
  piano = createPiano(svg, MIN_MIDI, MAX_MIDI, dims, showOctaveLabels);
  attachPianoMouseInput(piano, isMouseDown, (midi, isOn) => (isOn ? noteOn(midi, 'mouse') : noteOff(midi)));
  centerOnMiddleC(pianoContainer, piano);
  render();
}

// ---- Settings modal (tabbed) ----

type SettingsTab = 'theory' | 'display' | 'sound' | 'chords' | 'themes';
const settingsTabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.settings-tab-btn'));
const settingsTabPanels = Array.from(document.querySelectorAll<HTMLElement>('.settings-tab-panel'));
let activeSettingsTab: SettingsTab = 'theory';

function setActiveSettingsTab(tab: SettingsTab): void {
  activeSettingsTab = tab;
  settingsTabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
  settingsTabPanels.forEach(panel => {
    panel.hidden = panel.dataset.tabPanel !== tab;
  });
}

settingsTabButtons.forEach(btn => {
  btn.addEventListener('click', () => setActiveSettingsTab(btn.dataset.tab as SettingsTab));
});
setActiveSettingsTab(activeSettingsTab);

menuButton.addEventListener('click', e => {
  e.stopPropagation();
  setSettingsOpen(settingsOverlay, menuButton, settingsOverlay.hidden);
});
settingsPanel.addEventListener('click', e => e.stopPropagation());
settingsCloseBtn.addEventListener('click', () => setSettingsOpen(settingsOverlay, menuButton, false));
document.addEventListener('click', () => setSettingsOpen(settingsOverlay, menuButton, false));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') setSettingsOpen(settingsOverlay, menuButton, false);
});

// ---- Visible-keys (zoom) control ----

rangeInput.value = String(currentVisibleKeys);
rangeInput.addEventListener('change', () => {
  const parsed = Math.min(Math.max(Math.round(Number(rangeInput.value)) || DEFAULT_VISIBLE_KEYS, 1), TOTAL_KEYS);
  currentVisibleKeys = parsed;
  rangeInput.value = String(parsed);
  saveVisibleKeys(parsed);
  rebuildPiano();
});

// The requested key count is only exact for the current window width, so
// re-fit on resize instead of leaving stale key sizes after a layout change.
let resizeTimer: ReturnType<typeof setTimeout> | undefined;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(rebuildPiano, 150);
});

rebuildPiano();

// ---- Theme (named color sets) ----

function getCurrentTheme(): NamedTheme {
  return themes.find(t => t.name === currentThemeName) ?? themes[0];
}

function isModifiedFromBuiltIn(theme: NamedTheme): boolean {
  const builtIn = BUILT_IN_THEMES.find(b => b.name === theme.name);
  return builtIn !== undefined && !themeEqual(theme, builtIn);
}

function populateThemeSelect(): void {
  for (const select of [themeSelect, themeSelectThemes]) {
    select.innerHTML = '';
    themes.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.name;
      opt.textContent = isModifiedFromBuiltIn(t) ? `${t.name} (modified)` : t.name;
      select.appendChild(opt);
    });
    select.value = currentThemeName;
  }
}

function syncThemeEditorInputs(): void {
  const theme = getCurrentTheme();
  themeNameInput.value = theme.name;
  themeBackgroundInput.value = theme.background;
  themeFontInput.value = theme.font;
  themeWhiteKeyInput.value = theme.whiteKey;
  themeBlackKeyInput.value = theme.blackKey;
  themeActiveKeyInput.value = theme.activeKey;
  themeHighlightInput.value = theme.highlight;
  themeGradientCheckbox.checked = theme.gradient;
  themeBackgroundGradientInput.value = theme.background2;
  themeWhiteKeyGradientInput.value = theme.whiteKey2;
  themeBlackKeyGradientInput.value = theme.blackKey2;
  themeActiveKeyGradientInput.value = theme.activeKey2;
  themeHighlightGradientInput.value = theme.highlight2;
  themeGlowCheckbox.checked = theme.glow;
  fontFamilySelect.value = theme.fontId;
  chordFontSizeInput.value = String(theme.fontSizes.chord);
  secondaryFontSizeInput.value = String(theme.fontSizes.secondary);
  tertiaryFontSizeInput.value = String(theme.fontSizes.tertiary);
  noteFontSizeInput.value = String(theme.fontSizes.note);
  octaveFontSizeInput.value = String(theme.fontSizes.octave);
  const isBuiltIn = BUILT_IN_THEMES.some(b => b.name === theme.name);
  themeNameInput.disabled = isBuiltIn;
  deleteThemeBtn.disabled = themes.length <= 1 || isBuiltIn;
  themeResetBtn.disabled = !isBuiltIn;
}

function selectTheme(name: string): void {
  currentThemeName = name;
  saveThemeName(name);
  analytics().event('theme_selected', { theme: themeLabel() });
  applyTheme(getCurrentTheme());
  themeSelect.value = name;
  themeSelectThemes.value = name;
  syncThemeEditorInputs();
}

function updateCurrentTheme(partial: Partial<Theme>): void {
  Object.assign(getCurrentTheme(), partial);
  applyTheme(getCurrentTheme());
  saveThemes();
  populateThemeSelect();
}

// Populate the <select> before syncThemeEditorInputs() below sets its
// value from the current theme's fontId - setting .value on an empty
// select silently does nothing.
FONT_OPTIONS.forEach(font => {
  const opt = document.createElement('option');
  opt.value = font.id;
  opt.textContent = font.label;
  opt.style.fontFamily = font.family;
  fontFamilySelect.appendChild(opt);
});

populateThemeSelect();
applyTheme(getCurrentTheme());
syncThemeEditorInputs();

themeSelect.addEventListener('change', () => selectTheme(themeSelect.value));
themeSelectThemes.addEventListener('change', () => selectTheme(themeSelectThemes.value));

themeBackgroundInput.addEventListener('input', () => updateCurrentTheme({ background: themeBackgroundInput.value }));
themeFontInput.addEventListener('input', () => updateCurrentTheme({ font: themeFontInput.value }));
themeWhiteKeyInput.addEventListener('input', () => updateCurrentTheme({ whiteKey: themeWhiteKeyInput.value }));
themeBlackKeyInput.addEventListener('input', () => updateCurrentTheme({ blackKey: themeBlackKeyInput.value }));
themeActiveKeyInput.addEventListener('input', () => updateCurrentTheme({ activeKey: themeActiveKeyInput.value }));
themeHighlightInput.addEventListener('input', () => updateCurrentTheme({ highlight: themeHighlightInput.value }));
themeGradientCheckbox.addEventListener('change', () => updateCurrentTheme({ gradient: themeGradientCheckbox.checked }));
themeBackgroundGradientInput.addEventListener('input', () => updateCurrentTheme({ background2: themeBackgroundGradientInput.value }));
themeWhiteKeyGradientInput.addEventListener('input', () => updateCurrentTheme({ whiteKey2: themeWhiteKeyGradientInput.value }));
themeBlackKeyGradientInput.addEventListener('input', () => updateCurrentTheme({ blackKey2: themeBlackKeyGradientInput.value }));
themeActiveKeyGradientInput.addEventListener('input', () => updateCurrentTheme({ activeKey2: themeActiveKeyGradientInput.value }));
themeHighlightGradientInput.addEventListener('input', () => updateCurrentTheme({ highlight2: themeHighlightGradientInput.value }));
themeGlowCheckbox.addEventListener('change', () => updateCurrentTheme({ glow: themeGlowCheckbox.checked }));

fontFamilySelect.addEventListener('change', () => updateCurrentTheme({ fontId: fontFamilySelect.value }));

function updateFontSize(key: keyof FontSizes, value: string): void {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return;
  updateCurrentTheme({ fontSizes: { ...getCurrentTheme().fontSizes, [key]: n } });
}
chordFontSizeInput.addEventListener('change', () => updateFontSize('chord', chordFontSizeInput.value));
secondaryFontSizeInput.addEventListener('change', () => updateFontSize('secondary', secondaryFontSizeInput.value));
tertiaryFontSizeInput.addEventListener('change', () => updateFontSize('tertiary', tertiaryFontSizeInput.value));
noteFontSizeInput.addEventListener('change', () => updateFontSize('note', noteFontSizeInput.value));
octaveFontSizeInput.addEventListener('change', () => updateFontSize('octave', octaveFontSizeInput.value));

themeNameInput.addEventListener('change', () => {
  const theme = getCurrentTheme();
  const nextName = themeNameInput.value.trim();
  if (BUILT_IN_THEMES.some(b => b.name === theme.name) ||
      !nextName || themes.some(t => t !== theme && t.name === nextName)) {
    themeNameInput.value = theme.name;
    return;
  }
  theme.name = nextName;
  currentThemeName = nextName;
  saveThemeName(nextName);
  saveThemes();
  populateThemeSelect();
  syncThemeEditorInputs();
});

newThemeBtn.addEventListener('click', () => {
  const base = getCurrentTheme();
  let name = 'New theme';
  let n = 2;
  while (themes.some(t => t.name === name)) {
    name = `New theme ${n++}`;
  }
  themes.push({ ...base, name });
  saveThemes();
  populateThemeSelect();
  selectTheme(name);
});

deleteThemeBtn.addEventListener('click', () => {
  if (themes.length <= 1 || BUILT_IN_THEMES.some(b => b.name === currentThemeName)) return;
  const index = themes.findIndex(t => t.name === currentThemeName);
  if (index === -1) return;
  themes.splice(index, 1);
  saveThemes();
  populateThemeSelect();
  selectTheme(themes[Math.max(0, index - 1)].name);
});

themeResetBtn.addEventListener('click', () => {
  const builtIn = BUILT_IN_THEMES.find(b => b.name === currentThemeName);
  if (!builtIn) return;
  Object.assign(getCurrentTheme(), builtIn);
  applyTheme(getCurrentTheme());
  saveThemes();
  populateThemeSelect();
  syncThemeEditorInputs();
});

exportThemeBtn.addEventListener('click', () => {
  downloadJSON('midi-info-theme.json', getCurrentTheme());
});

importThemeBtn.addEventListener('click', () => {
  importThemeFileInput.click();
});

importThemeFileInput.addEventListener('change', () => {
  const file = importThemeFileInput.files?.[0];
  importThemeFileInput.value = ''; // allow re-importing the same file later
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(reader.result));
    } catch (e) {
      setErrorMessage(themeImportError, 'That file is not valid JSON.');
      return;
    }
    const theme = parseNamedTheme(parsed);
    if (!theme) {
      setErrorMessage(themeImportError, "That file doesn't look like a theme export.");
      return;
    }
    const existingIndex = themes.findIndex(t => t.name === theme.name);
    if (existingIndex !== -1) {
      themes[existingIndex] = theme;
    } else {
      themes.push(theme);
    }
    saveThemes();
    populateThemeSelect();
    setErrorMessage(themeImportError, null);
    selectTheme(theme.name);
  };
  reader.onerror = () => setErrorMessage(themeImportError, 'Could not read that file.');
  reader.readAsText(file);
});

// ---- Key/mode selection ----

KEYS.forEach((key, i) => {
  const opt = document.createElement('option');
  opt.value = String(i);
  opt.textContent = key.name;
  keySelect.appendChild(opt);
});

// Basic only offers Major/Minor (Ionian/Aeolian under friendlier names);
// intermediate and nerd currently show the same full set of modes - nerd
// will grow its own modes (of the melodic minor scale) later.
const IONIAN_INDEX = MODES.findIndex(m => m.name === 'Ionian');
const AEOLIAN_INDEX = MODES.findIndex(m => m.name === 'Aeolian');

function populateModeSelect(): void {
  modeLabelText.textContent = currentLevel === 'basic' ? 'Tonality' : 'Mode';
  const prevIndex = modeSelect.value ? Number(modeSelect.value) : IONIAN_INDEX;
  modeSelect.innerHTML = '';
  const options = currentLevel === 'basic'
    ? [{ label: 'Major', index: IONIAN_INDEX }, { label: 'Minor', index: AEOLIAN_INDEX }]
    : MODES.map((mode, i) => ({ label: mode.name, index: i }));
  options.forEach(o => {
    const opt = document.createElement('option');
    opt.value = String(o.index);
    opt.textContent = o.label;
    modeSelect.appendChild(opt);
  });
  const validIndices = options.map(o => o.index);
  modeSelect.value = String(validIndices.includes(prevIndex) ? prevIndex : IONIAN_INDEX);
}
populateModeSelect();

function refreshNoteNames(): void {
  const key = KEYS[Number(keySelect.value)];
  currentMode = MODES[Number(modeSelect.value)];
  currentNoteNames = buildKeyNoteNames(key, currentMode);
  currentTonicPc = keyPitchClass(key);
  render();
}
keySelect.addEventListener('change', refreshNoteNames);
modeSelect.addEventListener('change', refreshNoteNames);

// ---- Level control ----

function updateLevelButtons(): void {
  levelButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.level === currentLevel));
}

function setLevel(level: Level): void {
  currentLevel = level;
  saveLevel(level);
  analytics().event('level_changed', { level });
  updateLevelButtons();
  populateModeSelect();
  refreshHighlighterUI();
  refreshNoteNames();
}

levelButtons.forEach(btn => {
  btn.addEventListener('click', () => setLevel(btn.dataset.level as Level));
});
updateLevelButtons();

// ---- Chord-display line toggles and octave labels ----

secondaryLineCheckbox.checked = showSecondaryLine;
secondaryLineCheckbox.addEventListener('change', () => {
  showSecondaryLine = secondaryLineCheckbox.checked;
  saveBoolSetting('showSecondaryLine', showSecondaryLine);
  render();
});

tertiaryLineCheckbox.checked = showTertiaryLine;
tertiaryLineCheckbox.addEventListener('change', () => {
  showTertiaryLine = tertiaryLineCheckbox.checked;
  saveBoolSetting('showTertiaryLine', showTertiaryLine);
  render();
});

noChordCheckbox.checked = showNoChord;
noChordCheckbox.addEventListener('change', () => {
  showNoChord = noChordCheckbox.checked;
  saveBoolSetting('showNoChord', showNoChord);
  render();
});

romanNumeralsCheckbox.checked = showRomanNumerals;
romanNumeralsCheckbox.addEventListener('change', () => {
  showRomanNumerals = romanNumeralsCheckbox.checked;
  saveBoolSetting('showRomanNumerals', showRomanNumerals);
  render();
});

octaveLabelsCheckbox.checked = showOctaveLabels;
octaveLabelsCheckbox.addEventListener('change', () => {
  showOctaveLabels = octaveLabelsCheckbox.checked;
  saveBoolSetting('showOctaveLabels', showOctaveLabels);
  rebuildPiano();
});

noteLabelsCheckbox.checked = showNoteLabels;
noteLabelsCheckbox.addEventListener('change', () => {
  showNoteLabels = noteLabelsCheckbox.checked;
  saveBoolSetting('showNoteLabels', showNoteLabels);
  render();
});

// ---- Chord smoothing and hold ----

function reconfigureSettler(): void {
  noteSettler.configure(smoothingDelays(), holdMs(), soundingNotes());
}

function syncSmoothingInputs(): void {
  chordSmoothingSelect.value = chordSmoothing;
  smoothingAdvancedEl.hidden = chordSmoothing !== 'custom';
  smoothingAttackInput.value = String(customDelays.attackMs);
  smoothingReleaseInput.value = String(customDelays.releaseMs);
  holdLastChordCheckbox.checked = holdLastChord;
  holdDurationRow.hidden = !holdLastChord;
  holdDurationInput.value = holdDurationMs === Infinity ? '' : String(holdDurationMs);
}

chordSmoothingSelect.addEventListener('change', () => {
  const value = chordSmoothingSelect.value;
  if (!isSmoothingLevel(value)) return;
  chordSmoothing = value;
  saveSmoothing(chordSmoothing);
  syncSmoothingInputs();
  reconfigureSettler();
});

// A bad entry snaps back to the last good value rather than saving.
function bindDelayInput(input: HTMLInputElement, key: keyof SmoothingDelays): void {
  input.addEventListener('change', () => {
    const ms = parseDelayMs(input.value);
    if (ms !== null) {
      customDelays = { ...customDelays, [key]: ms };
      saveCustomDelays(customDelays);
      reconfigureSettler();
    }
    syncSmoothingInputs();
  });
}
bindDelayInput(smoothingAttackInput, 'attackMs');
bindDelayInput(smoothingReleaseInput, 'releaseMs');

holdLastChordCheckbox.addEventListener('change', () => {
  holdLastChord = holdLastChordCheckbox.checked;
  saveBoolSetting('holdLastChord', holdLastChord);
  syncSmoothingInputs();
  reconfigureSettler();
});

// Blank holds until the next note; a bad entry snaps back like the delays.
holdDurationInput.addEventListener('change', () => {
  const ms = parseHoldMs(holdDurationInput.value);
  if (ms !== null) {
    holdDurationMs = ms;
    saveHoldDuration(holdDurationMs);
    reconfigureSettler();
  }
  syncSmoothingInputs();
});

syncSmoothingInputs();

offscreenArrowsCheckbox.checked = showOffscreenArrows;
offscreenArrowsCheckbox.addEventListener('change', () => {
  showOffscreenArrows = offscreenArrowsCheckbox.checked;
  saveBoolSetting('showOffscreenArrows', showOffscreenArrows);
  refreshOffscreenIndicators();
});

// ---- Sound ----

// Knob sliders are found by convention: #sound<Knob>Input with its readout
// in #sound<Knob>Value.
const soundKnobInputs = new Map(SOUND_KNOBS.map(knob => {
  const id = 'sound' + knob.charAt(0).toUpperCase() + knob.slice(1);
  return [knob, {
    input: document.getElementById(id + 'Input') as HTMLInputElement,
    value: document.getElementById(id + 'Value') as HTMLOutputElement,
  }];
}));

function soundKnobText(knob: SoundKnob, n: number): string {
  if (knob === 'unisonVoices') return String(n);
  if (knob === 'unisonDetune' || knob === 'vibratoDepth') return `${n} cents`;
  if (knob === 'vibratoRate') return `${vibratoHz(n).toFixed(1)} Hz`;
  return knob.endsWith('Ms') ? `${n} ms` : `${n}%`;
}

const soundVolumeInput = document.getElementById('soundVolumeInput') as HTMLInputElement;
const soundVolumeValue = document.getElementById('soundVolumeValue') as HTMLOutputElement;

// Each effect's tick and the options it reveals, like Hold last chord.
const soundToggleInputs = new Map<SoundToggle, { checkbox: HTMLInputElement; options: HTMLElement }>([
  ['filterEnv', {
    checkbox: document.getElementById('soundFilterEnvCheckbox') as HTMLInputElement,
    options: document.getElementById('soundFilterEnvOptions') as HTMLElement,
  }],
  ['vibrato', {
    checkbox: document.getElementById('soundVibratoCheckbox') as HTMLInputElement,
    options: document.getElementById('soundVibratoOptions') as HTMLElement,
  }],
  ['unison', {
    checkbox: document.getElementById('soundUnisonCheckbox') as HTMLInputElement,
    options: document.getElementById('soundUnisonOptions') as HTMLElement,
  }],
  ['reverbEnabled', {
    checkbox: document.getElementById('soundReverbCheckbox') as HTMLInputElement,
    options: document.getElementById('soundReverbOptions') as HTMLElement,
  }],
]);

function getCurrentSound(): NamedSound {
  return sounds.find(t => t.name === currentSoundName) ?? sounds[0];
}

function isBuiltInSound(name: string): boolean {
  return BUILT_IN_SOUNDS.some(b => b.name === name);
}

function isSoundModifiedFromBuiltIn(sound: NamedSound): boolean {
  const builtIn = BUILT_IN_SOUNDS.find(b => b.name === sound.name);
  return builtIn !== undefined && !soundEqual(sound, builtIn);
}

// The top-bar picker's "Sound off" entry. Safe as a sentinel: a sound's
// name is never empty.
const SOUND_OFF = '';

// Fills both pickers: the Sound tab's, and the top bar's, which leads with
// "Sound off" so it doubles as the on/off switch.
function populateSoundSelect(): void {
  soundPresetSelect.innerHTML = '';
  soundPickerSelect.innerHTML = '';
  const off = document.createElement('option');
  off.value = SOUND_OFF;
  off.textContent = 'Sound off';
  soundPickerSelect.appendChild(off);
  sounds.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.name;
    opt.textContent = isSoundModifiedFromBuiltIn(t) ? `${t.name} (modified)` : t.name;
    soundPresetSelect.appendChild(opt);
    soundPickerSelect.appendChild(opt.cloneNode(true));
  });
  soundPresetSelect.value = currentSoundName;
  soundPickerSelect.value = soundEnabled ? currentSoundName : SOUND_OFF;
}

function syncSoundInputs(): void {
  const sound = getCurrentSound();
  soundEnabledCheckbox.checked = soundEnabled;
  soundControlsEl.disabled = !soundEnabled;
  soundPresetSelect.value = currentSoundName;
  soundPickerSelect.value = soundEnabled ? currentSoundName : SOUND_OFF;
  soundNameInput.value = sound.name;
  soundWaveformSelect.value = sound.waveform;
  soundKnobInputs.forEach(({ input, value }, knob) => {
    input.value = String(sound[knob]);
    value.value = soundKnobText(knob, sound[knob]);
  });
  soundToggleInputs.forEach(({ checkbox, options }, toggle) => {
    checkbox.checked = sound[toggle];
    options.hidden = !sound[toggle];
  });
  soundVolumeInput.value = String(soundVolume);
  soundVolumeValue.value = `${soundVolume}%`;
  const builtIn = isBuiltInSound(sound.name);
  soundNameInput.disabled = builtIn;
  soundDeleteBtn.disabled = sounds.length <= 1 || builtIn;
  soundResetBtn.disabled = !builtIn;
  refreshSoundUnlock();
}

// Push the current sound and the global settings to the synth and the inputs.
function applySound(): void {
  soundSettings = { ...getCurrentSound(), enabled: soundEnabled, volume: soundVolume };
  synth.configure(soundSettings);
  syncSoundInputs();
}

function selectSound(name: string): void {
  currentSoundName = name;
  saveSoundName(name);
  populateSoundSelect();
  applySound();
}

function updateCurrentSound(partial: Partial<NamedSound>): void {
  Object.assign(getCurrentSound(), partial);
  saveSounds();
  populateSoundSelect();
  applySound();
}

function setSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
  saveBoolSetting('soundEnabled', soundEnabled);
  applySound();
  // Called from a user gesture, the moment the browser allows audio to start.
  synth.resume();
}

soundEnabledCheckbox.addEventListener('change', () => setSoundEnabled(soundEnabledCheckbox.checked));

soundPresetSelect.addEventListener('change', () => selectSound(soundPresetSelect.value));

// Top bar: a sound turns sound on as it's picked; "Sound off" turns it off.
soundPickerSelect.addEventListener('change', () => {
  const name = soundPickerSelect.value;
  if (name === SOUND_OFF) {
    setSoundEnabled(false);
    return;
  }
  selectSound(name);
  if (!soundEnabled) setSoundEnabled(true);
});

soundWaveformSelect.addEventListener('change', () => {
  const value = soundWaveformSelect.value;
  if (isWaveform(value)) updateCurrentSound({ waveform: value });
});

// Sliders apply live while dragging, so each knob can be tuned by ear.
soundKnobInputs.forEach(({ input }, knob) => {
  input.addEventListener('input', () => {
    const n = parseSoundKnob(knob, input.value);
    if (n !== null) updateCurrentSound({ [knob]: n });
  });
});

soundToggleInputs.forEach(({ checkbox }, toggle) => {
  checkbox.addEventListener('change', () => updateCurrentSound({ [toggle]: checkbox.checked }));
});

soundVolumeInput.addEventListener('input', () => {
  const n = parseVolume(soundVolumeInput.value);
  if (n === null) return;
  soundVolume = n;
  saveVolume(n);
  applySound();
});

soundNameInput.addEventListener('change', () => {
  const sound = getCurrentSound();
  const nextName = soundNameInput.value.trim();
  if (isBuiltInSound(sound.name) || !nextName || sounds.some(t => t !== sound && t.name === nextName)) {
    soundNameInput.value = sound.name;
    return;
  }
  sound.name = nextName;
  saveSounds();
  selectSound(nextName);
});

soundNewBtn.addEventListener('click', () => {
  let name = 'New sound';
  let n = 2;
  while (sounds.some(t => t.name === name)) {
    name = `New sound ${n++}`;
  }
  sounds.push({ ...getCurrentSound(), name });
  saveSounds();
  selectSound(name);
});

soundDeleteBtn.addEventListener('click', () => {
  if (sounds.length <= 1 || isBuiltInSound(currentSoundName)) return;
  const index = sounds.findIndex(t => t.name === currentSoundName);
  if (index === -1) return;
  sounds.splice(index, 1);
  saveSounds();
  selectSound(sounds[Math.max(0, index - 1)].name);
});

soundResetBtn.addEventListener('click', () => {
  const builtIn = BUILT_IN_SOUNDS.find(b => b.name === currentSoundName);
  if (builtIn) updateCurrentSound({ ...builtIn });
});

// A C major triad, so the knobs can be tried without a keyboard.
soundTestBtn.addEventListener('click', () => previewChord([60, 64, 67]));

// Browsers only start audio after a click or key press on the page, and
// MIDI input doesn't count. Any gesture will do, so sound saved as on from
// an earlier visit starts at the first interaction.
document.addEventListener('pointerdown', () => synth.resume(), true);
document.addEventListener('keydown', () => synth.resume(), true);

populateSoundSelect();
syncSoundInputs();

// ---- Chord table editor ----

function refreshChordTable(): void {
  renderChordTable(chordTableBody, chordFormulas, {
    onSymbolChange(index, symbol) {
      chordFormulas[index].symbol = symbol;
      saveChordFormulas();
      render();
    },
    onIntervalsChange(index, text) {
      chordFormulas[index].intervals = parseIntervals(text);
      saveChordFormulas();
      render();
      return chordFormulas[index].intervals.join(',');
    },
    onDelete(index) {
      chordFormulas.splice(index, 1);
      saveChordFormulas();
      refreshChordTable();
      render();
    },
  });
}

addChordBtn.addEventListener('click', () => {
  chordFormulas.push({ symbol: '', intervals: [] });
  refreshChordTable();
});

resetChordsBtn.addEventListener('click', () => {
  chordFormulas = cloneDefaultChordFormulas();
  deleteCookie('chordFormulas');
  syncSettingsSnapshot();
  setErrorMessage(chordImportError, null);
  refreshChordTable();
  render();
});

exportChordsBtn.addEventListener('click', () => {
  downloadJSON('midi-info-chords.json', chordFormulas);
});

importChordsBtn.addEventListener('click', () => {
  importFileInput.click();
});

importFileInput.addEventListener('change', () => {
  const file = importFileInput.files?.[0];
  importFileInput.value = ''; // allow re-importing the same file later
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(reader.result));
    } catch (e) {
      setErrorMessage(chordImportError, 'That file is not valid JSON.');
      return;
    }
    const normalized = parseChordFormulas(parsed);
    if (!normalized) {
      setErrorMessage(chordImportError, "That file doesn't look like a chord table export.");
      return;
    }
    chordFormulas = normalized;
    saveChordFormulas();
    setErrorMessage(chordImportError, null);
    refreshChordTable();
    render();
  };
  reader.onerror = () => setErrorMessage(chordImportError, 'Could not read that file.');
  reader.readAsText(file);
});

refreshChordTable();

// ---- Highlighter (scale/chord study aid) ----

function availableScales(): HighlightScale[] {
  return HIGHLIGHT_SCALES.filter(s => levelAtLeast(currentLevel, s.minLevel));
}

function availableChords(): HighlightChord[] {
  return HIGHLIGHT_CHORDS.filter(c => levelAtLeast(currentLevel, c.minLevel));
}

function computeHighlightedNotes(): Set<number> {
  const notes = new Set<number>();
  if (highlightMode === 'scale' && scaleRootIndex !== null) {
    const scale = HIGHLIGHT_SCALES.find(s => s.name === scaleTypeName);
    if (scale) {
      const pcs = new Set(scalePitchClasses(keyPitchClass(KEYS[scaleRootIndex]), scale));
      for (let midi = MIN_MIDI; midi <= MAX_MIDI; midi++) {
        if (pcs.has(midi % 12)) notes.add(midi);
      }
    }
  } else if (highlightMode === 'chord' && chordRootIndex !== null) {
    const chord = HIGHLIGHT_CHORDS.find(c => c.symbol === chordTypeSymbol);
    if (chord) {
      buildChordVoicing(keyPitchClass(KEYS[chordRootIndex]), chord.voicing).forEach(m => notes.add(m));
    }
  }
  return notes;
}

function chordOptionLabel(symbol: string): string {
  if (symbol === '') return 'Major';
  if (symbol === '-') return 'Minor';
  return symbol;
}

function renderRootButtonRow(container: HTMLElement, isActive: (index: number) => boolean, onSelect: (index: number) => void): void {
  container.innerHTML = '';
  KEYS.forEach((key, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'root-btn' + (isActive(i) ? ' active' : '');
    btn.textContent = key.name;
    btn.addEventListener('click', () => onSelect(i));
    container.appendChild(btn);
  });
}

function selectScaleRoot(index: number): void {
  highlightMode = highlightMode === 'scale' && scaleRootIndex === index ? null : 'scale';
  scaleRootIndex = index;
  refreshHighlighterUI();
  render();
}

function selectScaleType(name: string): void {
  scaleTypeName = name;
  if (scaleRootIndex !== null) highlightMode = 'scale';
  refreshHighlighterUI();
  render();
}

// Picking a chord (root or type) plays it, so you hear what's highlighted.
function previewHighlightedChord(): void {
  if (highlightMode !== 'chord') return;
  previewChord(Array.from(computeHighlightedNotes()));
}

function selectChordRoot(index: number): void {
  chordHighlightHidden = false;
  highlightMode = highlightMode === 'chord' && chordRootIndex === index ? null : 'chord';
  chordRootIndex = index;
  refreshHighlighterUI();
  render();
  previewHighlightedChord();
}

function selectChordType(symbol: string): void {
  chordHighlightHidden = false;
  chordTypeSymbol = symbol;
  if (chordRootIndex !== null) highlightMode = 'chord';
  refreshHighlighterUI();
  render();
  previewHighlightedChord();
}

function refreshHighlighterUI(): void {
  const scales = availableScales();
  const chords = availableChords();

  // A Level change can make the active highlight's type unavailable.
  if (highlightMode === 'scale' && !scales.some(s => s.name === scaleTypeName)) highlightMode = null;
  if (highlightMode === 'chord' && !chords.some(c => c.symbol === chordTypeSymbol)) highlightMode = null;

  renderRootButtonRow(scaleRootButtonsEl, i => highlightMode === 'scale' && scaleRootIndex === i, selectScaleRoot);
  renderRootButtonRow(chordRootButtonsEl, i => highlightMode === 'chord' && chordRootIndex === i, selectChordRoot);

  scaleTypeButtonsEl.innerHTML = '';
  scales.forEach(scale => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'type-btn' + (highlightMode === 'scale' && scale.name === scaleTypeName ? ' active' : '');
    btn.textContent = scale.name;
    btn.addEventListener('click', () => selectScaleType(scale.name));
    scaleTypeButtonsEl.appendChild(btn);
  });

  chordTypeSelect.innerHTML = '';
  chords.forEach(chord => {
    const opt = document.createElement('option');
    opt.value = chord.symbol;
    opt.textContent = chordOptionLabel(chord.symbol);
    chordTypeSelect.appendChild(opt);
  });
  chordTypeSelect.value = chordTypeSymbol;
}

chordTypeSelect.addEventListener('change', () => selectChordType(chordTypeSelect.value));

function setHighlighterOpen(open: boolean): void {
  highlighterOpen = open;
  highlighterBody.hidden = !open;
  highlighterToggle.setAttribute('aria-expanded', String(open));
  highlighterToggle.classList.toggle('open', open);
}

highlighterToggle.addEventListener('click', () => setHighlighterOpen(!highlighterOpen));
setHighlighterOpen(false);
refreshHighlighterUI();

// ---- Analytics ----

// Built-in themes report by name (with "(modified)" when edited); a
// user-created theme is just "custom" so user-typed names never leave the
// browser.
function themeLabel(): string {
  const theme = getCurrentTheme();
  if (!BUILT_IN_THEMES.some(b => b.name === theme.name)) return 'custom';
  return isModifiedFromBuiltIn(theme) ? `${theme.name} (modified)` : theme.name;
}

// The persisted settings as GA4 user properties. Every display toggle
// defaults on, so only the ones turned off are listed.
function settingsSnapshot(): Params {
  const off: string[] = [];
  if (!showSecondaryLine) off.push('secondary');
  if (!showTertiaryLine) off.push('tertiary');
  if (!showRomanNumerals) off.push('roman');
  if (!showOctaveLabels) off.push('octave');
  if (!showNoteLabels) off.push('notes');
  if (!showOffscreenArrows) off.push('arrows');
  if (!showNoChord) off.push('nc');
  return {
    level: currentLevel,
    theme: themeLabel(),
    visible_keys: currentVisibleKeys,
    display_off: off.length ? off.join(',') : 'none',
    chords_custom: getCookie('chordFormulas') !== null ? 'yes' : 'no',
  };
}

// Called from every saveX() so the snapshot tracks the cookies. Before
// initAnalytics() runs the tracker is a no-op, so early saves are harmless.
function syncSettingsSnapshot(): void {
  analytics().setUserProperties(settingsSnapshot());
}

initAnalytics(settingsSnapshot());

// ---- MIDI ----

// The device the user chose to listen to, by name (ids can change between
// visits); absent means every device. Kept while that device is unplugged,
// so plugging it back in restores the choice.
function loadMidiInput(): string | null {
  return getCookie('midiInput');
}

function saveMidiInput(name: string | null): void {
  if (name === null) deleteCookie('midiInput');
  else setCookie('midiInput', name, 365);
}

let midiState: MidiState = { kind: 'checking' };
let preferredMidiInput: string | null = loadMidiInput();

// The top-bar MIDI picker: its selected entry is the status (see
// midiPickerModel), so there's no separate status line.
function renderMidiPicker(): void {
  const model = midiPickerModel(midiState, preferredMidiInput);
  midiPickerSelect.innerHTML = '';
  model.options.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    midiPickerSelect.appendChild(opt);
  });
  midiPickerSelect.value = model.value;
  midiPickerSelect.disabled = model.disabled;
  midiPickerRow.title = model.title;
  midiPickerRow.classList.toggle('error', model.error);
}

const midi = initMIDI({
  onNoteOn: (note, velocity) => noteOn(note, 'midi', velocity),
  onNoteOff: noteOff,
  onSustainChange: setSustain,
  onStateChange(state) {
    midiState = state;
    if (state.kind === 'ready' && state.inputs.length > 0) {
      analytics().once('midi_device_connected', { device_count: state.inputs.length });
    }
    renderMidiPicker();
  },
  onUnsupported() {
    analytics().once('midi_unsupported');
  },
  onAccess(granted) {
    analytics().once('midi_access', { result: granted ? 'granted' : 'denied' });
  },
});
midi.setInputFilter(preferredMidiInput);

midiPickerSelect.addEventListener('change', () => {
  const value = midiPickerSelect.value;
  preferredMidiInput = value === ALL_DEVICES ? null : value;
  saveMidiInput(preferredMidiInput);
  midi.setInputFilter(preferredMidiInput);
  // A key held on a device that's now ignored would never get its
  // note-off, so start clean.
  releaseAllNotes();
  renderMidiPicker();
});
