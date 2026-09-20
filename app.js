"use strict";
(() => {
  // src/midi.ts
  var SUSTAIN_PEDAL_CONTROLLER = 64;
  function handleMIDIMessage(callbacks, event) {
    const data = event.data;
    if (!data) return;
    const [status, data1, data2] = data;
    const command = status & 240;
    if (command === 144 && data2 > 0) {
      callbacks.onNoteOn(data1);
    } else if (command === 128 || command === 144 && data2 === 0) {
      callbacks.onNoteOff(data1);
    } else if (command === 176 && data1 === SUSTAIN_PEDAL_CONTROLLER) {
      callbacks.onSustainChange(data2 >= 64);
    }
  }
  function initMIDI(callbacks) {
    if (!navigator.requestMIDIAccess) {
      callbacks.onStatusChange("Web MIDI API not supported in this browser. Try a different browser.", "error");
      return;
    }
    const attachedInputs = /* @__PURE__ */ new Set();
    function attachInput(input) {
      if (attachedInputs.has(input.id)) return;
      input.onmidimessage = (event) => handleMIDIMessage(callbacks, event);
      attachedInputs.add(input.id);
    }
    function refreshInputList(access) {
      const inputs = [];
      access.inputs.forEach((input) => inputs.push(input));
      if (inputs.length === 0) {
        callbacks.onStatusChange("No MIDI devices found. Connect a device.", "");
        callbacks.onInputsChange([]);
        return;
      }
      inputs.forEach(attachInput);
      callbacks.onInputsChange(inputs.map((input) => input.name || input.id));
      callbacks.onStatusChange(`Connected: listening to ${inputs.length} device(s)`, "connected");
    }
    navigator.requestMIDIAccess().then((access) => {
      refreshInputList(access);
      access.onstatechange = () => refreshInputList(access);
    }).catch((err) => {
      callbacks.onStatusChange("MIDI access denied or unavailable: " + err.message, "error");
    });
  }

  // src/theory.ts
  var SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  var LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
  var NATURAL_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var LEVEL_ORDER = ["basic", "intermediate", "nerd"];
  function levelAtLeast(current, min) {
    return LEVEL_ORDER.indexOf(current) >= LEVEL_ORDER.indexOf(min);
  }
  var MODES = [
    { name: "Ionian", steps: [0, 2, 4, 5, 7, 9, 11] },
    { name: "Dorian", steps: [0, 2, 3, 5, 7, 9, 10] },
    { name: "Phrygian", steps: [0, 1, 3, 5, 7, 8, 10] },
    { name: "Lydian", steps: [0, 2, 4, 6, 7, 9, 11] },
    { name: "Mixolydian", steps: [0, 2, 4, 5, 7, 9, 10] },
    { name: "Aeolian", steps: [0, 2, 3, 5, 7, 8, 10] },
    { name: "Locrian", steps: [0, 1, 3, 5, 6, 8, 10] }
  ];
  var KEYS = [
    { name: "C", tonicLetter: "C", tonicAccidental: 0, fallback: SHARP_NAMES },
    { name: "C#", tonicLetter: "C", tonicAccidental: 1, fallback: SHARP_NAMES },
    { name: "Db", tonicLetter: "D", tonicAccidental: -1, fallback: FLAT_NAMES },
    { name: "D", tonicLetter: "D", tonicAccidental: 0, fallback: SHARP_NAMES },
    { name: "D#", tonicLetter: "D", tonicAccidental: 1, fallback: SHARP_NAMES },
    { name: "Eb", tonicLetter: "E", tonicAccidental: -1, fallback: FLAT_NAMES },
    { name: "E", tonicLetter: "E", tonicAccidental: 0, fallback: SHARP_NAMES },
    { name: "F", tonicLetter: "F", tonicAccidental: 0, fallback: FLAT_NAMES },
    { name: "F#", tonicLetter: "F", tonicAccidental: 1, fallback: SHARP_NAMES },
    { name: "Gb", tonicLetter: "G", tonicAccidental: -1, fallback: FLAT_NAMES },
    { name: "G", tonicLetter: "G", tonicAccidental: 0, fallback: SHARP_NAMES },
    { name: "G#", tonicLetter: "G", tonicAccidental: 1, fallback: SHARP_NAMES },
    { name: "Ab", tonicLetter: "A", tonicAccidental: -1, fallback: FLAT_NAMES },
    { name: "A", tonicLetter: "A", tonicAccidental: 0, fallback: SHARP_NAMES },
    { name: "A#", tonicLetter: "A", tonicAccidental: 1, fallback: SHARP_NAMES },
    { name: "Bb", tonicLetter: "B", tonicAccidental: -1, fallback: FLAT_NAMES },
    { name: "B", tonicLetter: "B", tonicAccidental: 0, fallback: SHARP_NAMES }
  ];
  function keyPitchClass(key) {
    return (NATURAL_PC[key.tonicLetter] + key.tonicAccidental + 12) % 12;
  }
  function buildKeyNoteNames(key, mode = MODES[0]) {
    const names = key.fallback.slice();
    const tonicPc = (NATURAL_PC[key.tonicLetter] + key.tonicAccidental + 12) % 12;
    const letterIndex = LETTERS.indexOf(key.tonicLetter);
    mode.steps.forEach((step, degree) => {
      const letter = LETTERS[(letterIndex + degree) % 7];
      const expectedPc = (tonicPc + step) % 12;
      const accidental = ((expectedPc - NATURAL_PC[letter]) % 12 + 12) % 12;
      if (accidental === 0) names[expectedPc] = letter;
      else if (accidental === 1) names[expectedPc] = letter + "#";
      else if (accidental === 11) names[expectedPc] = letter + "b";
    });
    return names;
  }
  var HIGHLIGHT_SCALES = [
    { name: "Major", steps: MODES[0].steps, minLevel: "basic" },
    // Ionian
    { name: "Natural Minor", steps: MODES[5].steps, minLevel: "basic" },
    // Aeolian
    { name: "Dorian", steps: MODES[1].steps, minLevel: "intermediate" },
    { name: "Mixolydian", steps: MODES[4].steps, minLevel: "intermediate" },
    { name: "Lydian", steps: MODES[3].steps, minLevel: "intermediate" },
    { name: "Harmonic Minor", steps: [0, 2, 3, 5, 7, 8, 11], minLevel: "intermediate" },
    { name: "Melodic Minor", steps: [0, 2, 3, 5, 7, 9, 11], minLevel: "intermediate" },
    { name: "Phrygian", steps: MODES[2].steps, minLevel: "nerd" },
    { name: "Locrian", steps: MODES[6].steps, minLevel: "nerd" }
  ];
  function scalePitchClasses(rootPc, scale) {
    return scale.steps.map((step) => (rootPc + step) % 12);
  }
  var BLACK_PITCH_CLASSES = /* @__PURE__ */ new Set([1, 3, 6, 8, 10]);
  function isBlackPitch(midi) {
    return BLACK_PITCH_CLASSES.has(midi % 12);
  }
  function octaveOf(midi) {
    return Math.floor(midi / 12) - 1;
  }
  var BASE_CHORD_FORMULAS = [
    // Major
    { symbol: "", intervals: [0, 4, 7] },
    { symbol: "add2", intervals: [0, 2, 4, 7] },
    { symbol: "6", intervals: [0, 4, 7, 9] },
    { symbol: "\u03947", intervals: [0, 4, 7, 11] },
    { symbol: "\u03947(9)", intervals: [0, 4, 7, 11, 2] },
    { symbol: "\u03947(9, 13)", intervals: [0, 4, 7, 11, 2, 9] },
    { symbol: "\u03947#5", intervals: [0, 4, 8, 11] },
    { symbol: "\u03949#5", intervals: [0, 4, 8, 11, 2] },
    { symbol: "6/9", intervals: [0, 4, 7, 9, 2] },
    { symbol: "6/9#11", intervals: [0, 4, 7, 9, 2, 6] },
    { symbol: "\u03947#11", intervals: [0, 4, 7, 11, 2, 6] },
    { symbol: "\u03947#11#5", intervals: [0, 4, 8, 11, 2, 6] },
    { symbol: "\u03947(13, #11)", intervals: [0, 4, 7, 11, 2, 6, 9] },
    // Minor
    { symbol: "-", intervals: [0, 3, 7] },
    { symbol: "-add2", intervals: [0, 2, 3, 7] },
    { symbol: "-6", intervals: [0, 3, 7, 9] },
    { symbol: "-7", intervals: [0, 3, 7, 10] },
    { symbol: "-\u03947", intervals: [0, 3, 7, 11] },
    { symbol: "-9", intervals: [0, 3, 7, 10, 2] },
    { symbol: "-\u03949", intervals: [0, 3, 7, 11, 2] },
    { symbol: "-6/9", intervals: [0, 3, 7, 9, 2] },
    { symbol: "-6/9(11)", intervals: [0, 3, 7, 9, 2, 5] },
    { symbol: "-\u03947(13)", intervals: [0, 3, 7, 11, 9] },
    { symbol: "-11", intervals: [0, 2, 3, 5, 7, 10] },
    // Diminished
    { symbol: "\xB0", intervals: [0, 3, 6] },
    { symbol: "\xF87", intervals: [0, 3, 6, 10] },
    { symbol: "\xB07", intervals: [0, 3, 6, 9] },
    // Suspended
    { symbol: "sus2", intervals: [0, 2, 7] },
    { symbol: "sus4", intervals: [0, 5, 7] },
    { symbol: "7sus4", intervals: [0, 5, 7, 10] },
    { symbol: "13sus", intervals: [0, 5, 7, 10, 2, 9] },
    // Augmented
    { symbol: "aug", intervals: [0, 4, 8] },
    // Dominant
    { symbol: "7", intervals: [0, 4, 7, 10] },
    { symbol: "9", intervals: [0, 4, 7, 10, 2] },
    { symbol: "9(add11)", intervals: [0, 4, 7, 10, 2, 5] },
    { symbol: "13", intervals: [0, 4, 7, 10, 2, 9] },
    { symbol: "7+5", intervals: [0, 4, 8, 10] },
    { symbol: "7b5", intervals: [0, 4, 6, 10] },
    { symbol: "7b9", intervals: [0, 4, 7, 10, 1] },
    { symbol: "7#9", intervals: [0, 4, 7, 10, 3] },
    { symbol: "7#9#5", intervals: [0, 4, 8, 10, 3] },
    { symbol: "7b9#5", intervals: [0, 4, 8, 10, 1] },
    { symbol: "7#11", intervals: [0, 4, 7, 10, 2, 6] },
    { symbol: "7#11b9", intervals: [0, 4, 7, 10, 1, 6] },
    { symbol: "13b9", intervals: [0, 4, 7, 10, 1, 9] },
    { symbol: "13#11", intervals: [0, 4, 7, 10, 2, 6, 9] }
  ];
  var PERFECT_FIFTH = 7;
  function withoutPerfectFifth(formulas) {
    const variants = [];
    formulas.forEach((f) => {
      if (!f.intervals.includes(PERFECT_FIFTH)) return;
      const intervals = f.intervals.filter((i) => i !== PERFECT_FIFTH);
      if (intervals.length < 3) return;
      variants.push({ symbol: f.symbol, intervals });
    });
    return variants;
  }
  var DEFAULT_CHORD_FORMULAS = [
    ...BASE_CHORD_FORMULAS,
    ...withoutPerfectFifth(BASE_CHORD_FORMULAS)
  ];
  var CHORD_MIN_LEVEL = {
    "": "basic",
    "-": "basic",
    "\xB0": "basic",
    "aug": "basic",
    "sus2": "basic",
    "sus4": "basic",
    "6": "intermediate",
    "-6": "intermediate",
    "\u03947": "intermediate",
    "-7": "intermediate",
    "-\u03947": "intermediate",
    "7": "intermediate",
    "\xB07": "intermediate",
    "\xF87": "intermediate",
    "7sus4": "intermediate"
  };
  var HIGHLIGHT_CHORDS = BASE_CHORD_FORMULAS.map((f) => ({
    symbol: f.symbol,
    intervals: f.intervals,
    minLevel: CHORD_MIN_LEVEL[f.symbol] ?? "nerd"
  }));
  function buildChordVoicing(rootPc, intervals, centerMidi = 60) {
    const remainder = ((centerMidi - rootPc) % 12 + 12) % 12;
    const lower = centerMidi - remainder;
    const upper = lower + 12;
    const rootMidi = centerMidi - lower <= upper - centerMidi ? lower : upper;
    const voicing = [];
    let prev = rootMidi - 12;
    Array.from(new Set(intervals.map((i) => (i % 12 + 12) % 12))).forEach((interval) => {
      let midi = rootMidi + interval;
      while (midi <= prev) midi += 12;
      voicing.push(midi);
      prev = midi;
    });
    return voicing;
  }
  function detectChords(pitchClasses, chordFormulas2) {
    if (pitchClasses.length < 3) return [];
    const pcSet = new Set(pitchClasses);
    const matches = [];
    pitchClasses.forEach((root) => {
      chordFormulas2.forEach((formula) => {
        if (formula.intervals.length !== pitchClasses.length) return;
        const expected = formula.intervals.map((i) => (root + i) % 12);
        if (expected.every((pc) => pcSet.has(pc))) {
          matches.push({ root, formula });
        }
      });
    });
    return matches;
  }
  function chordLabel(match, noteNames) {
    return noteNames[match.root] + match.formula.symbol;
  }
  function parseChordFormulas(raw) {
    if (!Array.isArray(raw)) return null;
    const result = [];
    for (const item of raw) {
      if (typeof item !== "object" || item === null) return null;
      const f = item;
      if (!Array.isArray(f.intervals)) return null;
      result.push({
        symbol: String(f.symbol ?? ""),
        intervals: Array.from(new Set(
          f.intervals.map((n) => (Number(n) % 12 + 12) % 12).filter((n) => !Number.isNaN(n))
        ))
      });
    }
    return result;
  }
  var INTERVAL_NAMES = [
    "Octave",
    // 0
    "Minor 2nd",
    // 1
    "Major 2nd",
    // 2
    "Minor 3rd",
    // 3
    "Major 3rd",
    // 4
    "Perfect 4th",
    // 5
    "Tritone",
    // 6
    "Perfect 5th",
    // 7
    "Minor 6th",
    // 8
    "Major 6th",
    // 9
    "Minor 7th",
    // 10
    "Major 7th"
    // 11
  ];

  // src/ui.ts
  var BASE_WHITE_W = 40;
  var BASE_WHITE_H = 180;
  var BASE_BLACK_W = 24;
  var BASE_BLACK_H = 110;
  var BASE_LABEL_AREA_H = 40;
  var MIN_SAFE_WHITE_W = 2;
  var MIN_MIDI = 21;
  var MAX_MIDI = 108;
  var TOTAL_KEYS = MAX_MIDI - MIN_MIDI + 1;
  function computeKeyDimensions(visibleKeyCount, availableWidth, centerMidi = 60) {
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
      labelAreaH: BASE_LABEL_AREA_H * scale
    };
  }
  function buildKeys(minMidi, maxMidi, dims) {
    const whiteX = {};
    let whiteIndex = 0;
    for (let m = minMidi; m <= maxMidi; m++) {
      if (!isBlackPitch(m)) {
        whiteX[m] = whiteIndex * dims.whiteW;
        whiteIndex++;
      }
    }
    const totalWhiteWidth = whiteIndex * dims.whiteW;
    const keys = [];
    for (let m = minMidi; m <= maxMidi; m++) {
      if (!isBlackPitch(m)) {
        keys.push({ midi: m, isBlack: false, x: whiteX[m], width: dims.whiteW, height: dims.whiteH });
      } else {
        const nextWhite = whiteX[m + 1];
        const prevWhite = whiteX[m - 1];
        const boundary = nextWhite !== void 0 ? nextWhite : prevWhite + dims.whiteW;
        keys.push({ midi: m, isBlack: true, x: boundary - dims.blackW / 2, width: dims.blackW, height: dims.blackH });
      }
    }
    return { keys, totalWhiteWidth };
  }
  function createPiano(svg2, minMidi, maxMidi, dims) {
    const { keys, totalWhiteWidth } = buildKeys(minMidi, maxMidi, dims);
    const svgWidth = totalWhiteWidth;
    const svgHeight = dims.labelAreaH + dims.whiteH;
    svg2.innerHTML = "";
    svg2.setAttribute("width", String(svgWidth));
    svg2.setAttribute("height", String(svgHeight));
    svg2.setAttribute("viewBox", `0 0 ${svgWidth} ${svgHeight}`);
    const rectByMidi = /* @__PURE__ */ new Map();
    const labelGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const keyGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const octaveGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    function makeRect(key) {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", String(key.x));
      rect.setAttribute("y", String(dims.labelAreaH));
      rect.setAttribute("width", String(key.width));
      rect.setAttribute("height", String(key.height));
      rect.setAttribute("class", key.isBlack ? "black-key" : "white-key");
      rect.dataset.midi = String(key.midi);
      return rect;
    }
    keys.filter((k) => !k.isBlack).forEach((key) => {
      const rect = makeRect(key);
      keyGroup.appendChild(rect);
      rectByMidi.set(key.midi, rect);
      if (key.midi % 12 === 0) {
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", String(key.x + key.width / 2));
        text.setAttribute("y", String(dims.labelAreaH + dims.whiteH - 8));
        text.setAttribute("class", "octave-label");
        text.textContent = "C" + octaveOf(key.midi);
        octaveGroup.appendChild(text);
      }
    });
    keys.filter((k) => k.isBlack).forEach((key) => {
      const rect = makeRect(key);
      keyGroup.appendChild(rect);
      rectByMidi.set(key.midi, rect);
    });
    svg2.appendChild(keyGroup);
    svg2.appendChild(octaveGroup);
    svg2.appendChild(labelGroup);
    return { keys, rectByMidi, labelGroup, keyGroup, dims };
  }
  function trackMouseIsDown() {
    let mouseDown = false;
    document.addEventListener("mousedown", () => mouseDown = true);
    document.addEventListener("mouseup", () => mouseDown = false);
    return () => mouseDown;
  }
  function attachPianoMouseInput(piano2, isMouseDown2, onMidi) {
    const keyGroup = piano2.keyGroup;
    function midiFromEvent(e) {
      const target = e.target;
      const midi = target?.dataset?.midi;
      return midi !== void 0 ? Number(midi) : void 0;
    }
    keyGroup.addEventListener("mousedown", (e) => {
      const midi = midiFromEvent(e);
      if (midi !== void 0) onMidi(midi, true);
    });
    keyGroup.addEventListener("mouseup", (e) => {
      const midi = midiFromEvent(e);
      if (midi !== void 0) onMidi(midi, false);
    });
    keyGroup.addEventListener("mouseleave", (e) => {
      const midi = midiFromEvent(e);
      if (midi !== void 0) onMidi(midi, false);
    }, true);
    keyGroup.addEventListener("mouseenter", (e) => {
      if (isMouseDown2()) {
        const midi = midiFromEvent(e);
        if (midi !== void 0) onMidi(midi, true);
      }
    }, true);
  }
  function centerOnMiddleC(container, piano2) {
    const middleCRect = piano2.rectByMidi.get(60);
    const middleCX = middleCRect ? Number(middleCRect.getAttribute("x")) : 0;
    container.scrollLeft = Math.max(0, middleCX - container.clientWidth / 2);
  }
  function renderKeyboard(piano2, activeNotes2, noteNames, highlightedNotes = /* @__PURE__ */ new Set()) {
    piano2.rectByMidi.forEach((rect, midi) => {
      const base = rect.classList.contains("black-key") ? "black-key" : "white-key";
      let cls = base;
      if (activeNotes2.has(midi)) cls += " active";
      if (highlightedNotes.has(midi)) cls += " highlighted";
      rect.setAttribute("class", cls);
    });
    while (piano2.labelGroup.firstChild) piano2.labelGroup.removeChild(piano2.labelGroup.firstChild);
    activeNotes2.forEach((midi) => {
      const key = piano2.keys.find((k) => k.midi === midi);
      if (!key) return;
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", String(key.x + key.width / 2));
      text.setAttribute("y", String(piano2.dims.labelAreaH - 12));
      text.setAttribute("class", "note-label");
      text.textContent = noteNames[midi % 12];
      piano2.labelGroup.appendChild(text);
    });
  }
  function renderChordDisplay(el, activeMidiSorted, pitchClasses, chordFormulas2, noteNames) {
    el.innerHTML = "";
    if (activeMidiSorted.length === 0) {
      el.innerHTML = '<span class="placeholder">Play some notes&hellip;</span>';
      return;
    }
    if (activeMidiSorted.length === 1) {
      const main2 = document.createElement("div");
      main2.className = "chord-main";
      main2.textContent = noteNames[activeMidiSorted[0] % 12];
      el.appendChild(main2);
      return;
    }
    if (activeMidiSorted.length === 2) {
      const distance = activeMidiSorted[1] - activeMidiSorted[0];
      const main2 = document.createElement("div");
      main2.className = "chord-main";
      main2.textContent = INTERVAL_NAMES[distance % 12];
      el.appendChild(main2);
      const alt = document.createElement("div");
      alt.className = "chord-alt";
      alt.textContent = noteNames[activeMidiSorted[0] % 12] + "  \u2192  " + noteNames[activeMidiSorted[1] % 12];
      el.appendChild(alt);
      return;
    }
    const bassPc = activeMidiSorted[0] % 12;
    const matches = detectChords(pitchClasses, chordFormulas2);
    const primary = matches.find((m) => m.root === bassPc) || matches[0];
    const main = document.createElement("div");
    main.className = "chord-main";
    if (primary) {
      let text = chordLabel(primary, noteNames);
      if (primary.root !== bassPc) {
        text += "/" + noteNames[bassPc];
      }
      main.textContent = text;
    } else {
      main.textContent = noteNames[bassPc] + " n.c.";
    }
    el.appendChild(main);
    const others = matches.filter((m) => m !== primary);
    if (others.length > 0) {
      const alt = document.createElement("div");
      alt.className = "chord-alt";
      alt.textContent = others.map((m) => chordLabel(m, noteNames)).join("  /  ");
      el.appendChild(alt);
    }
  }
  function renderChordTable(tbody, chordFormulas2, callbacks) {
    tbody.innerHTML = "";
    chordFormulas2.forEach((formula, index) => {
      const row = document.createElement("tr");
      const symbolCell = document.createElement("td");
      const symbolInput = document.createElement("input");
      symbolInput.type = "text";
      symbolInput.value = formula.symbol;
      symbolInput.addEventListener("change", () => {
        callbacks.onSymbolChange(index, symbolInput.value);
      });
      symbolCell.appendChild(symbolInput);
      const intervalsCell = document.createElement("td");
      const intervalsInput = document.createElement("input");
      intervalsInput.type = "text";
      intervalsInput.value = formula.intervals.join(",");
      intervalsInput.addEventListener("change", () => {
        intervalsInput.value = callbacks.onIntervalsChange(index, intervalsInput.value);
      });
      intervalsCell.appendChild(intervalsInput);
      const deleteCell = document.createElement("td");
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "chord-delete-btn";
      deleteBtn.textContent = "\u2715";
      deleteBtn.setAttribute("aria-label", "Delete chord");
      deleteBtn.addEventListener("click", () => callbacks.onDelete(index));
      deleteCell.appendChild(deleteBtn);
      row.appendChild(symbolCell);
      row.appendChild(intervalsCell);
      row.appendChild(deleteCell);
      tbody.appendChild(row);
    });
  }
  function setSettingsOpen(panel, button, open) {
    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
  }
  function downloadJSON(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  function setErrorMessage(el, message) {
    el.textContent = message || "";
    el.hidden = !message;
  }
  var DEFAULT_THEME = {
    background: "#ffffff",
    font: "#222222",
    whiteKey: "#ffffff",
    blackKey: "#222222",
    activeKey: "#4a76c4",
    highlight: "#ffd54f"
  };
  function applyTheme(theme) {
    const root = document.documentElement.style;
    root.setProperty("--bg-color", theme.background);
    root.setProperty("--font-color", theme.font);
    root.setProperty("--white-key-color", theme.whiteKey);
    root.setProperty("--black-key-color", theme.blackKey);
    root.setProperty("--active-key-color", theme.activeKey);
    root.setProperty("--highlight-color", theme.highlight);
  }
  var FONT_OPTIONS = [
    { id: "sans", label: "Sans-serif", family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif' },
    { id: "serif", label: "Serif", family: 'Georgia, "Times New Roman", serif' },
    { id: "mono", label: "Monospace", family: '"SFMono-Regular", Menlo, Consolas, monospace' },
    { id: "real-book", label: "Real Book", family: "'Reenie Beanie', cursive" }
  ];
  var DEFAULT_FONT_ID = FONT_OPTIONS[0].id;
  function applyFont(fontId) {
    const option = FONT_OPTIONS.find((f) => f.id === fontId) ?? FONT_OPTIONS[0];
    document.documentElement.style.setProperty("--font-family", option.family);
  }

  // src/app.ts
  function getCookie(name) {
    const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : null;
  }
  function setCookie(name, value, days) {
    document.cookie = name + "=" + encodeURIComponent(value) + "; path=/; max-age=" + days * 24 * 60 * 60 + "; SameSite=Lax";
  }
  function deleteCookie(name) {
    document.cookie = name + "=; path=/; max-age=0";
  }
  function loadLevel() {
    const raw = getCookie("level");
    return raw === "basic" || raw === "intermediate" || raw === "nerd" ? raw : "basic";
  }
  function saveLevel(level) {
    setCookie("level", level, 365);
  }
  function loadDebug() {
    const raw = getCookie("debugMode");
    if (raw === "1") return true;
    if (raw === "0") return false;
    return getCookie("chordFormulas") !== null;
  }
  function saveDebug(value) {
    setCookie("debugMode", value ? "1" : "0", 365);
  }
  var DEFAULT_VISIBLE_KEYS = 52;
  function loadVisibleKeys() {
    const raw = getCookie("visibleKeys");
    const n = raw !== null ? Number(raw) : NaN;
    return Number.isInteger(n) && n >= 1 && n <= TOTAL_KEYS ? n : DEFAULT_VISIBLE_KEYS;
  }
  function saveVisibleKeys(n) {
    setCookie("visibleKeys", String(n), 365);
  }
  function loadTheme() {
    const raw = getCookie("theme");
    if (!raw) return { ...DEFAULT_THEME };
    try {
      const parsed = JSON.parse(raw);
      const theme = { ...DEFAULT_THEME };
      Object.keys(DEFAULT_THEME).forEach((key) => {
        if (typeof parsed[key] === "string") theme[key] = parsed[key];
      });
      return theme;
    } catch (e) {
      return { ...DEFAULT_THEME };
    }
  }
  function saveTheme(theme) {
    setCookie("theme", JSON.stringify(theme), 365);
  }
  function loadFontId() {
    const raw = getCookie("fontFamily");
    return raw !== null && FONT_OPTIONS.some((f) => f.id === raw) ? raw : DEFAULT_FONT_ID;
  }
  function saveFontId(id) {
    setCookie("fontFamily", id, 365);
  }
  function cloneDefaultChordFormulas() {
    return DEFAULT_CHORD_FORMULAS.map((f) => ({ symbol: f.symbol, intervals: f.intervals.slice() }));
  }
  function loadChordFormulas() {
    const raw = getCookie("chordFormulas");
    if (!raw) return cloneDefaultChordFormulas();
    try {
      return parseChordFormulas(JSON.parse(raw)) ?? cloneDefaultChordFormulas();
    } catch (e) {
      return cloneDefaultChordFormulas();
    }
  }
  function saveChordFormulas() {
    setCookie("chordFormulas", JSON.stringify(chordFormulas), 365);
  }
  function parseIntervals(text) {
    return Array.from(new Set(
      text.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n)).map((n) => (n % 12 + 12) % 12)
    ));
  }
  var currentNoteNames = buildKeyNoteNames(KEYS[0]);
  var chordFormulas = loadChordFormulas();
  var currentLevel = loadLevel();
  var debugMode = loadDebug();
  var currentVisibleKeys = loadVisibleKeys();
  var currentTheme = loadTheme();
  var currentFontId = loadFontId();
  var activeNotes = /* @__PURE__ */ new Set();
  var sustainOn = false;
  var sustainedNotes = /* @__PURE__ */ new Set();
  var highlighterOpen = false;
  var highlightMode = null;
  var scaleRootIndex = null;
  var scaleTypeName = HIGHLIGHT_SCALES[0].name;
  var chordRootIndex = null;
  var chordTypeSymbol = HIGHLIGHT_CHORDS[0].symbol;
  var svg = document.getElementById("piano");
  var chordDisplayEl = document.getElementById("chordDisplay");
  var pianoContainer = document.getElementById("pianoContainer");
  var rangeInput = document.getElementById("rangeInput");
  var keySelect = document.getElementById("keySelect");
  var modeSelect = document.getElementById("modeSelect");
  var modeLabelText = document.getElementById("modeLabelText");
  var debugCheckbox = document.getElementById("debugCheckbox");
  var chordsSection = document.getElementById("chordsSection");
  var levelButtons = Array.from(document.querySelectorAll(".level-btn"));
  var chordTableBody = document.getElementById("chordTableBody");
  var addChordBtn = document.getElementById("addChordBtn");
  var resetChordsBtn = document.getElementById("resetChordsBtn");
  var exportChordsBtn = document.getElementById("exportChordsBtn");
  var importChordsBtn = document.getElementById("importChordsBtn");
  var importFileInput = document.getElementById("importFileInput");
  var chordImportError = document.getElementById("chordImportError");
  var menuButton = document.getElementById("menuButton");
  var settingsPanel = document.getElementById("settingsPanel");
  var statusEl = document.getElementById("status");
  var inputSelect = document.getElementById("inputSelect");
  var inputRow = document.getElementById("inputRow");
  var versionInfoEl = document.getElementById("versionInfo");
  var highlighterToggle = document.getElementById("highlighterToggle");
  var highlighterBody = document.getElementById("highlighterBody");
  var scaleRootButtonsEl = document.getElementById("scaleRootButtons");
  var scaleTypeButtonsEl = document.getElementById("scaleTypeButtons");
  var chordRootButtonsEl = document.getElementById("chordRootButtons");
  var chordTypeSelect = document.getElementById("chordTypeSelect");
  var themeBackgroundInput = document.getElementById("themeBackgroundInput");
  var themeFontInput = document.getElementById("themeFontInput");
  var themeWhiteKeyInput = document.getElementById("themeWhiteKeyInput");
  var themeBlackKeyInput = document.getElementById("themeBlackKeyInput");
  var themeActiveKeyInput = document.getElementById("themeActiveKeyInput");
  var themeHighlightInput = document.getElementById("themeHighlightInput");
  var themeResetBtn = document.getElementById("themeResetBtn");
  var fontFamilySelect = document.getElementById("fontFamilySelect");
  versionInfoEl.textContent = `Build ${"2d08ac8"}`;
  var piano;
  var isMouseDown = trackMouseIsDown();
  function render() {
    renderKeyboard(piano, activeNotes, currentNoteNames, computeHighlightedNotes());
    const activeMidiSorted = Array.from(activeNotes).sort((a, b) => a - b);
    const pitchClasses = Array.from(new Set(activeMidiSorted.map((m) => m % 12)));
    renderChordDisplay(chordDisplayEl, activeMidiSorted, pitchClasses, chordFormulas, currentNoteNames);
  }
  function noteOn(midi) {
    sustainedNotes.delete(midi);
    activeNotes.add(midi);
    render();
  }
  function noteOff(midi) {
    if (sustainOn) {
      sustainedNotes.add(midi);
      return;
    }
    activeNotes.delete(midi);
    render();
  }
  function setSustain(isDown) {
    sustainOn = isDown;
    if (!isDown) {
      sustainedNotes.forEach((midi) => activeNotes.delete(midi));
      sustainedNotes.clear();
      render();
    }
  }
  function rebuildPiano() {
    const availableWidth = Math.max(pianoContainer.clientWidth - 32, 50);
    const dims = computeKeyDimensions(currentVisibleKeys, availableWidth);
    piano = createPiano(svg, MIN_MIDI, MAX_MIDI, dims);
    attachPianoMouseInput(piano, isMouseDown, (midi, isOn) => isOn ? noteOn(midi) : noteOff(midi));
    centerOnMiddleC(pianoContainer, piano);
    render();
  }
  rangeInput.value = String(currentVisibleKeys);
  rangeInput.addEventListener("change", () => {
    const parsed = Math.min(Math.max(Math.round(Number(rangeInput.value)) || DEFAULT_VISIBLE_KEYS, 1), TOTAL_KEYS);
    currentVisibleKeys = parsed;
    rangeInput.value = String(parsed);
    saveVisibleKeys(parsed);
    rebuildPiano();
  });
  var resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(rebuildPiano, 150);
  });
  rebuildPiano();
  function syncThemeInputs() {
    themeBackgroundInput.value = currentTheme.background;
    themeFontInput.value = currentTheme.font;
    themeWhiteKeyInput.value = currentTheme.whiteKey;
    themeBlackKeyInput.value = currentTheme.blackKey;
    themeActiveKeyInput.value = currentTheme.activeKey;
    themeHighlightInput.value = currentTheme.highlight;
  }
  function updateTheme(partial) {
    currentTheme = { ...currentTheme, ...partial };
    applyTheme(currentTheme);
    saveTheme(currentTheme);
  }
  applyTheme(currentTheme);
  syncThemeInputs();
  themeBackgroundInput.addEventListener("input", () => updateTheme({ background: themeBackgroundInput.value }));
  themeFontInput.addEventListener("input", () => updateTheme({ font: themeFontInput.value }));
  themeWhiteKeyInput.addEventListener("input", () => updateTheme({ whiteKey: themeWhiteKeyInput.value }));
  themeBlackKeyInput.addEventListener("input", () => updateTheme({ blackKey: themeBlackKeyInput.value }));
  themeActiveKeyInput.addEventListener("input", () => updateTheme({ activeKey: themeActiveKeyInput.value }));
  themeHighlightInput.addEventListener("input", () => updateTheme({ highlight: themeHighlightInput.value }));
  themeResetBtn.addEventListener("click", () => {
    currentTheme = { ...DEFAULT_THEME };
    applyTheme(currentTheme);
    deleteCookie("theme");
    syncThemeInputs();
  });
  FONT_OPTIONS.forEach((font) => {
    const opt = document.createElement("option");
    opt.value = font.id;
    opt.textContent = font.label;
    opt.style.fontFamily = font.family;
    fontFamilySelect.appendChild(opt);
  });
  fontFamilySelect.value = currentFontId;
  applyFont(currentFontId);
  fontFamilySelect.addEventListener("change", () => {
    currentFontId = fontFamilySelect.value;
    applyFont(currentFontId);
    saveFontId(currentFontId);
  });
  KEYS.forEach((key, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = key.name;
    keySelect.appendChild(opt);
  });
  var IONIAN_INDEX = MODES.findIndex((m) => m.name === "Ionian");
  var AEOLIAN_INDEX = MODES.findIndex((m) => m.name === "Aeolian");
  function populateModeSelect() {
    modeLabelText.textContent = currentLevel === "basic" ? "Tonality" : "Mode";
    const prevIndex = modeSelect.value ? Number(modeSelect.value) : IONIAN_INDEX;
    modeSelect.innerHTML = "";
    const options = currentLevel === "basic" ? [{ label: "Major", index: IONIAN_INDEX }, { label: "Minor", index: AEOLIAN_INDEX }] : MODES.map((mode, i) => ({ label: mode.name, index: i }));
    options.forEach((o) => {
      const opt = document.createElement("option");
      opt.value = String(o.index);
      opt.textContent = o.label;
      modeSelect.appendChild(opt);
    });
    const validIndices = options.map((o) => o.index);
    modeSelect.value = String(validIndices.includes(prevIndex) ? prevIndex : IONIAN_INDEX);
  }
  populateModeSelect();
  function refreshNoteNames() {
    currentNoteNames = buildKeyNoteNames(KEYS[Number(keySelect.value)], MODES[Number(modeSelect.value)]);
    render();
  }
  keySelect.addEventListener("change", refreshNoteNames);
  modeSelect.addEventListener("change", refreshNoteNames);
  function updateLevelButtons() {
    levelButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.level === currentLevel));
  }
  function setLevel(level) {
    currentLevel = level;
    saveLevel(level);
    updateLevelButtons();
    populateModeSelect();
    refreshHighlighterUI();
    refreshNoteNames();
  }
  levelButtons.forEach((btn) => {
    btn.addEventListener("click", () => setLevel(btn.dataset.level));
  });
  updateLevelButtons();
  function updateChordsVisibility() {
    chordsSection.hidden = !debugMode;
  }
  debugCheckbox.checked = debugMode;
  updateChordsVisibility();
  debugCheckbox.addEventListener("change", () => {
    debugMode = debugCheckbox.checked;
    saveDebug(debugMode);
    updateChordsVisibility();
  });
  function refreshChordTable() {
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
        return chordFormulas[index].intervals.join(",");
      },
      onDelete(index) {
        chordFormulas.splice(index, 1);
        saveChordFormulas();
        refreshChordTable();
        render();
      }
    });
  }
  addChordBtn.addEventListener("click", () => {
    chordFormulas.push({ symbol: "", intervals: [] });
    refreshChordTable();
  });
  resetChordsBtn.addEventListener("click", () => {
    chordFormulas = cloneDefaultChordFormulas();
    deleteCookie("chordFormulas");
    setErrorMessage(chordImportError, null);
    refreshChordTable();
    render();
  });
  exportChordsBtn.addEventListener("click", () => {
    downloadJSON("midi-info-chords.json", chordFormulas);
  });
  importChordsBtn.addEventListener("click", () => {
    importFileInput.click();
  });
  importFileInput.addEventListener("change", () => {
    const file = importFileInput.files?.[0];
    importFileInput.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(String(reader.result));
      } catch (e) {
        setErrorMessage(chordImportError, "That file is not valid JSON.");
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
    reader.onerror = () => setErrorMessage(chordImportError, "Could not read that file.");
    reader.readAsText(file);
  });
  refreshChordTable();
  function availableScales() {
    return HIGHLIGHT_SCALES.filter((s) => levelAtLeast(currentLevel, s.minLevel));
  }
  function availableChords() {
    return HIGHLIGHT_CHORDS.filter((c) => levelAtLeast(currentLevel, c.minLevel));
  }
  function computeHighlightedNotes() {
    const notes = /* @__PURE__ */ new Set();
    if (highlightMode === "scale" && scaleRootIndex !== null) {
      const scale = HIGHLIGHT_SCALES.find((s) => s.name === scaleTypeName);
      if (scale) {
        const pcs = new Set(scalePitchClasses(keyPitchClass(KEYS[scaleRootIndex]), scale));
        for (let midi = MIN_MIDI; midi <= MAX_MIDI; midi++) {
          if (pcs.has(midi % 12)) notes.add(midi);
        }
      }
    } else if (highlightMode === "chord" && chordRootIndex !== null) {
      const chord = HIGHLIGHT_CHORDS.find((c) => c.symbol === chordTypeSymbol);
      if (chord) {
        buildChordVoicing(keyPitchClass(KEYS[chordRootIndex]), chord.intervals).forEach((m) => notes.add(m));
      }
    }
    return notes;
  }
  function chordOptionLabel(symbol) {
    if (symbol === "") return "Major";
    if (symbol === "-") return "Minor";
    return symbol;
  }
  function renderRootButtonRow(container, isActive, onSelect) {
    container.innerHTML = "";
    KEYS.forEach((key, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "root-btn" + (isActive(i) ? " active" : "");
      btn.textContent = key.name;
      btn.addEventListener("click", () => onSelect(i));
      container.appendChild(btn);
    });
  }
  function selectScaleRoot(index) {
    highlightMode = highlightMode === "scale" && scaleRootIndex === index ? null : "scale";
    scaleRootIndex = index;
    refreshHighlighterUI();
    render();
  }
  function selectScaleType(name) {
    scaleTypeName = name;
    if (scaleRootIndex !== null) highlightMode = "scale";
    refreshHighlighterUI();
    render();
  }
  function selectChordRoot(index) {
    highlightMode = highlightMode === "chord" && chordRootIndex === index ? null : "chord";
    chordRootIndex = index;
    refreshHighlighterUI();
    render();
  }
  function selectChordType(symbol) {
    chordTypeSymbol = symbol;
    if (chordRootIndex !== null) highlightMode = "chord";
    refreshHighlighterUI();
    render();
  }
  function refreshHighlighterUI() {
    const scales = availableScales();
    const chords = availableChords();
    if (highlightMode === "scale" && !scales.some((s) => s.name === scaleTypeName)) highlightMode = null;
    if (highlightMode === "chord" && !chords.some((c) => c.symbol === chordTypeSymbol)) highlightMode = null;
    renderRootButtonRow(scaleRootButtonsEl, (i) => highlightMode === "scale" && scaleRootIndex === i, selectScaleRoot);
    renderRootButtonRow(chordRootButtonsEl, (i) => highlightMode === "chord" && chordRootIndex === i, selectChordRoot);
    scaleTypeButtonsEl.innerHTML = "";
    scales.forEach((scale) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "type-btn" + (highlightMode === "scale" && scale.name === scaleTypeName ? " active" : "");
      btn.textContent = scale.name;
      btn.addEventListener("click", () => selectScaleType(scale.name));
      scaleTypeButtonsEl.appendChild(btn);
    });
    chordTypeSelect.innerHTML = "";
    chords.forEach((chord) => {
      const opt = document.createElement("option");
      opt.value = chord.symbol;
      opt.textContent = chordOptionLabel(chord.symbol);
      chordTypeSelect.appendChild(opt);
    });
    chordTypeSelect.value = chordTypeSymbol;
  }
  chordTypeSelect.addEventListener("change", () => selectChordType(chordTypeSelect.value));
  function setHighlighterOpen(open) {
    highlighterOpen = open;
    highlighterBody.hidden = !open;
    highlighterToggle.setAttribute("aria-expanded", String(open));
    highlighterToggle.classList.toggle("open", open);
  }
  highlighterToggle.addEventListener("click", () => setHighlighterOpen(!highlighterOpen));
  setHighlighterOpen(false);
  refreshHighlighterUI();
  menuButton.addEventListener("click", (e) => {
    e.stopPropagation();
    setSettingsOpen(settingsPanel, menuButton, settingsPanel.hidden);
  });
  settingsPanel.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", () => setSettingsOpen(settingsPanel, menuButton, false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setSettingsOpen(settingsPanel, menuButton, false);
  });
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
        inputRow.style.display = "none";
        return;
      }
      inputRow.style.display = "";
      inputSelect.innerHTML = "";
      inputNames.forEach((name) => {
        const opt = document.createElement("option");
        opt.textContent = name;
        inputSelect.appendChild(opt);
      });
    }
  });
})();
