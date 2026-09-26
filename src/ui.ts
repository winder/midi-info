// SVG generation and DOM rendering. Functions here take data in and update
// the DOM; they don't own application state (see app.ts for that).

import { ChordFormula, INTERVAL_NAMES, Mode, chordLabel, detectChords, isBlackPitch, octaveOf, romanNumeralLabel } from './theory';
import { formatTime } from './player';

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
  // Roman numeral hints, in the strip below the keys (hintAreaH tall, 0
  // when the piano was built without one). See renderRomanHints.
  hintGroup: SVGGElement;
  hintAreaH: number;
  keyGroup: SVGGElement;
  // Glow-effect layers, populated per active note by renderKeyboard (see
  // there for why they're separate elements rather than a filter on the
  // key rects themselves). whiteGlowGroup paints above every white key but
  // below every black key, so a white key's glow spreads evenly onto its
  // white neighbors and is cleanly covered by any black key over it.
  // blackGlowGroup paints above everything, so a black key's glow is even
  // on all sides.
  whiteGlowGroup: SVGGElement;
  blackGlowGroup: SVGGElement;
  dims: KeyDimensions;
}

// Builds the <linearGradient> defs the gradient theme effect draws on
// (see index.html's `.gradient-enabled` rules). Every gradient uses
// userSpaceOnUse coordinates spanning x=0..totalWidth - i.e. the full
// keyboard - so a key's fill varies by its position on the keyboard as a
// whole, not by its own position within a single key's width. Stop colors
// reference the theme's CSS custom properties directly so the gradient
// tracks live theme edits without rebuilding the SVG. Text is deliberately
// not gradiented - it sits on top of the gradient and stays crisp.
function buildGradientDefs(totalWidth: number): SVGDefsElement {
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs') as SVGDefsElement;

  function addStop(gradient: SVGElement, offset: string, color: string): void {
    const stop = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop.setAttribute('offset', offset);
    stop.setAttribute('style', `stop-color:${color}`);
    gradient.appendChild(stop);
  }

  function makeGradient(id: string, startColor: string, endColor: string): void {
    const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    gradient.setAttribute('id', id);
    gradient.setAttribute('gradientUnits', 'userSpaceOnUse');
    gradient.setAttribute('x1', '0');
    gradient.setAttribute('y1', '0');
    gradient.setAttribute('x2', String(totalWidth));
    gradient.setAttribute('y2', '0');
    addStop(gradient, '0', startColor);
    addStop(gradient, '1', endColor);
    defs.appendChild(gradient);
  }

  makeGradient('whiteKeyGradient', 'var(--white-key-color)', 'var(--white-key-color-2)');
  makeGradient('blackKeyGradient', 'var(--black-key-color)', 'var(--black-key-color-2)');
  makeGradient('activeKeyGradient', 'var(--active-key-color)', 'var(--active-key-color-2)');
  makeGradient('highlightGradientWhite', 'var(--highlight-color)', 'var(--highlight-color-2)');
  makeGradient(
    'highlightGradientBlack',
    'color-mix(in srgb, var(--highlight-color) 55%, black)',
    'color-mix(in srgb, var(--highlight-color-2) 55%, black)'
  );
  return defs;
}

