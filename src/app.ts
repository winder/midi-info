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
  buildChordVoicing,
  buildKeyNoteNames,
  keyPitchClass,
  levelAtLeast,
  parseChordFormulas,
  scalePitchClasses,
} from './theory';
import {
  MAX_MIDI,
  MIN_MIDI,
  Piano,
  TOTAL_KEYS,
  attachPianoMouseInput,
  centerOnMiddleC,
  computeKeyDimensions,
  createPiano,
  downloadJSON,
  renderChordDisplay,
  renderChordTable,
  renderKeyboard,
  setErrorMessage,
  setSettingsOpen,
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

// ---- Debug (gates debug-only features, e.g. the chord table editor) ----

function loadDebug(): boolean {
  const raw = getCookie('debugMode');
  if (raw === '1') return true;
  if (raw === '0') return false;
  // No explicit preference yet: default on if the user has already
  // customized their chord table, so they don't lose the editor.
  return getCookie('chordFormulas') !== null;
}

function saveDebug(value: boolean): void {
  setCookie('debugMode', value ? '1' : '0', 365);
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
let chordFormulas: ChordFormula[] = loadChordFormulas();
let currentLevel: Level = loadLevel();
let debugMode: boolean = loadDebug();
let currentVisibleKeys: number = loadVisibleKeys();
const activeNotes = new Set<number>();
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
const debugCheckbox = document.getElementById('debugCheckbox') as HTMLInputElement;
const chordsSection = document.getElementById('chordsSection') as HTMLElement;
const levelButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.level-btn'));
const chordTableBody = document.getElementById('chordTableBody') as HTMLElement;
const addChordBtn = document.getElementById('addChordBtn') as HTMLButtonElement;
const resetChordsBtn = document.getElementById('resetChordsBtn') as HTMLButtonElement;
const exportChordsBtn = document.getElementById('exportChordsBtn') as HTMLButtonElement;
const importChordsBtn = document.getElementById('importChordsBtn') as HTMLButtonElement;
const importFileInput = document.getElementById('importFileInput') as HTMLInputElement;
const chordImportError = document.getElementById('chordImportError') as HTMLElement;
const menuButton = document.getElementById('menuButton') as HTMLElement;
const settingsPanel = document.getElementById('settingsPanel') as HTMLElement;
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

versionInfoEl.textContent = `Build ${__COMMIT_HASH__}`;

// ---- Piano setup ----

let piano: Piano;
const isMouseDown = trackMouseIsDown();

function render(): void {
  renderKeyboard(piano, activeNotes, currentNoteNames, computeHighlightedNotes());

  const activeMidiSorted = Array.from(activeNotes).sort((a, b) => a - b);
  const pitchClasses = Array.from(new Set(activeMidiSorted.map(m => m % 12)));
  renderChordDisplay(chordDisplayEl, activeMidiSorted, pitchClasses, chordFormulas, currentNoteNames);
}

function noteOn(midi: number): void {
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
  piano = createPiano(svg, MIN_MIDI, MAX_MIDI, dims);
  attachPianoMouseInput(piano, isMouseDown, (midi, isOn) => (isOn ? noteOn(midi) : noteOff(midi)));
  centerOnMiddleC(pianoContainer, piano);
  render();
}

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
  currentNoteNames = buildKeyNoteNames(KEYS[Number(keySelect.value)], MODES[Number(modeSelect.value)]);
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

// ---- Debug toggle (gates debug-only sections, e.g. the chord editor) ----

function updateChordsVisibility(): void {
  chordsSection.hidden = !debugMode;
}

debugCheckbox.checked = debugMode;
updateChordsVisibility();
debugCheckbox.addEventListener('change', () => {
  debugMode = debugCheckbox.checked;
  saveDebug(debugMode);
  updateChordsVisibility();
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
      buildChordVoicing(keyPitchClass(KEYS[chordRootIndex]), chord.intervals).forEach(m => notes.add(m));
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

// ---- Settings popup ----

menuButton.addEventListener('click', e => {
  e.stopPropagation();
  setSettingsOpen(settingsPanel, menuButton, settingsPanel.hidden);
});
settingsPanel.addEventListener('click', e => e.stopPropagation());
document.addEventListener('click', () => setSettingsOpen(settingsPanel, menuButton, false));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') setSettingsOpen(settingsPanel, menuButton, false);
});

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
