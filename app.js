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
    // Suspended (only recognized with the root in the bass - see detectChords)
    { symbol: "sus2", intervals: [0, 2, 7] },
    { symbol: "sus4", intervals: [0, 5, 7] },
    { symbol: "\u03947sus2", intervals: [0, 2, 7, 11] },
    { symbol: "7sus4", intervals: [0, 5, 7, 10] },
    { symbol: "9sus4", intervals: [0, 5, 7, 10, 2] },
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
    "7sus4": "intermediate",
    "9sus4": "intermediate"
  };
  var CHORD_VOICINGS = {
    "\u03947sus2": [0, 11, 2, 7],
    "9sus4": [0, 5, 10, 2],
    "13sus": [0, 10, 2, 5, 9]
  };
  var HIGHLIGHT_CHORDS = BASE_CHORD_FORMULAS.map((f) => ({
    symbol: f.symbol,
    intervals: f.intervals,
    voicing: CHORD_VOICINGS[f.symbol] ?? f.intervals,
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
  function detectChords(pitchClasses, chordFormulas2, bassPc) {
    if (pitchClasses.length < 3) return [];
    const pcSet = new Set(pitchClasses);
    const matches = [];
    pitchClasses.forEach((root) => {
      chordFormulas2.forEach((formula) => {
        if (formula.intervals.length !== pitchClasses.length) return;
        if (bassPc !== void 0 && root !== bassPc && chordQuality(formula.symbol) === "suspended") return;
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
  var ROMAN_NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII"];
  function chordQuality(symbol) {
    if (symbol.startsWith("-")) return "minor";
    if (symbol === "\xB0" || symbol === "\xB07" || symbol === "\xF87") return "diminished";
    if (symbol.includes("sus")) return "suspended";
    if (symbol === "aug" || symbol.startsWith("\u0394") && symbol.includes("#5")) return "augmented";
    if (symbol === "" || symbol === "add2" || symbol.startsWith("\u0394") || symbol.startsWith("6")) return "major";
    return "dominant";
  }
  function chordSuffix(symbol, quality) {
    if (quality === "minor") return symbol.slice(1);
    if (symbol === "aug") return "+";
    return symbol;
  }
  function romanDegree(rootPc, tonicPc, mode) {
    const offset = ((rootPc - tonicPc) % 12 + 12) % 12;
    const exactIndex = mode.steps.indexOf(offset);
    if (exactIndex !== -1) return ROMAN_NUMERALS[exactIndex];
    let idxLow = 0;
    mode.steps.forEach((step, i) => {
      if (step < offset) idxLow = i;
    });
    const idxHigh = (idxLow + 1) % mode.steps.length;
    if (idxLow === 3) return "#" + ROMAN_NUMERALS[idxLow];
    return "b" + ROMAN_NUMERALS[idxHigh];
  }
  function romanNumeralLabel(match, tonicPc, mode) {
    const quality = chordQuality(match.formula.symbol);
    const numeral = romanDegree(match.root, tonicPc, mode);
    const cased = quality === "minor" || quality === "diminished" ? numeral.toLowerCase() : numeral;
    return cased + chordSuffix(match.formula.symbol, quality);
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
  function buildGradientDefs(totalWidth) {
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    function addStop(gradient, offset, color) {
      const stop = document.createElementNS("http://www.w3.org/2000/svg", "stop");
      stop.setAttribute("offset", offset);
      stop.setAttribute("style", `stop-color:${color}`);
      gradient.appendChild(stop);
    }
    function makeGradient(id, startColor, endColor) {
      const gradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
      gradient.setAttribute("id", id);
      gradient.setAttribute("gradientUnits", "userSpaceOnUse");
      gradient.setAttribute("x1", "0");
      gradient.setAttribute("y1", "0");
      gradient.setAttribute("x2", String(totalWidth));
      gradient.setAttribute("y2", "0");
      addStop(gradient, "0", startColor);
      addStop(gradient, "1", endColor);
      defs.appendChild(gradient);
    }
    makeGradient("whiteKeyGradient", "var(--white-key-color)", "var(--white-key-color-2)");
    makeGradient("blackKeyGradient", "var(--black-key-color)", "var(--black-key-color-2)");
    makeGradient("activeKeyGradient", "var(--active-key-color)", "var(--active-key-color-2)");
    makeGradient("highlightGradientWhite", "var(--highlight-color)", "var(--highlight-color-2)");
    makeGradient(
      "highlightGradientBlack",
      "color-mix(in srgb, var(--highlight-color) 55%, black)",
      "color-mix(in srgb, var(--highlight-color-2) 55%, black)"
    );
    return defs;
  }
  function createPiano(svg2, minMidi, maxMidi, dims) {
    const { keys, totalWhiteWidth } = buildKeys(minMidi, maxMidi, dims);
    const svgWidth = totalWhiteWidth;
    const svgHeight = dims.labelAreaH + dims.whiteH;
    svg2.innerHTML = "";
    svg2.setAttribute("width", String(svgWidth));
    svg2.setAttribute("height", String(svgHeight));
    svg2.setAttribute("viewBox", `0 0 ${svgWidth} ${svgHeight}`);
    svg2.appendChild(buildGradientDefs(totalWhiteWidth));
    const rectByMidi = /* @__PURE__ */ new Map();
    const labelGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const keyGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const octaveGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const whiteKeyGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const whiteGlowGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const blackKeyGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const blackGlowGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    keyGroup.append(whiteKeyGroup, whiteGlowGroup, blackKeyGroup, blackGlowGroup);
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
      whiteKeyGroup.appendChild(rect);
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
      blackKeyGroup.appendChild(rect);
      rectByMidi.set(key.midi, rect);
    });
    svg2.appendChild(keyGroup);
    svg2.appendChild(octaveGroup);
    svg2.appendChild(labelGroup);
    return { keys, rectByMidi, labelGroup, keyGroup, whiteGlowGroup, blackGlowGroup, dims };
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
    while (piano2.whiteGlowGroup.firstChild) piano2.whiteGlowGroup.removeChild(piano2.whiteGlowGroup.firstChild);
    while (piano2.blackGlowGroup.firstChild) piano2.blackGlowGroup.removeChild(piano2.blackGlowGroup.firstChild);
    if (document.documentElement.classList.contains("glow-enabled")) {
      activeNotes2.forEach((midi) => {
        const key = piano2.keys.find((k) => k.midi === midi);
        if (!key) return;
        const glow = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        glow.setAttribute("x", String(key.x));
        glow.setAttribute("y", String(piano2.dims.labelAreaH));
        glow.setAttribute("width", String(key.width));
        glow.setAttribute("height", String(key.height));
        let cls = (key.isBlack ? "black-key" : "white-key") + " active key-glow";
        if (highlightedNotes.has(midi)) cls += " highlighted";
        glow.setAttribute("class", cls);
        (key.isBlack ? piano2.blackGlowGroup : piano2.whiteGlowGroup).appendChild(glow);
      });
    }
  }
  function renderChordDisplay(el, activeMidiSorted, pitchClasses, chordFormulas2, noteNames, tonicPc, mode, hasPlayedNote2) {
    el.innerHTML = "";
    const main = document.createElement("div");
    main.className = "chord-main";
    const roman = document.createElement("div");
    roman.className = "chord-roman";
    const alt = document.createElement("div");
    alt.className = "chord-alt";
    el.append(main, roman, alt);
    if (activeMidiSorted.length === 0) {
      if (!hasPlayedNote2) {
        const placeholder = document.createElement("span");
        placeholder.className = "placeholder";
        placeholder.textContent = "Play some notes\u2026";
        main.appendChild(placeholder);
      }
      return;
    }
    if (pitchClasses.length === 1) {
      main.textContent = noteNames[pitchClasses[0]];
      return;
    }
    if (pitchClasses.length === 2) {
      const distance = pitchClasses[1] - pitchClasses[0];
      main.textContent = INTERVAL_NAMES[(distance % 12 + 12) % 12];
      alt.textContent = noteNames[pitchClasses[0]] + "  \u2192  " + noteNames[pitchClasses[1]];
      return;
    }
    const bassPc = activeMidiSorted[0] % 12;
    const matches = detectChords(pitchClasses, chordFormulas2, bassPc);
    const primary = matches.find((m) => m.root === bassPc) || matches[0];
    if (primary) {
      let text = chordLabel(primary, noteNames);
      if (primary.root !== bassPc) {
        text += "/" + noteNames[bassPc];
      }
      main.textContent = text;
      roman.textContent = romanNumeralLabel(primary, tonicPc, mode);
    } else {
      main.textContent = noteNames[bassPc] + " n.c.";
    }
    const others = matches.filter((m) => m !== primary);
    if (others.length > 0) {
      alt.textContent = others.map((m) => chordLabel(m, noteNames)).join("  /  ");
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
  var COLOR_KEYS = [
    "background",
    "font",
    "whiteKey",
    "blackKey",
    "activeKey",
    "highlight",
    "background2",
    "whiteKey2",
    "blackKey2",
    "activeKey2",
    "highlight2"
  ];
  var REQUIRED_COLOR_KEYS = ["background", "font", "whiteKey", "blackKey", "activeKey", "highlight"];
  var GRADIENT_COLOR_KEYS = [
    ["background2", "background"],
    ["whiteKey2", "whiteKey"],
    ["blackKey2", "blackKey"],
    ["activeKey2", "activeKey"],
    ["highlight2", "highlight"]
  ];
  var BOOLEAN_KEYS = ["gradient", "glow"];
  var BUILT_IN_THEMES = [
    {
      name: "Light",
      background: "#ffffff",
      font: "#222222",
      whiteKey: "#ffffff",
      blackKey: "#222222",
      activeKey: "#4a76c4",
      highlight: "#ffd54f",
      // Each *2 defaults to its own base color, so flipping the gradient
      // toggle on a built-in theme is a visible no-op until the user picks
      // a different second color for something.
      background2: "#ffffff",
      whiteKey2: "#ffffff",
      blackKey2: "#222222",
      activeKey2: "#4a76c4",
      highlight2: "#ffd54f",
      gradient: false,
      glow: false
    },
    {
      name: "Dark",
      background: "#1e1e1e",
      font: "#e8e8e8",
      whiteKey: "#2b2b2b",
      blackKey: "#0d0d0d",
      activeKey: "#6c9bf0",
      highlight: "#ffb300",
      background2: "#1e1e1e",
      whiteKey2: "#2b2b2b",
      blackKey2: "#0d0d0d",
      activeKey2: "#6c9bf0",
      highlight2: "#ffb300",
      gradient: false,
      glow: false
    },
    {
      name: "Cotton Candy",
      background: "#a6c8c6",
      font: "#0a0000",
      whiteKey: "#ffffff",
      blackKey: "#222222",
      activeKey: "#eebfa0",
      highlight: "#49b0ca",
      background2: "#a6c8c6",
      whiteKey2: "#ffffff",
      blackKey2: "#222222",
      activeKey2: "#eebfa0",
      highlight2: "#49b0ca",
      gradient: false,
      glow: false
    },
    {
      // Dark/green neon look: near-black keys and background, bright neon
      // green text and active keys, glow on for a lit-LED feel, and gradient
      // on with subtle same-hue-family shifts (not a rainbow) across
      // background/keys/highlight.
      name: "Neon",
      background: "#060b08",
      font: "#39ff88",
      whiteKey: "#0f1f14",
      blackKey: "#030704",
      activeKey: "#2bffa0",
      highlight: "#c6ff00",
      background2: "#0a1f12",
      whiteKey2: "#163826",
      blackKey2: "#081208",
      activeKey2: "#7dffce",
      highlight2: "#eaff7d",
      gradient: true,
      glow: true
    }
  ];
  var DEFAULT_THEME = BUILT_IN_THEMES[0];
  function applyTheme(theme) {
    const root = document.documentElement.style;
    root.setProperty("--bg-color", theme.background);
    root.setProperty("--font-color", theme.font);
    root.setProperty("--white-key-color", theme.whiteKey);
    root.setProperty("--black-key-color", theme.blackKey);
    root.setProperty("--active-key-color", theme.activeKey);
    root.setProperty("--highlight-color", theme.highlight);
    root.setProperty("--bg-color-2", theme.background2);
    root.setProperty("--white-key-color-2", theme.whiteKey2);
    root.setProperty("--black-key-color-2", theme.blackKey2);
    root.setProperty("--active-key-color-2", theme.activeKey2);
    root.setProperty("--highlight-color-2", theme.highlight2);
    document.documentElement.classList.toggle("gradient-enabled", theme.gradient);
    document.documentElement.classList.toggle("glow-enabled", theme.glow);
  }
  function themeColorsEqual(a, b) {
    return COLOR_KEYS.every((key) => a[key] === b[key]) && BOOLEAN_KEYS.every((key) => a[key] === b[key]);
  }
  function parseNamedTheme(raw) {
    if (typeof raw !== "object" || raw === null) return null;
    const t = raw;
    if (typeof t.name !== "string" || !t.name.trim()) return null;
    const theme = { name: t.name.trim() };
    const dest = theme;
    for (const key of REQUIRED_COLOR_KEYS) {
      if (typeof t[key] !== "string") return null;
      dest[key] = t[key];
    }
    for (const [key, fallbackKey] of GRADIENT_COLOR_KEYS) {
      dest[key] = typeof t[key] === "string" ? t[key] : dest[fallbackKey];
    }
    for (const key of BOOLEAN_KEYS) {
      dest[key] = typeof t[key] === "boolean" ? t[key] : false;
    }
    return theme;
  }
  function parseNamedThemes(raw) {
    if (!Array.isArray(raw)) return null;
    const result = [];
    for (const item of raw) {
      const theme = parseNamedTheme(item);
      if (!theme) return null;
      result.push(theme);
    }
    return result.length ? result : null;
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
  var DEFAULT_FONT_SIZES = {
    chord: 40,
    secondary: 16,
    tertiary: 15,
    note: 15,
    octave: 10
  };
  function applyFontSizes(sizes) {
    const root = document.documentElement.style;
    root.setProperty("--font-size-chord", `${sizes.chord}px`);
    root.setProperty("--font-size-secondary", `${sizes.secondary}px`);
    root.setProperty("--font-size-tertiary", `${sizes.tertiary}px`);
    root.setProperty("--font-size-note", `${sizes.note}px`);
    root.setProperty("--font-size-octave", `${sizes.octave}px`);
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
  function cloneBuiltInThemes() {
    return BUILT_IN_THEMES.map((t) => ({ ...t }));
  }
  function loadThemes() {
    const raw = getCookie("themes");
    if (!raw) return cloneBuiltInThemes();
    try {
      const saved = parseNamedThemes(JSON.parse(raw));
      if (!saved) return cloneBuiltInThemes();
      const missing = BUILT_IN_THEMES.filter((b) => !saved.some((t) => t.name === b.name));
      return missing.length ? [...saved, ...missing.map((t) => ({ ...t }))] : saved;
    } catch (e) {
      return cloneBuiltInThemes();
    }
  }
  function saveThemes() {
    setCookie("themes", JSON.stringify(themes), 365);
  }
  function loadThemeName(themes2) {
    const raw = getCookie("themeName");
    return raw !== null && themes2.some((t) => t.name === raw) ? raw : themes2[0].name;
  }
  function saveThemeName(name) {
    setCookie("themeName", name, 365);
  }
  function loadFontId() {
    const raw = getCookie("fontFamily");
    return raw !== null && FONT_OPTIONS.some((f) => f.id === raw) ? raw : DEFAULT_FONT_ID;
  }
  function saveFontId(id) {
    setCookie("fontFamily", id, 365);
  }
  function loadFontSize(cookieName, fallback) {
    const raw = getCookie(cookieName);
    const n = raw !== null ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }
  function loadFontSizes() {
    return {
      chord: loadFontSize("fontSizeChord", DEFAULT_FONT_SIZES.chord),
      secondary: loadFontSize("fontSizeSecondary", DEFAULT_FONT_SIZES.secondary),
      tertiary: loadFontSize("fontSizeTertiary", DEFAULT_FONT_SIZES.tertiary),
      note: loadFontSize("fontSizeNote", DEFAULT_FONT_SIZES.note),
      octave: loadFontSize("fontSizeOctave", DEFAULT_FONT_SIZES.octave)
    };
  }
  function saveFontSizes(sizes) {
    setCookie("fontSizeChord", String(sizes.chord), 365);
    setCookie("fontSizeSecondary", String(sizes.secondary), 365);
    setCookie("fontSizeTertiary", String(sizes.tertiary), 365);
    setCookie("fontSizeNote", String(sizes.note), 365);
    setCookie("fontSizeOctave", String(sizes.octave), 365);
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
  var currentTonicPc = keyPitchClass(KEYS[0]);
  var currentMode = MODES[0];
  var chordFormulas = loadChordFormulas();
  var currentLevel = loadLevel();
  var debugMode = loadDebug();
  var currentVisibleKeys = loadVisibleKeys();
  var themes = loadThemes();
  var currentThemeName = loadThemeName(themes);
  var currentFontId = loadFontId();
  var currentFontSizes = loadFontSizes();
  var activeNotes = /* @__PURE__ */ new Set();
  var hasPlayedNote = false;
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
  var levelButtons = Array.from(document.querySelectorAll(".level-btn"));
  var chordTableBody = document.getElementById("chordTableBody");
  var addChordBtn = document.getElementById("addChordBtn");
  var resetChordsBtn = document.getElementById("resetChordsBtn");
  var exportChordsBtn = document.getElementById("exportChordsBtn");
  var importChordsBtn = document.getElementById("importChordsBtn");
  var importFileInput = document.getElementById("importFileInput");
  var chordImportError = document.getElementById("chordImportError");
  var menuButton = document.getElementById("menuButton");
  var settingsOverlay = document.getElementById("settingsOverlay");
  var settingsPanel = document.getElementById("settingsPanel");
  var settingsCloseBtn = document.getElementById("settingsCloseBtn");
  var settingsNavChords = document.getElementById("settingsNavChords");
  var settingsNavThemes = document.getElementById("settingsNavThemes");
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
  var themeSelect = document.getElementById("themeSelect");
  var themeNameInput = document.getElementById("themeNameInput");
  var themeBackgroundInput = document.getElementById("themeBackgroundInput");
  var themeFontInput = document.getElementById("themeFontInput");
  var themeWhiteKeyInput = document.getElementById("themeWhiteKeyInput");
  var themeBlackKeyInput = document.getElementById("themeBlackKeyInput");
  var themeActiveKeyInput = document.getElementById("themeActiveKeyInput");
  var themeHighlightInput = document.getElementById("themeHighlightInput");
  var themeGradientCheckbox = document.getElementById("themeGradientCheckbox");
  var themeBackgroundGradientInput = document.getElementById("themeBackgroundGradientInput");
  var themeWhiteKeyGradientInput = document.getElementById("themeWhiteKeyGradientInput");
  var themeBlackKeyGradientInput = document.getElementById("themeBlackKeyGradientInput");
  var themeActiveKeyGradientInput = document.getElementById("themeActiveKeyGradientInput");
  var themeHighlightGradientInput = document.getElementById("themeHighlightGradientInput");
  var themeGlowCheckbox = document.getElementById("themeGlowCheckbox");
  var newThemeBtn = document.getElementById("newThemeBtn");
  var deleteThemeBtn = document.getElementById("deleteThemeBtn");
  var themeResetBtn = document.getElementById("themeResetBtn");
  var exportThemeBtn = document.getElementById("exportThemeBtn");
  var importThemeBtn = document.getElementById("importThemeBtn");
  var importThemeFileInput = document.getElementById("importThemeFileInput");
  var themeImportError = document.getElementById("themeImportError");
  var fontFamilySelect = document.getElementById("fontFamilySelect");
  var chordFontSizeInput = document.getElementById("chordFontSizeInput");
  var secondaryFontSizeInput = document.getElementById("secondaryFontSizeInput");
  var tertiaryFontSizeInput = document.getElementById("tertiaryFontSizeInput");
  var noteFontSizeInput = document.getElementById("noteFontSizeInput");
  var octaveFontSizeInput = document.getElementById("octaveFontSizeInput");
  versionInfoEl.textContent = `Build ${"8d960aa"}`;
  var piano;
  var isMouseDown = trackMouseIsDown();
  function render() {
    renderKeyboard(piano, activeNotes, currentNoteNames, computeHighlightedNotes());
    const activeMidiSorted = Array.from(activeNotes).sort((a, b) => a - b);
    const pitchClasses = Array.from(new Set(activeMidiSorted.map((m) => m % 12)));
    renderChordDisplay(
      chordDisplayEl,
      activeMidiSorted,
      pitchClasses,
      chordFormulas,
      currentNoteNames,
      currentTonicPc,
      currentMode,
      hasPlayedNote
    );
  }
  function noteOn(midi) {
    hasPlayedNote = true;
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
  var settingsTabButtons = Array.from(document.querySelectorAll(".settings-tab-btn"));
  var settingsTabPanels = Array.from(document.querySelectorAll(".settings-tab-panel"));
  var activeSettingsTab = "theory";
  function setActiveSettingsTab(tab) {
    activeSettingsTab = tab;
    settingsTabButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
    settingsTabPanels.forEach((panel) => {
      panel.hidden = panel.dataset.tabPanel !== tab;
    });
  }
  settingsTabButtons.forEach((btn) => {
    btn.addEventListener("click", () => setActiveSettingsTab(btn.dataset.tab));
  });
  setActiveSettingsTab(activeSettingsTab);
  menuButton.addEventListener("click", (e) => {
    e.stopPropagation();
    setSettingsOpen(settingsOverlay, menuButton, settingsOverlay.hidden);
  });
  settingsPanel.addEventListener("click", (e) => e.stopPropagation());
  settingsCloseBtn.addEventListener("click", () => setSettingsOpen(settingsOverlay, menuButton, false));
  document.addEventListener("click", () => setSettingsOpen(settingsOverlay, menuButton, false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setSettingsOpen(settingsOverlay, menuButton, false);
  });
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
  function getCurrentTheme() {
    return themes.find((t) => t.name === currentThemeName) ?? themes[0];
  }
  function isModifiedFromBuiltIn(theme) {
    const builtIn = BUILT_IN_THEMES.find((b) => b.name === theme.name);
    return builtIn !== void 0 && !themeColorsEqual(theme, builtIn);
  }
  function populateThemeSelect() {
    themeSelect.innerHTML = "";
    themes.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.name;
      opt.textContent = isModifiedFromBuiltIn(t) ? `${t.name} (modified)` : t.name;
      themeSelect.appendChild(opt);
    });
    themeSelect.value = currentThemeName;
  }
  function syncThemeEditorInputs() {
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
    const isBuiltIn = BUILT_IN_THEMES.some((b) => b.name === theme.name);
    themeNameInput.disabled = isBuiltIn;
    deleteThemeBtn.disabled = themes.length <= 1 || isBuiltIn;
    themeResetBtn.disabled = !isBuiltIn;
  }
  function selectTheme(name) {
    currentThemeName = name;
    saveThemeName(name);
    applyTheme(getCurrentTheme());
    themeSelect.value = name;
    syncThemeEditorInputs();
  }
  function updateCurrentTheme(partial) {
    Object.assign(getCurrentTheme(), partial);
    applyTheme(getCurrentTheme());
    saveThemes();
    populateThemeSelect();
  }
  populateThemeSelect();
  applyTheme(getCurrentTheme());
  syncThemeEditorInputs();
  themeSelect.addEventListener("change", () => selectTheme(themeSelect.value));
  themeBackgroundInput.addEventListener("input", () => updateCurrentTheme({ background: themeBackgroundInput.value }));
  themeFontInput.addEventListener("input", () => updateCurrentTheme({ font: themeFontInput.value }));
  themeWhiteKeyInput.addEventListener("input", () => updateCurrentTheme({ whiteKey: themeWhiteKeyInput.value }));
  themeBlackKeyInput.addEventListener("input", () => updateCurrentTheme({ blackKey: themeBlackKeyInput.value }));
  themeActiveKeyInput.addEventListener("input", () => updateCurrentTheme({ activeKey: themeActiveKeyInput.value }));
  themeHighlightInput.addEventListener("input", () => updateCurrentTheme({ highlight: themeHighlightInput.value }));
  themeGradientCheckbox.addEventListener("change", () => updateCurrentTheme({ gradient: themeGradientCheckbox.checked }));
  themeBackgroundGradientInput.addEventListener("input", () => updateCurrentTheme({ background2: themeBackgroundGradientInput.value }));
  themeWhiteKeyGradientInput.addEventListener("input", () => updateCurrentTheme({ whiteKey2: themeWhiteKeyGradientInput.value }));
  themeBlackKeyGradientInput.addEventListener("input", () => updateCurrentTheme({ blackKey2: themeBlackKeyGradientInput.value }));
  themeActiveKeyGradientInput.addEventListener("input", () => updateCurrentTheme({ activeKey2: themeActiveKeyGradientInput.value }));
  themeHighlightGradientInput.addEventListener("input", () => updateCurrentTheme({ highlight2: themeHighlightGradientInput.value }));
  themeGlowCheckbox.addEventListener("change", () => updateCurrentTheme({ glow: themeGlowCheckbox.checked }));
  themeNameInput.addEventListener("change", () => {
    const theme = getCurrentTheme();
    const nextName = themeNameInput.value.trim();
    if (BUILT_IN_THEMES.some((b) => b.name === theme.name) || !nextName || themes.some((t) => t !== theme && t.name === nextName)) {
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
  newThemeBtn.addEventListener("click", () => {
    const base = getCurrentTheme();
    let name = "New theme";
    let n = 2;
    while (themes.some((t) => t.name === name)) {
      name = `New theme ${n++}`;
    }
    themes.push({ ...base, name });
    saveThemes();
    populateThemeSelect();
    selectTheme(name);
  });
  deleteThemeBtn.addEventListener("click", () => {
    if (themes.length <= 1 || BUILT_IN_THEMES.some((b) => b.name === currentThemeName)) return;
    const index = themes.findIndex((t) => t.name === currentThemeName);
    if (index === -1) return;
    themes.splice(index, 1);
    saveThemes();
    populateThemeSelect();
    selectTheme(themes[Math.max(0, index - 1)].name);
  });
  themeResetBtn.addEventListener("click", () => {
    const builtIn = BUILT_IN_THEMES.find((b) => b.name === currentThemeName);
    if (!builtIn) return;
    Object.assign(getCurrentTheme(), builtIn);
    applyTheme(getCurrentTheme());
    saveThemes();
    populateThemeSelect();
    syncThemeEditorInputs();
  });
  exportThemeBtn.addEventListener("click", () => {
    downloadJSON("midi-info-theme.json", getCurrentTheme());
  });
  importThemeBtn.addEventListener("click", () => {
    importThemeFileInput.click();
  });
  importThemeFileInput.addEventListener("change", () => {
    const file = importThemeFileInput.files?.[0];
    importThemeFileInput.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(String(reader.result));
      } catch (e) {
        setErrorMessage(themeImportError, "That file is not valid JSON.");
        return;
      }
      const theme = parseNamedTheme(parsed);
      if (!theme) {
        setErrorMessage(themeImportError, "That file doesn't look like a theme export.");
        return;
      }
      const existingIndex = themes.findIndex((t) => t.name === theme.name);
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
    reader.onerror = () => setErrorMessage(themeImportError, "Could not read that file.");
    reader.readAsText(file);
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
  chordFontSizeInput.value = String(currentFontSizes.chord);
  secondaryFontSizeInput.value = String(currentFontSizes.secondary);
  tertiaryFontSizeInput.value = String(currentFontSizes.tertiary);
  noteFontSizeInput.value = String(currentFontSizes.note);
  octaveFontSizeInput.value = String(currentFontSizes.octave);
  applyFontSizes(currentFontSizes);
  function updateFontSize(key, value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return;
    currentFontSizes = { ...currentFontSizes, [key]: n };
    applyFontSizes(currentFontSizes);
    saveFontSizes(currentFontSizes);
  }
  chordFontSizeInput.addEventListener("change", () => updateFontSize("chord", chordFontSizeInput.value));
  secondaryFontSizeInput.addEventListener("change", () => updateFontSize("secondary", secondaryFontSizeInput.value));
  tertiaryFontSizeInput.addEventListener("change", () => updateFontSize("tertiary", tertiaryFontSizeInput.value));
  noteFontSizeInput.addEventListener("change", () => updateFontSize("note", noteFontSizeInput.value));
  octaveFontSizeInput.addEventListener("change", () => updateFontSize("octave", octaveFontSizeInput.value));
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
    const key = KEYS[Number(keySelect.value)];
    currentMode = MODES[Number(modeSelect.value)];
    currentNoteNames = buildKeyNoteNames(key, currentMode);
    currentTonicPc = keyPitchClass(key);
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
  function updateDebugSectionsVisibility() {
    settingsNavChords.hidden = !debugMode;
    settingsNavThemes.hidden = !debugMode;
    if (!debugMode && (activeSettingsTab === "chords" || activeSettingsTab === "themes")) {
      setActiveSettingsTab("display");
    }
  }
  debugCheckbox.checked = debugMode;
  updateDebugSectionsVisibility();
  debugCheckbox.addEventListener("change", () => {
    debugMode = debugCheckbox.checked;
    saveDebug(debugMode);
    updateDebugSectionsVisibility();
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
        buildChordVoicing(keyPitchClass(KEYS[chordRootIndex]), chord.voicing).forEach((m) => notes.add(m));
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