// Builds the piano SVG (white/black key rects + octave labels) inside the
// given <svg> element and returns handles needed to render note state.
// Replaces any previous contents of svg, so it's safe to call again (with a
// different range/dims) to rebuild the piano in place. showRomanHints adds
// a strip below the keys for renderRomanHints to fill.
export function createPiano(
  svg: SVGSVGElement, minMidi: number, maxMidi: number, dims: KeyDimensions, showOctaveLabels = true,
  showRomanHints = false
): Piano {
  const { keys, totalWhiteWidth } = buildKeys(minMidi, maxMidi, dims);
  const hintAreaH = showRomanHints ? romanHintAreaHeight(dims) : 0;
  const svgWidth = totalWhiteWidth;
  const svgHeight = dims.labelAreaH + dims.whiteH + hintAreaH;

  svg.innerHTML = '';
  svg.setAttribute('width', String(svgWidth));
  svg.setAttribute('height', String(svgHeight));
  svg.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
  svg.appendChild(buildGradientDefs(totalWhiteWidth));

  const rectByMidi = new Map<number, SVGRectElement>();
  const labelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const keyGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const octaveGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const hintGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');

  // Four sub-groups under keyGroup, in paint order: white key bodies, then
  // the white-glow layer (on top of all white keys), then black key
  // bodies (on top of that, so they cover any white glow under them),
  // then the black-glow layer (on top of everything). keyGroup itself
  // stays the shared ancestor attachPianoMouseInput listens on.
  const whiteKeyGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const whiteGlowGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const blackKeyGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const blackGlowGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  keyGroup.append(whiteKeyGroup, whiteGlowGroup, blackKeyGroup, blackGlowGroup);

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
    whiteKeyGroup.appendChild(rect);
    rectByMidi.set(key.midi, rect);

    if (showOctaveLabels && key.midi % 12 === 0) {
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
    blackKeyGroup.appendChild(rect);
    rectByMidi.set(key.midi, rect);
  });

  svg.appendChild(keyGroup);
  svg.appendChild(octaveGroup);
  svg.appendChild(labelGroup);
  svg.appendChild(hintGroup);

  return { keys, rectByMidi, labelGroup, hintGroup, hintAreaH, keyGroup, whiteGlowGroup, blackGlowGroup, dims };
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

const OFFSCREEN_INDICATOR_H = 20; // keep in sync with .offscreen-indicator's font-size in index.html

// Gap in px between a note label's baseline and the top of the keys: just
// enough that the letters almost touch the key they name.
const NOTE_LABEL_GAP = 2;

function noteLabelBaseline(piano: Piano): number {
  return piano.dims.labelAreaH - NOTE_LABEL_GAP;
}

// The Roman numeral hints mirror the note label: same x, same font, but
// hanging just below the keys instead of sitting just above them. Black-key
// hints take the upper row and white-key hints sit ROMAN_HINT_ROW_OFFSET (in
// em of the hint font) lower, echoing the keys themselves, where the black
// keys stop short above the white ones. The stagger also keeps adjacent
// white/black hints from colliding.
const ROMAN_HINT_GAP = 3;
const ROMAN_HINT_ROW_OFFSET = 0.75;

// Tall enough for the lower (white-key) row of hints at the current note font size.
// Read once per piano build; the container's bottom padding absorbs a
// font-size change made afterwards.
function romanHintAreaHeight(dims: KeyDimensions): number {
  const fontPx = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--font-size-note')) || 15;
  return Math.max(dims.labelAreaH, ROMAN_HINT_GAP + fontPx * (1.1 + ROMAN_HINT_ROW_OFFSET));
}

// Labels every key whose pitch class has a hint (see diatonicRomanNumerals)
// in the piano's hint strip. hints is indexed by pitch class; pass [] to
// clear. Does nothing on a piano built without the strip.
export function renderRomanHints(piano: Piano, hints: (string | null)[]): void {
  while (piano.hintGroup.firstChild) piano.hintGroup.removeChild(piano.hintGroup.firstChild);
  if (piano.hintAreaH === 0) return;
  const top = piano.dims.labelAreaH + piano.dims.whiteH + ROMAN_HINT_GAP;
  piano.keys.forEach(key => {
    const hint = hints[key.midi % 12];
    if (!hint) return;
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(key.x + key.width / 2));
    text.setAttribute('y', String(top));
    if (!key.isBlack) text.setAttribute('dy', `${ROMAN_HINT_ROW_OFFSET}em`);
    text.setAttribute('class', key.isBlack ? 'roman-hint black' : 'roman-hint');
    text.textContent = hint;
    piano.hintGroup.appendChild(text);
  });
}

// All 88 keys always exist in the SVG, but visibleKeys zoom and manual
// scrolling can put an active key outside container's current scroll
// viewport. Shows a small arrow at the edge whose direction that key is
// scrolled off in, so a played note that isn't on screen isn't just silent.
// Only shown while that off-screen note is actually active - it's an
// indicator for a note sounding right now, not a static "more keys over
// here" hint. Positioned just above where the note-label text sits (see
// renderKeyboard), scaled off piano.dims.labelAreaH the same way that text
// is, so it stays clear of both the keys and any on-screen note label.
export function updateOffscreenIndicators(
  container: HTMLElement,
  piano: Piano,
  activeNotes: Set<number>,
  leftEl: HTMLElement,
  rightEl: HTMLElement
): void {
  const viewLeft = container.scrollLeft;
  const viewRight = viewLeft + container.clientWidth;
  let offLeft = false;
  let offRight = false;
  activeNotes.forEach(midi => {
    const key = piano.keys.find(k => k.midi === midi);
    if (!key) return;
    if (key.x + key.width <= viewLeft) offLeft = true;
    else if (key.x >= viewRight) offRight = true;
  });
  leftEl.hidden = !offLeft;
  rightEl.hidden = !offRight;

  const top = Math.max(noteLabelBaseline(piano) - 16 - OFFSCREEN_INDICATOR_H, 2);
  leftEl.style.top = `${top}px`;
  rightEl.style.top = `${top}px`;
}

