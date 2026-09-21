// SVG generation and DOM rendering. Functions here take data in and update
// the DOM; they don't own application state (see app.ts for that).

import { ChordFormula, INTERVAL_NAMES, Mode, chordLabel, detectChords, isBlackPitch, octaveOf, romanNumeralLabel } from './theory';

// Base key dimensions; also the reference for scaling every other
// dimension proportionally as key width changes.
const BASE_WHITE_W = 40;
const BASE_WHITE_H = 180;
const BASE_BLACK_W = 24;
const BASE_BLACK_H = 110;
const BASE_LABEL_AREA_H = 40;
const MIN_SAFE_WHITE_W = 2; // technical floor only, to avoid zero/negative sizes

export const MIN_MIDI = 21; // A0
export const MAX_MIDI = 108; // C8
export const TOTAL_KEYS = MAX_MIDI - MIN_MIDI + 1; // 88

export interface KeyDimensions {
  whiteW: number;
  whiteH: number;
  blackW: number;
  blackH: number;
  labelAreaH: number;
}

// All 88 keys always exist; this is a zoom level, not a note-range filter.
// It picks the visibleKeyCount-key window centered on centerMidi (clipped to
// stay within [MIN_MIDI, MAX_MIDI]), counts how many of those specific keys
// are white, and sizes white keys so that window exactly fills
// availableWidth - i.e. resizing the window or changing the count keeps
// exactly that many keys on screen, with the rest reachable by scrolling.
export function computeKeyDimensions(visibleKeyCount: number, availableWidth: number, centerMidi = 60): KeyDimensions {
  const count = Math.min(Math.max(Math.round(visibleKeyCount), 1), TOTAL_KEYS);
  let start = centerMidi - Math.floor(count / 2);
  let end = start + count - 1;
  if (start < MIN_MIDI) {
    start = MIN_MIDI;
    end = start + count - 1;
  }
  if (end > MAX_MIDI) {
    end = MAX_MIDI;
    start = end - count + 1;
  }

  let whiteCount = 0;
  for (let m = start; m <= end; m++) {
    if (!isBlackPitch(m)) whiteCount++;
  }
  const whiteW = Math.max(availableWidth / (whiteCount > 0 ? whiteCount : count), MIN_SAFE_WHITE_W);
  const scale = whiteW / BASE_WHITE_W;
  return {
    whiteW,
    whiteH: BASE_WHITE_H * scale,
    blackW: BASE_BLACK_W * scale,
    blackH: BASE_BLACK_H * scale,
    labelAreaH: BASE_LABEL_AREA_H * scale,
  };
}

export interface PianoKey {
  midi: number;
  isBlack: boolean;
  x: number;
  width: number;
  height: number;
}

function buildKeys(minMidi: number, maxMidi: number, dims: KeyDimensions): { keys: PianoKey[]; totalWhiteWidth: number } {
  const whiteX: Record<number, number> = {};
  let whiteIndex = 0;
  for (let m = minMidi; m <= maxMidi; m++) {
    if (!isBlackPitch(m)) {
      whiteX[m] = whiteIndex * dims.whiteW;
      whiteIndex++;
    }
  }
  const totalWhiteWidth = whiteIndex * dims.whiteW;

  const keys: PianoKey[] = [];
  for (let m = minMidi; m <= maxMidi; m++) {
    if (!isBlackPitch(m)) {
      keys.push({ midi: m, isBlack: false, x: whiteX[m], width: dims.whiteW, height: dims.whiteH });
    } else {
      const nextWhite = whiteX[m + 1];
      const prevWhite = whiteX[m - 1];
      const boundary = nextWhite !== undefined ? nextWhite : prevWhite + dims.whiteW;
      keys.push({ midi: m, isBlack: true, x: boundary - dims.blackW / 2, width: dims.blackW, height: dims.blackH });
    }
  }
  return { keys, totalWhiteWidth };
}

export interface Piano {
  keys: PianoKey[];
  rectByMidi: Map<number, SVGRectElement>;
  labelGroup: SVGGElement;
  keyGroup: SVGGElement;
  dims: KeyDimensions;
}

