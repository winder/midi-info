// App orchestrator: owns state, wires up DOM events, and initializes MIDI.

import { initMIDI } from './midi';
import {
  ChordFormula,
  DEFAULT_CHORD_FORMULAS,
  KEYS,
  buildKeyNoteNames,
} from './theory';
import {
  attachPianoMouseInput,
  centerOnMiddleC,
  createPiano,
  renderChordDisplay,
  renderChordTable,
  renderKeyboard,
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

function cloneDefaultChordFormulas(): ChordFormula[] {
  return DEFAULT_CHORD_FORMULAS.map(f => ({ symbol: f.symbol, intervals: f.intervals.slice() }));
}

function loadChordFormulas(): ChordFormula[] {
  const raw = getCookie('chordFormulas');
  if (!raw) return cloneDefaultChordFormulas();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('not an array');
    return parsed.map((f: { symbol?: unknown; intervals?: unknown }) => ({
      symbol: String(f.symbol || ''),
      intervals: Array.isArray(f.intervals)
        ? Array.from(new Set(
            (f.intervals as unknown[])
              .map(n => ((Number(n) % 12) + 12) % 12)
              .filter(n => !Number.isNaN(n))
          ))
        : [],
    }));
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
const activeNotes = new Set<number>();

// ---- DOM references ----

const svg = document.getElementById('piano') as unknown as SVGSVGElement;
const chordDisplayEl = document.getElementById('chordDisplay') as HTMLElement;
const pianoContainer = document.getElementById('pianoContainer') as HTMLElement;
const keySelect = document.getElementById('keySelect') as HTMLSelectElement;
const chordTableBody = document.getElementById('chordTableBody') as HTMLElement;
const addChordBtn = document.getElementById('addChordBtn') as HTMLButtonElement;
const resetChordsBtn = document.getElementById('resetChordsBtn') as HTMLButtonElement;
const menuButton = document.getElementById('menuButton') as HTMLElement;
const settingsPanel = document.getElementById('settingsPanel') as HTMLElement;
const statusEl = document.getElementById('status') as HTMLElement;
const inputSelect = document.getElementById('inputSelect') as HTMLSelectElement;
const inputRow = document.getElementById('inputRow') as HTMLElement;

// ---- Piano setup ----

const piano = createPiano(svg);

function render(): void {
  renderKeyboard(piano, activeNotes, currentNoteNames);

  const activeMidiSorted = Array.from(activeNotes).sort((a, b) => a - b);
  const pitchClasses = Array.from(new Set(activeMidiSorted.map(m => m % 12)));
  renderChordDisplay(chordDisplayEl, activeMidiSorted, pitchClasses, chordFormulas, currentNoteNames);
}

function noteOn(midi: number): void {
  activeNotes.add(midi);
  render();
}

function noteOff(midi: number): void {
  activeNotes.delete(midi);
  render();
}

attachPianoMouseInput(piano, (midi, isOn) => (isOn ? noteOn(midi) : noteOff(midi)));

render();
centerOnMiddleC(pianoContainer, piano);

// ---- Key selection ----

KEYS.forEach((key, i) => {
  const opt = document.createElement('option');
  opt.value = String(i);
  opt.textContent = key.name;
  keySelect.appendChild(opt);
});
keySelect.addEventListener('change', () => {
  currentNoteNames = buildKeyNoteNames(KEYS[Number(keySelect.value)]);
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
  refreshChordTable();
  render();
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
