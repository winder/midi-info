// App orchestrator: owns state, wires up DOM events, and initializes MIDI.

declare const __COMMIT_HASH__: string;

import { initMIDI } from './midi';
import {
  ChordFormula,
  DEFAULT_CHORD_FORMULAS,
  KEYS,
  MODES,
  buildKeyNoteNames,
  parseChordFormulas,
} from './theory';
import {
  attachPianoMouseInput,
  centerOnMiddleC,
  createPiano,
  downloadJSON,
  renderChordDisplay,
  renderChordTable,
  renderKeyboard,
  setErrorMessage,
  setSettingsOpen,
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

type Level = 'basic' | 'intermediate' | 'nerd';

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
const activeNotes = new Set<number>();
let sustainOn = false;
// Notes released while the sustain pedal is held: kept sounding until the pedal comes up.
const sustainedNotes = new Set<number>();

// ---- DOM references ----

const svg = document.getElementById('piano') as unknown as SVGSVGElement;
const chordDisplayEl = document.getElementById('chordDisplay') as HTMLElement;
const pianoContainer = document.getElementById('pianoContainer') as HTMLElement;
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

versionInfoEl.textContent = `Build ${__COMMIT_HASH__}`;

// ---- Piano setup ----

const piano = createPiano(svg);

function render(): void {
  renderKeyboard(piano, activeNotes, currentNoteNames);

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

attachPianoMouseInput(piano, (midi, isOn) => (isOn ? noteOn(midi) : noteOff(midi)));

render();
centerOnMiddleC(pianoContainer, piano);

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