// Builds the piano SVG (white/black key rects + octave labels) inside the
// given <svg> element and returns handles needed to render note state.
// Replaces any previous contents of svg, so it's safe to call again (with a
// different range/dims) to rebuild the piano in place.
export function createPiano(svg: SVGSVGElement, minMidi: number, maxMidi: number, dims: KeyDimensions): Piano {
  const { keys, totalWhiteWidth } = buildKeys(minMidi, maxMidi, dims);
  const svgWidth = totalWhiteWidth;
  const svgHeight = dims.labelAreaH + dims.whiteH;

  svg.innerHTML = '';
  svg.setAttribute('width', String(svgWidth));
  svg.setAttribute('height', String(svgHeight));
  svg.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);

  const rectByMidi = new Map<number, SVGRectElement>();
  const labelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const keyGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const octaveGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');

  function makeRect(key: PianoKey): SVGRectElement {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(key.x));
    rect.setAttribute('y', String(dims.labelAreaH));
    rect.setAttribute('width', String(key.width));
    rect.setAttribute('height', String(key.height));
    rect.setAttribute('class', key.isBlack ? 'black-key' : 'white-key');
    rect.dataset.midi = String(key.midi);
    return rect;
  }

  // white keys first so black keys render on top
  keys.filter(k => !k.isBlack).forEach(key => {
    const rect = makeRect(key);
    keyGroup.appendChild(rect);
    rectByMidi.set(key.midi, rect);

    if (key.midi % 12 === 0) {
      // C key: label octave
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(key.x + key.width / 2));
      text.setAttribute('y', String(dims.labelAreaH + dims.whiteH - 8));
      text.setAttribute('class', 'octave-label');
      text.textContent = 'C' + octaveOf(key.midi);
      octaveGroup.appendChild(text);
    }
  });
  keys.filter(k => k.isBlack).forEach(key => {
    const rect = makeRect(key);
    keyGroup.appendChild(rect);
    rectByMidi.set(key.midi, rect);
  });

  svg.appendChild(keyGroup);
  svg.appendChild(octaveGroup);
  svg.appendChild(labelGroup);

  return { keys, rectByMidi, labelGroup, keyGroup, dims };
}

// Tracks whether the mouse button is currently down, globally. Call once;
// share the returned getter across any number of attachPianoMouseInput
// calls (e.g. across piano rebuilds) instead of re-registering document
// listeners each time.
export function trackMouseIsDown(): () => boolean {
  let mouseDown = false;
  document.addEventListener('mousedown', () => (mouseDown = true));
  document.addEventListener('mouseup', () => (mouseDown = false));
  return () => mouseDown;
}

// Registers mouse/touch interaction on the piano so it can be played
// without hardware. onMidi(midi, isOn) is called for both directions.
export function attachPianoMouseInput(piano: Piano, isMouseDown: () => boolean, onMidi: (midi: number, isOn: boolean) => void): void {
  const keyGroup = piano.keyGroup;

  function midiFromEvent(e: Event): number | undefined {
    const target = e.target as (HTMLElement | SVGElement) & { dataset?: DOMStringMap };
    const midi = target?.dataset?.midi;
    return midi !== undefined ? Number(midi) : undefined;
  }

  keyGroup.addEventListener('mousedown', e => {
    const midi = midiFromEvent(e);
    if (midi !== undefined) onMidi(midi, true);
  });
  keyGroup.addEventListener('mouseup', e => {
    const midi = midiFromEvent(e);
    if (midi !== undefined) onMidi(midi, false);
  });
  keyGroup.addEventListener('mouseleave', e => {
    const midi = midiFromEvent(e);
    if (midi !== undefined) onMidi(midi, false);
  }, true);
  keyGroup.addEventListener('mouseenter', e => {
    if (isMouseDown()) {
      const midi = midiFromEvent(e);
      if (midi !== undefined) onMidi(midi, true);
    }
  }, true);
}

// Centers the piano roughly on middle C within its scrollable container.
export function centerOnMiddleC(container: HTMLElement, piano: Piano): void {
  const middleCRect = piano.rectByMidi.get(60);
  const middleCX = middleCRect ? Number(middleCRect.getAttribute('x')) : 0;
  container.scrollLeft = Math.max(0, middleCX - container.clientWidth / 2);
}