// autoNotes are keys sounding as part of an auto-played chord (a pressed
// key voicing the highlighter's chord) without being pressed themselves.
// They are drawn like active keys, but in the highlight color.
//
// Highlights the active keys and, when showNoteLabels is true, floats a
// note-name label above each one. highlightedNotes marks keys lit up by
// the Highlighter (scale/chord study aid), independent of - and
// combinable with - the "currently pressed"
// active state.
export function renderKeyboard(
  piano: Piano,
  activeNotes: Set<number>,
  noteNames: string[],
  highlightedNotes: Set<number> = new Set(),
  showNoteLabels = true,
  autoNotes: Set<number> = new Set()
): void {
  function stateClasses(midi: number): string {
    if (activeNotes.has(midi)) return highlightedNotes.has(midi) ? ' active highlighted' : ' active';
    if (autoNotes.has(midi)) return ' auto';
    return highlightedNotes.has(midi) ? ' highlighted' : '';
  }
  const sounding = new Set([...activeNotes, ...autoNotes]);

  piano.rectByMidi.forEach((rect, midi) => {
    const base = rect.classList.contains('black-key') ? 'black-key' : 'white-key';
    rect.setAttribute('class', base + stateClasses(midi));
  });

  while (piano.labelGroup.firstChild) piano.labelGroup.removeChild(piano.labelGroup.firstChild);
  if (showNoteLabels) {
    sounding.forEach(midi => {
      const key = piano.keys.find(k => k.midi === midi);
      if (!key) return;
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(key.x + key.width / 2));
      text.setAttribute('y', String(noteLabelBaseline(piano)));
      text.setAttribute('class', 'note-label');
      text.textContent = noteNames[midi % 12];
      piano.labelGroup.appendChild(text);
    });
  }

  // Glow effect: a rect per active key, in a dedicated layer above (white)
  // or above-everything (black) so its blur spreads evenly instead of
  // getting clipped by a neighboring key's own paint order (see the
  // Piano.whiteGlowGroup/blackGlowGroup doc comment). It carries the same
  // classes as the real key rect so it picks up the exact same fill (flat
  // or gradient); index.html only adds a drop-shadow filter on top of that
  // when glow is enabled, and otherwise these are inert, identical-looking
  // duplicates. Skipped entirely when glow is off, to avoid the extra
  // paint for no visual effect.
  while (piano.whiteGlowGroup.firstChild) piano.whiteGlowGroup.removeChild(piano.whiteGlowGroup.firstChild);
  while (piano.blackGlowGroup.firstChild) piano.blackGlowGroup.removeChild(piano.blackGlowGroup.firstChild);
  if (document.documentElement.classList.contains('glow-enabled')) {
    sounding.forEach(midi => {
      const key = piano.keys.find(k => k.midi === midi);
      if (!key) return;
      const glow = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      glow.setAttribute('x', String(key.x));
      glow.setAttribute('y', String(piano.dims.labelAreaH));
      glow.setAttribute('width', String(key.width));
      glow.setAttribute('height', String(key.height));
      glow.setAttribute('class', (key.isBlack ? 'black-key' : 'white-key') + stateClasses(midi) + ' key-glow');
      (key.isBlack ? piano.blackGlowGroup : piano.whiteGlowGroup).appendChild(glow);
    });
  }
}

