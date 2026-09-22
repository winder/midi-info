// App orchestrator: owns state, wires up DOM events, and initializes MIDI.

declare const __COMMIT_HASH__: string;

import { initMIDI } from './midi';
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
const activeNotes = new Set<number>();
let hasPlayedNote = false;
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

// ---- DOM references ----

const svg = document.getElementById('piano') as unknown as SVGSVGElement;
const chordDisplayEl = document.getElementById('chordDisplay') as HTMLElement;
const pianoContainer = document.getElementById('pianoContainer') as HTMLElement;
const rangeInput = document.getElementById('rangeInput') as HTMLInputElement;
const keySelect = document.getElementById('keySelect') as HTMLSelectElement;
const modeSelect = document.getElementById('modeSelect') as HTMLSelectElement;
const modeLabelText = document.getElementById('modeLabelText') as HTMLElement;
const secondaryLineCheckbox = document.getElementById('secondaryLineCheckbox') as HTMLInputElement;
const tertiaryLineCheckbox = document.getElementById('tertiaryLineCheckbox') as HTMLInputElement;
const romanNumeralsCheckbox = document.getElementById('romanNumeralsCheckbox') as HTMLInputElement;
const octaveLabelsCheckbox = document.getElementById('octaveLabelsCheckbox') as HTMLInputElement;
const noteLabelsCheckbox = document.getElementById('noteLabelsCheckbox') as HTMLInputElement;
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
const statusEl = document.getElementById('status') as HTMLElement;
const inputSelect = document.getElementById('inputSelect') as HTMLSelectElement;
const inputRow = document.getElementById('inputRow') as HTMLElement;
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

versionInfoEl.textContent = `Build ${__COMMIT_HASH__}`;

// ---- Piano setup ----

let piano: Piano;
const isMouseDown = trackMouseIsDown();

function render(): void {
  renderKeyboard(piano, activeNotes, currentNoteNames, computeHighlightedNotes(), showNoteLabels);

  const activeMidiSorted = Array.from(activeNotes).sort((a, b) => a - b);
  const pitchClasses = Array.from(new Set(activeMidiSorted.map(m => m % 12)));
  renderChordDisplay(
    chordDisplayEl, activeMidiSorted, pitchClasses, chordFormulas, currentNoteNames, currentTonicPc, currentMode,
    hasPlayedNote, showSecondaryLine, showTertiaryLine, showRomanNumerals
  );
}

function noteOn(midi: number): void {
  hasPlayedNote = true;
  sustainedNotes.delete(midi);
  activeNotes.add(midi);
  render();
}

function noteOff(midi: number): void {
  if (sustainOn) {
    sustainedNotes.add(midi);
    return;
  }
  activeNotes.delete(midi);
  render();
}

function setSustain(isDown: boolean): void {
  sustainOn = isDown;
  if (!isDown) {
    sustainedNotes.forEach(midi => activeNotes.delete(midi));
    sustainedNotes.clear();
    render();
  }
}

// All 88 keys always exist; visibleKeys is a zoom level. Key size is
// recomputed from the container's current width so that exactly that many
// keys fit on screen - the rest stay reachable via horizontal scroll.
function rebuildPiano(): void {
  const availableWidth = Math.max(pianoContainer.clientWidth - 32, 50);
  const dims = computeKeyDimensions(currentVisibleKeys, availableWidth);
  piano = createPiano(svg, MIN_MIDI, MAX_MIDI, dims, showOctaveLabels);
  attachPianoMouseInput(piano, isMouseDown, (midi, isOn) => (isOn ? noteOn(midi) : noteOff(midi)));
  centerOnMiddleC(pianoContainer, piano);
  render();
}

// ---- Settings modal (tabbed) ----

type SettingsTab = 'theory' | 'display' | 'chords' | 'themes';
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

function selectChordRoot(index: number): void {
  highlightMode = highlightMode === 'chord' && chordRootIndex === index ? null : 'chord';
  chordRootIndex = index;
  refreshHighlighterUI();
  render();
}

function selectChordType(symbol: string): void {
  chordTypeSymbol = symbol;
  if (chordRootIndex !== null) highlightMode = 'chord';
  refreshHighlighterUI();
  render();
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

// ---- MIDI ----

initMIDI({
  onNoteOn: noteOn,
  onNoteOff: noteOff,
  onSustainChange: setSustain,
  onStatusChange(text, className) {
    statusEl.textContent = text;
    statusEl.className = className;
  },
  onInputsChange(inputNames) {
    if (inputNames.length === 0) {
      inputRow.style.display = 'none';
      return;
    }
    inputRow.style.display = '';
    inputSelect.innerHTML = '';
    inputNames.forEach(name => {
      const opt = document.createElement('option');
      opt.textContent = name;
      inputSelect.appendChild(opt);
    });
  },
});