// Highlights the active keys and floats a note-name label above each one.
// highlightedNotes marks keys lit up by the Highlighter (scale/chord study
// aid), independent of - and combinable with - the "currently pressed"
// active state.
export function renderKeyboard(
  piano: Piano,
  activeNotes: Set<number>,
  noteNames: string[],
  highlightedNotes: Set<number> = new Set()
): void {
  piano.rectByMidi.forEach((rect, midi) => {
    const base = rect.classList.contains('black-key') ? 'black-key' : 'white-key';
    let cls = base;
    if (activeNotes.has(midi)) cls += ' active';
    if (highlightedNotes.has(midi)) cls += ' highlighted';
    rect.setAttribute('class', cls);
  });

  while (piano.labelGroup.firstChild) piano.labelGroup.removeChild(piano.labelGroup.firstChild);
  activeNotes.forEach(midi => {
    const key = piano.keys.find(k => k.midi === midi);
    if (!key) return;
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(key.x + key.width / 2));
    text.setAttribute('y', String(piano.dims.labelAreaH - 12));
    text.setAttribute('class', 'note-label');
    text.textContent = noteNames[midi % 12];
    piano.labelGroup.appendChild(text);
  });
}

// Renders the note/interval/chord name above the keyboard.
export function renderChordDisplay(
  el: HTMLElement,
  activeMidiSorted: number[],
  pitchClasses: number[],
  chordFormulas: ChordFormula[],
  noteNames: string[],
  tonicPc: number,
  mode: Mode
): void {
  el.innerHTML = '';

  if (activeMidiSorted.length === 0) {
    el.innerHTML = '<span class="placeholder">Play some notes&hellip;</span>';
    return;
  }
  if (activeMidiSorted.length === 1) {
    const main = document.createElement('div');
    main.className = 'chord-main';
    main.textContent = noteNames[activeMidiSorted[0] % 12];
    el.appendChild(main);
    return;
  }
  if (activeMidiSorted.length === 2) {
    const distance = activeMidiSorted[1] - activeMidiSorted[0];
    const main = document.createElement('div');
    main.className = 'chord-main';
    main.textContent = INTERVAL_NAMES[distance % 12];
    el.appendChild(main);

    const alt = document.createElement('div');
    alt.className = 'chord-alt';
    alt.textContent = noteNames[activeMidiSorted[0] % 12] + '  →  ' + noteNames[activeMidiSorted[1] % 12];
    el.appendChild(alt);
    return;
  }

  const bassPc = activeMidiSorted[0] % 12;
  const matches = detectChords(pitchClasses, chordFormulas);
  const primary = matches.find(m => m.root === bassPc) || matches[0];

  const main = document.createElement('div');
  main.className = 'chord-main';
  if (primary) {
    let text = chordLabel(primary, noteNames);
    if (primary.root !== bassPc) {
      text += '/' + noteNames[bassPc];
    }
    main.textContent = text;
  } else {
    main.textContent = noteNames[bassPc] + ' n.c.';
  }
  el.appendChild(main);

  if (primary) {
    const roman = document.createElement('div');
    roman.className = 'chord-roman';
    roman.textContent = romanNumeralLabel(primary, tonicPc, mode);
    el.appendChild(roman);
  }

  const others = matches.filter(m => m !== primary);
  if (others.length > 0) {
    const alt = document.createElement('div');
    alt.className = 'chord-alt';
    alt.textContent = others.map(m => chordLabel(m, noteNames)).join('  /  ');
    el.appendChild(alt);
  }
}

export interface ChordTableCallbacks {
  onSymbolChange: (index: number, symbol: string) => void;
  onIntervalsChange: (index: number, text: string) => string; // returns normalized text to redisplay
  onDelete: (index: number) => void;
}

// Renders the editable chord-formula table in the settings popup.
export function renderChordTable(tbody: HTMLElement, chordFormulas: ChordFormula[], callbacks: ChordTableCallbacks): void {
  tbody.innerHTML = '';
  chordFormulas.forEach((formula, index) => {
    const row = document.createElement('tr');

    const symbolCell = document.createElement('td');
    const symbolInput = document.createElement('input');
    symbolInput.type = 'text';
    symbolInput.value = formula.symbol;
    symbolInput.addEventListener('change', () => {
      callbacks.onSymbolChange(index, symbolInput.value);
    });
    symbolCell.appendChild(symbolInput);

    const intervalsCell = document.createElement('td');
    const intervalsInput = document.createElement('input');
    intervalsInput.type = 'text';
    intervalsInput.value = formula.intervals.join(',');
    intervalsInput.addEventListener('change', () => {
      intervalsInput.value = callbacks.onIntervalsChange(index, intervalsInput.value);
    });
    intervalsCell.appendChild(intervalsInput);

    const deleteCell = document.createElement('td');
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'chord-delete-btn';
    deleteBtn.textContent = '✕';
    deleteBtn.setAttribute('aria-label', 'Delete chord');
    deleteBtn.addEventListener('click', () => callbacks.onDelete(index));
    deleteCell.appendChild(deleteBtn);

    row.appendChild(symbolCell);
    row.appendChild(intervalsCell);
    row.appendChild(deleteCell);
    tbody.appendChild(row);
  });
}

