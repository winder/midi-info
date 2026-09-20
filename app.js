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
  var MAJOR_SCALE_STEPS = [0, 2, 4, 5, 7, 9, 11];
  var KEYS = [
    { name: "C", tonicLetter: "C", tonicAccidental: 0, fallback: SHARP_NAMES },
    { name: "Db", tonicLetter: "D", tonicAccidental: -1, fallback: FLAT_NAMES },
    { name: "D", tonicLetter: "D", tonicAccidental: 0, fallback: SHARP_NAMES },
    { name: "Eb", tonicLetter: "E", tonicAccidental: -1, fallback: FLAT_NAMES },
    { name: "E", tonicLetter: "E", tonicAccidental: 0, fallback: SHARP_NAMES },
    { name: "F", tonicLetter: "F", tonicAccidental: 0, fallback: FLAT_NAMES },
    { name: "F#", tonicLetter: "F", tonicAccidental: 1, fallback: SHARP_NAMES },
    { name: "G", tonicLetter: "G", tonicAccidental: 0, fallback: SHARP_NAMES },
    { name: "Ab", tonicLetter: "A", tonicAccidental: -1, fallback: FLAT_NAMES },
    { name: "A", tonicLetter: "A", tonicAccidental: 0, fallback: SHARP_NAMES },
    { name: "Bb", tonicLetter: "B", tonicAccidental: -1, fallback: FLAT_NAMES },
    { name: "B", tonicLetter: "B", tonicAccidental: 0, fallback: SHARP_NAMES }
  ];
  function buildKeyNoteNames(key) {
    const names = key.fallback.slice();
    const tonicPc = (NATURAL_PC[key.tonicLetter] + key.tonicAccidental + 12) % 12;
    const letterIndex = LETTERS.indexOf(key.tonicLetter);
    MAJOR_SCALE_STEPS.forEach((step, degree) => {
      const letter = LETTERS[(letterIndex + degree) % 7];
      const expectedPc = (tonicPc + step) % 12;
      const accidental = ((expectedPc - NATURAL_PC[letter]) % 12 + 12) % 12;
      if (accidental === 0) names[expectedPc] = letter;
      else if (accidental === 1) names[expectedPc] = letter + "#";
      else if (accidental === 11) names[expectedPc] = letter + "b";
    });
    return names;
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
  var WHITE_W = 40;
  var WHITE_H = 180;
  var BLACK_W = 24;
  var BLACK_H = 110;
  var LABEL_AREA_H = 40;
  var MIN_MIDI = 21;
  var MAX_MIDI = 108;
  function buildKeys(minMidi, maxMidi) {
    const whiteX = {};
    let whiteIndex = 0;
    for (let m = minMidi; m <= maxMidi; m++) {
      if (!isBlackPitch(m)) {
        whiteX[m] = whiteIndex * WHITE_W;
        whiteIndex++;
      }
    }
    const totalWhiteWidth = whiteIndex * WHITE_W;
    const keys = [];
    for (let m = minMidi; m <= maxMidi; m++) {
      if (!isBlackPitch(m)) {
        keys.push({ midi: m, isBlack: false, x: whiteX[m], width: WHITE_W, height: WHITE_H });
      } else {
        const nextWhite = whiteX[m + 1];
        const prevWhite = whiteX[m - 1];
        const boundary = nextWhite !== void 0 ? nextWhite : prevWhite + WHITE_W;
        keys.push({ midi: m, isBlack: true, x: boundary - BLACK_W / 2, width: BLACK_W, height: BLACK_H });
      }
    }
    return { keys, totalWhiteWidth };
  }
  function createPiano(svg2) {
    const { keys, totalWhiteWidth } = buildKeys(MIN_MIDI, MAX_MIDI);
    const svgWidth = totalWhiteWidth;
    const svgHeight = LABEL_AREA_H + WHITE_H;
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
      rect.setAttribute("y", String(LABEL_AREA_H));
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
        text.setAttribute("y", String(LABEL_AREA_H + WHITE_H - 8));
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
    return { keys, rectByMidi, labelGroup, keyGroup };
  }
  function attachPianoMouseInput(piano2, onMidi) {
    const keyGroup = piano2.keyGroup;
    let mouseDown = false;
    document.addEventListener("mousedown", () => mouseDown = true);
    document.addEventListener("mouseup", () => mouseDown = false);
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
      if (mouseDown) {
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
  function renderKeyboard(piano2, activeNotes2, noteNames) {
    piano2.rectByMidi.forEach((rect, midi) => {
      const base = rect.classList.contains("black-key") ? "black-key" : "white-key";
      rect.setAttribute("class", base + (activeNotes2.has(midi) ? " active" : ""));
    });
    while (piano2.labelGroup.firstChild) piano2.labelGroup.removeChild(piano2.labelGroup.firstChild);
    activeNotes2.forEach((midi) => {
      const key = piano2.keys.find((k) => k.midi === midi);
      if (!key) return;
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", String(key.x + key.width / 2));
      text.setAttribute("y", String(LABEL_AREA_H - 12));
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
  var activeNotes = /* @__PURE__ */ new Set();
  var sustainOn = false;
  var sustainedNotes = /* @__PURE__ */ new Set();
  var svg = document.getElementById("piano");
  var chordDisplayEl = document.getElementById("chordDisplay");
  var pianoContainer = document.getElementById("pianoContainer");
  var keySelect = document.getElementById("keySelect");
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
  var piano = createPiano(svg);
  function render() {
    renderKeyboard(piano, activeNotes, currentNoteNames);
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
  attachPianoMouseInput(piano, (midi, isOn) => isOn ? noteOn(midi) : noteOff(midi));
  render();
  centerOnMiddleC(pianoContainer, piano);
  KEYS.forEach((key, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = key.name;
    keySelect.appendChild(opt);
  });
  keySelect.addEventListener("change", () => {
    currentNoteNames = buildKeyNoteNames(KEYS[Number(keySelect.value)]);
    render();
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