// Renders the note/interval/chord name above the keyboard.
//
// The roman-numeral and alternates line slots, when enabled via
// showSecondaryLine/showTertiaryLine, sit at a fixed height set in CSS and
// are merely left empty when unused (e.g. showRomanNumerals off, or no
// chord matched). That keeps the display's geometry identical across every
// state so neither the chord name nor the keyboard below moves as lines
// come and go. Disabling a line via its show* flag removes it from the DOM
// entirely, which does change the display's height - that's the point of
// the setting.
export function renderChordDisplay(
  el: HTMLElement,
  activeMidiSorted: number[],
  pitchClasses: number[],
  chordFormulas: ChordFormula[],
  noteNames: string[],
  tonicPc: number,
  mode: Mode,
  hasPlayedNote: boolean,
  showSecondaryLine: boolean,
  showTertiaryLine: boolean,
  showRomanNumerals: boolean,
  showNoChord: boolean
): void {
  el.innerHTML = '';
  const main = document.createElement('div');
  main.className = 'chord-main';
  const roman = document.createElement('div');
  roman.className = 'chord-roman';
  const alt = document.createElement('div');
  alt.className = 'chord-alt';
  el.appendChild(main);
  if (showSecondaryLine) el.appendChild(roman);
  if (showTertiaryLine) el.appendChild(alt);

  if (activeMidiSorted.length === 0) {
    // Once the player has pressed at least one key, releasing back to
    // silence leaves the display blank rather than bringing the
    // "Play some notes…" placeholder back.
    if (!hasPlayedNote) {
      const placeholder = document.createElement('span');
      placeholder.className = 'placeholder';
      placeholder.textContent = 'Play some notes…';
      main.appendChild(placeholder);
    }
    return;
  }
  if (pitchClasses.length === 1) {
    main.textContent = noteNames[pitchClasses[0]];
    return;
  }
  if (pitchClasses.length === 2) {
    // pitchClasses[0] is the pitch class of the lowest sounding note (activeMidiSorted
    // is ascending and Set preserves insertion order), so doubled/octaved notes above
    // it don't change which pitch class is the interval's bottom.
    const distance = pitchClasses[1] - pitchClasses[0];
    main.textContent = INTERVAL_NAMES[((distance % 12) + 12) % 12];
    alt.textContent = noteNames[pitchClasses[0]] + '  →  ' + noteNames[pitchClasses[1]];
    return;
  }

  const bassPc = activeMidiSorted[0] % 12;
  const matches = detectChords(pitchClasses, chordFormulas, bassPc);
  const primary = matches.find(m => m.root === bassPc) || matches[0];

  if (primary) {
    let text = chordLabel(primary, noteNames);
    if (primary.root !== bassPc) {
      text += '/' + noteNames[bassPc];
    }
    main.textContent = text;
    if (showRomanNumerals) roman.textContent = romanNumeralLabel(primary, tonicPc, mode);
  } else if (showNoChord) {
    main.textContent = noteNames[bassPc] + ' n.c.';
  }

  const others = matches.filter(m => m !== primary);
  if (others.length > 0) {
    alt.textContent = others.map(m => chordLabel(m, noteNames)).join('  /  ');
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

// ---- MIDI player controls ----

export interface PlayerControls {
  playButton: HTMLButtonElement;
  seek: HTMLInputElement;
  elapsed: HTMLElement;
  duration: HTMLElement;
}

// `duration` null means nothing is loaded: everything reads 0:00, disabled.
export function renderPlayerControls(controls: PlayerControls, playing: boolean, position: number, duration: number | null): void {
  controls.playButton.disabled = duration === null;
  controls.playButton.textContent = playing ? '\u23F8' : '\u25B6';
  controls.playButton.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  controls.seek.disabled = duration === null;
  controls.seek.max = String(duration ?? 0);
  controls.seek.value = String(position);
  controls.elapsed.textContent = formatTime(position);
  controls.duration.textContent = formatTime(duration ?? 0);
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

// ---- Font sizes ----
// Five independently sized areas, each its own CSS custom property so a
// change to one doesn't move the others: the detected chord/interval name,
// the roman numeral, the alternate-match line, the keyboard's floating
// note-name popup, and the keyboard's octave numbers.

export interface FontSizes {
  chord: number;
  secondary: number;
  tertiary: number;
  note: number;
  octave: number;
}

export const DEFAULT_FONT_SIZES: FontSizes = {
  chord: 40,
  secondary: 16,
  tertiary: 15,
  note: 15,
  octave: 10,
};

export function applyFontSizes(sizes: FontSizes): void {
  const root = document.documentElement.style;
  root.setProperty('--font-size-chord', `${sizes.chord}px`);
  root.setProperty('--font-size-secondary', `${sizes.secondary}px`);
  root.setProperty('--font-size-tertiary', `${sizes.tertiary}px`);
  root.setProperty('--font-size-note', `${sizes.note}px`);
  root.setProperty('--font-size-octave', `${sizes.octave}px`);
}

// ---- Theme (named color sets) ----

export interface Theme {
  background: string;
  font: string;
  whiteKey: string;
  blackKey: string;
  activeKey: string;
  highlight: string;
  // Second color for each gradient-able field, used by the gradient
  // effect below. Each is independent so a subtle or "off" gradient is
  // just picking the same color as the base field - no separate
  // per-field toggle needed. Font/text has no *2 field: text is
  // deliberately never gradiented (see index.html), so it stays crisp on
  // top of a gradiented background or key.
  background2: string;
  whiteKey2: string;
  blackKey2: string;
  activeKey2: string;
  highlight2: string;
  // When true, background/whiteKey/blackKey/activeKey/highlight each
  // render as a gradient toward their *2 color instead of flat. For the
  // keys specifically this is one continuous gradient across the whole
  // keyboard's width (see the SVG defs in createPiano), not a per-key
  // gradient repeated on each key.
  gradient: boolean;
  // When true, the currently active key(s) get a soft glow (CSS
  // drop-shadow) in the theme's active-key color.
  glow: boolean;
  // A theme also carries the font family and the five per-area font sizes,
  // so switching themes changes the whole look in one step.
  fontId: string;
  fontSizes: FontSizes;
}

export interface NamedTheme extends Theme {
  name: string;
}

// String-valued color fields; used to populate/compare the color swatches.
const COLOR_KEYS: (keyof Theme)[] = [
  'background', 'font', 'whiteKey', 'blackKey', 'activeKey', 'highlight',
  'background2', 'whiteKey2', 'blackKey2', 'activeKey2', 'highlight2',
];
// Colors that must be present on any parsed theme; the *2 fields are not
// among these since old saved themes won't have them (see parseNamedTheme).
const REQUIRED_COLOR_KEYS: (keyof Theme)[] = ['background', 'font', 'whiteKey', 'blackKey', 'activeKey', 'highlight'];
// The *2 fields, paired with the base field they default to when absent.
const GRADIENT_COLOR_KEYS: [keyof Theme, keyof Theme][] = [
  ['background2', 'background'],
  ['whiteKey2', 'whiteKey'],
  ['blackKey2', 'blackKey'],
  ['activeKey2', 'activeKey'],
  ['highlight2', 'highlight'],
];
// Boolean toggle fields, validated/defaulted separately from the colors.
const BOOLEAN_KEYS: (keyof Theme)[] = ['gradient', 'glow'];
// FontSizes fields, validated/defaulted separately (see parseNamedTheme).
const FONT_SIZE_KEYS: (keyof FontSizes)[] = ['chord', 'secondary', 'tertiary', 'note', 'octave'];

// The themes offered in the picker. The Themes settings tab lets users edit
// these (and any custom themes) in place.
export const BUILT_IN_THEMES: NamedTheme[] = [
  {
    name: 'Light',
    background: '#ffffff',
    font: '#222222',
    whiteKey: '#ffffff',
    blackKey: '#222222',
    activeKey: '#4a76c4',
    highlight: '#ffd54f',
    // Each *2 defaults to its own base color, so flipping the gradient
    // toggle on a built-in theme is a visible no-op until the user picks
    // a different second color for something.
    background2: '#ffffff',
    whiteKey2: '#ffffff',
    blackKey2: '#222222',
    activeKey2: '#4a76c4',
    highlight2: '#ffd54f',
    gradient: false,
    glow: false,
    fontId: DEFAULT_FONT_ID,
    fontSizes: { ...DEFAULT_FONT_SIZES },
  },
  {
    name: 'Dark',
    background: '#1e1e1e',
    font: '#e8e8e8',
    whiteKey: '#2b2b2b',
    blackKey: '#0d0d0d',
    activeKey: '#6c9bf0',
    highlight: '#ffb300',
    background2: '#1e1e1e',
    whiteKey2: '#2b2b2b',
    blackKey2: '#0d0d0d',
    activeKey2: '#6c9bf0',
    highlight2: '#ffb300',
    gradient: false,
    glow: false,
    fontId: DEFAULT_FONT_ID,
    fontSizes: { ...DEFAULT_FONT_SIZES },
  },
  {
    name: 'Cotton Candy',
    background: '#a6c8c6',
    font: '#0a0000',
    whiteKey: '#ffffff',
    blackKey: '#222222',
    activeKey: '#eebfa0',
    highlight: '#49b0ca',
    background2: '#a6c8c6',
    whiteKey2: '#ffffff',
    blackKey2: '#222222',
    activeKey2: '#eebfa0',
    highlight2: '#49b0ca',
    gradient: false,
    glow: false,
    fontId: DEFAULT_FONT_ID,
    fontSizes: { ...DEFAULT_FONT_SIZES },
  },
  {
    // Dark/green neon look: near-black keys and background, bright neon
    // green text and active keys, glow on for a lit-LED feel, and gradient
    // on with subtle same-hue-family shifts (not a rainbow) across
    // background/keys/highlight.
    name: 'Neon',
    background: '#060b08',
    font: '#39ff88',
    whiteKey: '#0f1f14',
    blackKey: '#030704',
    activeKey: '#2bffa0',
    highlight: '#c6ff00',
    background2: '#0a1f12',
    whiteKey2: '#163826',
    blackKey2: '#081208',
    activeKey2: '#7dffce',
    highlight2: '#eaff7d',
    gradient: true,
    glow: true,
    fontId: DEFAULT_FONT_ID,
    fontSizes: { ...DEFAULT_FONT_SIZES },
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
  root.setProperty('--bg-color-2', theme.background2);
  root.setProperty('--white-key-color-2', theme.whiteKey2);
  root.setProperty('--black-key-color-2', theme.blackKey2);
  root.setProperty('--active-key-color-2', theme.activeKey2);
  root.setProperty('--highlight-color-2', theme.highlight2);
  document.documentElement.classList.toggle('gradient-enabled', theme.gradient);
  document.documentElement.classList.toggle('glow-enabled', theme.glow);
  applyFont(theme.fontId);
  applyFontSizes(theme.fontSizes);
}

// True if two themes have identical colors, effect toggles, font family and
// font sizes (name is ignored).
export function themeEqual(a: Theme, b: Theme): boolean {
  return COLOR_KEYS.every(key => a[key] === b[key]) &&
    BOOLEAN_KEYS.every(key => a[key] === b[key]) &&
    a.fontId === b.fontId &&
    FONT_SIZE_KEYS.every(key => a.fontSizes[key] === b.fontSizes[key]);
}

// Validates and normalizes arbitrary parsed JSON (from a cookie or an
// imported file) into a single named theme. Returns null if the shape
// isn't a named theme at all.
//
// The *2 gradient colors, gradient/glow and the font fields are all
// optional on the input and default to a copy of their base color / false /
// the app defaults when absent, so a themes cookie or export saved before
// one of these features existed still parses instead of getting wiped back
// to the built-in defaults (see loadThemes in app.ts).
export function parseNamedTheme(raw: unknown): NamedTheme | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const t = raw as Record<string, unknown>;
  if (typeof t.name !== 'string' || !t.name.trim()) return null;
  const theme = { name: t.name.trim() } as NamedTheme;
  const dest = theme as unknown as Record<string, unknown>;
  for (const key of REQUIRED_COLOR_KEYS) {
    if (typeof t[key] !== 'string') return null;
    dest[key] = t[key];
  }
  for (const [key, fallbackKey] of GRADIENT_COLOR_KEYS) {
    dest[key] = typeof t[key] === 'string' ? t[key] : dest[fallbackKey];
  }
  for (const key of BOOLEAN_KEYS) {
    dest[key] = typeof t[key] === 'boolean' ? t[key] : false;
  }
  theme.fontId = typeof t.fontId === 'string' && FONT_OPTIONS.some(f => f.id === t.fontId)
    ? t.fontId : DEFAULT_FONT_ID;
  const rawSizes = typeof t.fontSizes === 'object' && t.fontSizes !== null
    ? t.fontSizes as Record<string, unknown> : {};
  const sizes = {} as Record<string, number>;
  for (const key of FONT_SIZE_KEYS) {
    const n = rawSizes[key];
    sizes[key] = typeof n === 'number' && n > 0 ? n : DEFAULT_FONT_SIZES[key];
  }
  theme.fontSizes = sizes as unknown as FontSizes;
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