export function setSettingsOpen(panel: HTMLElement, button: HTMLElement, open: boolean): void {
  panel.hidden = !open;
  button.setAttribute('aria-expanded', String(open));
}

// Triggers a browser "save file" for arbitrary JSON-serializable data.
export function downloadJSON(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function setErrorMessage(el: HTMLElement, message: string | null): void {
  el.textContent = message || '';
  el.hidden = !message;
}

// ---- Theme (named color sets) ----

export interface Theme {
  background: string;
  font: string;
  whiteKey: string;
  blackKey: string;
  activeKey: string;
  highlight: string;
}

export interface NamedTheme extends Theme {
  name: string;
}

const THEME_KEYS: (keyof Theme)[] = ['background', 'font', 'whiteKey', 'blackKey', 'activeKey', 'highlight'];

// The themes users can pick from without turning on Debug. Debug mode adds
// the ability to edit these (and any custom themes) in place.
export const BUILT_IN_THEMES: NamedTheme[] = [
  {
    name: 'Light',
    background: '#ffffff',
    font: '#222222',
    whiteKey: '#ffffff',
    blackKey: '#222222',
    activeKey: '#4a76c4',
    highlight: '#ffd54f',
  },
  {
    name: 'Dark',
    background: '#1e1e1e',
    font: '#e8e8e8',
    whiteKey: '#2b2b2b',
    blackKey: '#0d0d0d',
    activeKey: '#6c9bf0',
    highlight: '#ffb300',
  },
];

export const DEFAULT_THEME: Theme = BUILT_IN_THEMES[0];

// Applies the theme by setting CSS custom properties on the root element;
// index.html's stylesheet reads these to color the page and keyboard.
export function applyTheme(theme: Theme): void {
  const root = document.documentElement.style;
  root.setProperty('--bg-color', theme.background);
  root.setProperty('--font-color', theme.font);
  root.setProperty('--white-key-color', theme.whiteKey);
  root.setProperty('--black-key-color', theme.blackKey);
  root.setProperty('--active-key-color', theme.activeKey);
  root.setProperty('--highlight-color', theme.highlight);
}

// Validates and normalizes arbitrary parsed JSON (from a cookie or an
// imported file) into a single named theme. Returns null if the shape
// isn't a named theme at all.
export function parseNamedTheme(raw: unknown): NamedTheme | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const t = raw as Record<string, unknown>;
  if (typeof t.name !== 'string' || !t.name.trim()) return null;
  const theme = { name: t.name.trim() } as NamedTheme;
  for (const key of THEME_KEYS) {
    if (typeof t[key] !== 'string') return null;
    theme[key] = t[key] as string;
  }
  return theme;
}

// Validates and normalizes arbitrary parsed JSON into a list of named
// themes (e.g. from the themes cookie). Returns null if any entry isn't a
// named theme, or the list is empty.
export function parseNamedThemes(raw: unknown): NamedTheme[] | null {
  if (!Array.isArray(raw)) return null;
  const result: NamedTheme[] = [];
  for (const item of raw) {
    const theme = parseNamedTheme(item);
    if (!theme) return null;
    result.push(theme);
  }
  return result.length ? result : null;
}

// ---- Font family selection ----

export interface FontOption {
  id: string;
  label: string;
  family: string;
}

// 'Real Book' approximates the handwritten/lead-sheet style of the jazz
// fakebook; loaded from Google Fonts via a <link> in index.html.
export const FONT_OPTIONS: FontOption[] = [
  { id: 'sans', label: 'Sans-serif', family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif' },
  { id: 'serif', label: 'Serif', family: 'Georgia, "Times New Roman", serif' },
  { id: 'mono', label: 'Monospace', family: '"SFMono-Regular", Menlo, Consolas, monospace' },
  { id: 'real-book', label: 'Real Book', family: "'Reenie Beanie', cursive" },
];

export const DEFAULT_FONT_ID = FONT_OPTIONS[0].id;

export function applyFont(fontId: string): void {
  const option = FONT_OPTIONS.find(f => f.id === fontId) ?? FONT_OPTIONS[0];
  document.documentElement.style.setProperty('--font-family', option.family);
}
