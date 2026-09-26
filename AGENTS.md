# AGENTS.md

MIDI Piano: connects to a MIDI keyboard via the Web MIDI API and renders an on-screen keyboard showing played notes, intervals, detected chords and Roman numerals. Live at https://winder.github.io/midi-info/.

## Layout

- `index.html` - UI layout and CSS only. No inline JS.
- `src/theory.ts` - pure music theory, no DOM: key/mode spelling, chord formulas, `detectChords`, `romanNumeralLabel`, highlight scales/chords, `parseChordFormulas`.
- `src/midi.ts` - Web MIDI wrapper (`initMIDI`, with a per-device input filter) and `midiPickerModel`, the pure model behind the top bar's MIDI picker, whose selected entry doubles as the connection status.
- `src/settle.ts` - `NoteSettler`, the chord-readout debouncer (the Smoothing setting). Pure, timer-based, no DOM.
- `src/sound.ts` - Web Audio `Synth` (per held note: one oscillator or a detuned stereo unison stack, a vibrato LFO, its own lowpass with an optional filter envelope, and an ADSR gain; then shared volume, generated convolution reverb, limiter) and the pure Sound-tab settings helpers. Off by default; browsers keep audio suspended until a click or key press (MIDI doesn't count), hence the top-bar unlock button.
- `src/player.ts` - the MIDI file player: `parseSong` (the only `@tonejs/midi` user; rejects files with more than one instrument part) and `MidiPlayer`, which plays a plain `Song` through note/pedal callbacks on a timer. Pure apart from timers.
- `src/presets.ts` - the player's built-in files (`MIDI_PRESETS`: id, name, file in `midi/`, optional key/mode/sound applied on load). The id is the `?midi=<id>` link, so keep it stable. The `.mid` files themselves live in `midi/`.
- `src/ui.ts` - SVG piano rendering, DOM helpers, themes and fonts. Functions take data in and own no state.
- `src/app.ts` - orchestrator: all app state, cookie persistence, event wiring, init.
- `src/theory.test.ts`, `src/settle.test.ts`, `src/sound.test.ts`, `src/midi.test.ts`, `src/analytics.test.ts`, `src/player.test.ts` - unit tests. Only `theory.ts`, `settle.ts`, `player.ts`, the pure helpers in `sound.ts` and `midi.ts`, and the pure tracker in `analytics.ts` are unit-tested; `ui`/`app`/`midi` need a browser and are covered by e2e.
- `e2e/` - Playwright tests against the built bundle. `fixtures.ts` (`launchApp`, `openSettings`) and `server.ts` are the shared bootstrap.
- `chords.md` - source spec for the chord library. Check it before adding or changing chords.
- `favicon.ico` - site icon, referenced from `index.html` and copied into `dist/` by the build.
- `build.mjs` - production build: bundles `src/app.ts` and copies `index.html`, `favicon.ico` and `midi/` into `dist/` (gitignored).

Commands live in `Makefile` and `package.json` scripts. Read those rather than trusting a doc to stay in sync.

## Build

`npm run build` runs `tsc --noEmit` then `build.mjs`, which writes `dist/app.js` and `dist/index.html`. The source `index.html` references a plain `app.js`; only the copy in `dist/` gets the `?v=<commit>` cache-buster. **Nothing built is committed.** `dist/` is gitignored, GitHub Pages builds fresh on deploy, and e2e rebuilds before every run.

`make run` (`npm run serve`) is esbuild's dev server on `localhost:8080`: it bundles `src/` in memory on each request and serves `index.html` from the repo root, writing nothing to disk. There is no watch step to run alongside it.

Google Analytics: `src/analytics.ts` reads the GA4 measurement ID from the `GA_MEASUREMENT_ID` env var at build time (another esbuild `--define`), and only reports from `winder.github.io`. Locally the var is unset, so the dev server has analytics off; `npm run test:e2e` builds with a dummy `G-E2ETEST` so `e2e/analytics.test.ts` can check what gets reported (see the e2e-testing skill), and `pages.yml` sets the real one from the GitHub Actions repository variable `GA_MEASUREMENT_ID`. Change the ID in the repo variable, not in code.

Beyond page views the app sends a usage funnel (`midi_unsupported`, `midi_access`, `midi_device_connected`, `first_midi_note`, `first_mouse_note`) and a settings snapshot as GA4 user properties (`level`, `theme`, `visible_keys`, `display_off`, `chords_custom`); the header comment in `src/analytics.ts` is the list of record. Rules: never send a per-note or per-chord event (GA4 drops events past ~500 a session, and the tracker caps at 400); funnel steps go through `analytics().once()`. A `chord_detected` event was built and removed: knowing whether a MIDI device is connected and used is the goal, not what gets played. Event params and user properties are invisible in GA4 reports until registered under Admin > Custom definitions, so adding one means registering it too. Analytics only runs on the live host, so verify new events after a deploy with GA4 DebugView, or locally with the fake-host Playwright pattern in the e2e-testing skill.

Test runner is Node's built-in `node:test` via `tsx`, not jest or vitest. Tests use `describe`/`test` from `node:test` and `node:assert/strict`.

## Testing and verifying UI changes

- `make test` - unit tests.
- `make typecheck` - `tsc --noEmit`. `tsconfig.json` covers both `src` and `e2e`.
- `npm run test:e2e` - rebuilds, then runs every `e2e/*.test.ts` in headless Chromium.

For any change a user would see, run it in the browser. The e2e harness is the way to do that: read `.claude/skills/e2e-testing/SKILL.md` for the one-off script pattern, how to promote a script into a saved regression test, and the harness gotchas. The two that bite most: `e2e/server.ts` serves whatever is in `dist/`, so rebuild before testing, and `downloadJSON()` clicks a detached `<a>`, which bubbles to the document click listener and closes the settings panel.

## Deployment

- **GitHub Pages** is the only deployment: `.github/workflows/pages.yml` runs on push to `master`, builds fresh, and uploads `dist/`. There are no binary releases or version tags.
- **Local dev**: `make run` serves `http://localhost:8080` (see Build). `make stop` kills whatever holds that port, which a prior session often does.

## Git

- `origin` is SSH (`git@github.com:winder/midi-info.git`). Keep it SSH: the HTTPS/gh OAuth token in this environment lacks the `workflow` scope, so pushing a commit that touches `.github/workflows/*` over HTTPS is rejected.
- Conservative profile: commit and push only when asked. At handoff, report changed files, what was run, and the proposed commands.

## Design decisions (decided, not defaults to revisit casually)

### Chord detection

- **Matching is strict**: a chord matches only when the played pitch classes exactly equal a formula's intervals. Partial/core-tone matching was offered and declined. Check with the user before loosening.
- **Perfect 5th (interval `7`) is auto-omittable**: `withoutPerfectFifth()` in `theory.ts` adds a variant of every base formula with the plain 5th removed, under the same symbol. Altered 5ths (`b5`/`#5`, as in `aug`, `7b5`) do not get this; the altered 5th is the point of those chords.
- **9ths are often implied**: `Δ7#11` includes the natural 9 because that is how it is voiced. A real bug report drove this; the 5-note formula was rejecting valid input.
- **Notation uses real jazz symbols**: minor `-`, diminished `°`/`°7`, half-diminished `ø7`, major 7 `Δ7`. Slash chords render tight as `C/E`. Explicitly requested; `m`/`dim`/`Maj7`/`C / E bass` are regressions.
- **Key spelling** (`buildKeyNoteNames`): the 7 diatonic tones use real key-signature math (F# major spells the F key as `E#`); the 5 chromatic tones fall back to a per-key sharp/flat table, since passing-tone spelling has no settled convention.
- **Chord table is user-editable**, persisted in the `chordFormulas` cookie, with JSON Export/Import. `parseChordFormulas` is the single validator for both paths and rejects a malformed table outright rather than defaulting bad entries.

- **Smoothing debounces the readout, not the keyboard**: the keys show raw notes instantly; the chord name waits until the held set stops changing (short wait after a note-on, longer after a note-off). It never guesses at intent, so strict matching still holds. `launchApp()` in `e2e/fixtures.ts` sets it to `off` so tests can read the chord right after `pressKeys()`; pass `{ chordSmoothing }` to test it.

- **MIDI player**: file notes go through the same `noteOn`/`noteOff`/`setSustain` as live input (source `'file'`, which reports no analytics), so keys, sound and chord detection behave as if played. From the first Play or seek until the file ends or another loads, the Chord/Scale Display is set aside (inert, highlights and chord auto-play off) and the player moves above it; otherwise the Chord/Scale Display is on top. Stop (or the end of the file) resets to 0:00 and hands back to the Chord/Scale Display. Pause releases every note and lights the readout's chord in the highlight color; seeking while paused shows the chord at that spot. Loading a file turns sound on and applies its key/mode/sound through the normal setters. A file with no key (an upload without a key signature) is taken as C major. "Play in" transposes the file's notes only, never live input: the ♭/♯ buttons step the real shift (±12) and land on the fewest-accidental spelling (`standardKeyIndex`), the dropdown takes the nearest shift, the Key setting follows so Roman numerals stay the same, and the interval is named by letter (`transpositionLabel`: C to C# is an augmented unison, C to Db a minor 2nd). A tonality dropdown beside it plays the file in another mode on the same tonic (`modeShiftMap`): each scale degree moves to the new mode's, and notes outside the file's mode keep their pitch (no degree to follow; a raised leading tone or secondary dominant usually still makes sense). The player takes a general `pitchMap` (mode first, then the key shift), and the Mode setting follows when the level offers it. Both reset when a file loads. Files with more than one part are rejected, not mixed down: presets are curated.

### Settings and persistence

- **Settings levels** `basic` / `intermediate` / `nerd` progressively disclose content. Gating is data-driven: modes, highlight scales and highlight chords carry a `minLevel` and `app.ts` filters them with `levelAtLeast`. Give new theory content a `minLevel` rather than adding UI branches. The chord and theme editors are separate tabs, always enabled, independent of level.
- **Everything persists in cookies**, one per setting (`level`, `visibleKeys`, `themes`, `themeName`, `chordFormulas`, `chordSmoothing` plus its Advanced `chordSmoothingAttackMs`/`chordSmoothingReleaseMs`, `holdDuration`, the display toggles, and `soundEnabled`, `soundVolume`, `soundPresets`, `soundPresetName`, `midiInput`). Follow the `loadX`/`saveX` pair pattern at the top of `app.ts` for a new setting.
- **Themes are named color sets** in `BUILT_IN_THEMES` (`ui.ts`). Page chrome (top bar, pickers, the collapsible sections) takes its colors from the `--ui-*` tokens in `index.html`, which mix the theme's text color into its background, and `applyTheme` sets `color-scheme` from the background's lightness so native dropdown lists and sliders match. Use the tokens rather than fixed greys, or dark themes get white boxes. Built-ins are always merged back into the saved list, cannot be deleted or renamed, and show as modified in the picker when edited. Named sounds (`BUILT_IN_SOUNDS` in `sound.ts`, the Sound tab) follow the same model; "Play sound" and Volume are global, outside them; effects (Filter envelope, Vibrato, Unison, Reverb) are per-sound toggles whose options reveal like Hold last chord's. A new sound setting gets a neutral default in `ADDED_KNOB_DEFAULTS` so older saves still parse and play unchanged. Any loader for persisted JSON goes through a strict `parse*` function that returns `null` on bad input, mirroring `parseChordFormulas`.
- **Visible keys is a zoom level**, not a range: all 88 keys always exist and the count only sets key width so that many fit the container. The rest scroll.

## Gotchas

- TypeScript's Web MIDI types are incomplete: `MIDIInputMap` has no `.values()`. Use `.forEach` to collect inputs (see `midi.ts`).
- An ID selector's `display` beats the browser's `[hidden] { display: none }`. Any element toggled via the `hidden` attribute whose ID also sets `display` needs an explicit `#id[hidden] { display: none }` rule. `index.html` already has these for the settings panel, chord/theme editor sections and highlighter body; add one for any new toggled section.
- The gtag stub in `analytics.ts` must push the real `arguments` object, as Google's snippet does. gtag.js ignores plain arrays in `dataLayer`, so a rest-parameter version loads the tag, registers the container and sends nothing, with no error anywhere. This shipped once and analytics silently recorded zero hits until it was caught by watching for `collect` requests. Two related non-problems: the config passes `cookie_domain` explicitly because gtag's default probing tries `github.io` first and Firefox logs each rejected attempt as a console error; and Firefox still warns that the cookie's `expires` was clamped to 400 days, which is fine. When checking `collect` traffic, wait: gtag holds events other than `page_view` for about five seconds before sending.
- Web Audio: Chromium's `cancelAndHoldAtTime` breaks mid-`setTargetAtTime` (the ramp after it drops straight to 0), and `AudioParam.value` isn't reliably the live level. `Synth.release` pins the level from `envelopeLevelAt()` instead; keep it that way. To check what the synth actually outputs, tap the limiter with an `AnalyserNode` from a Playwright init script and sample RMS.
- Cookies cap at ~4 KB and an oversized write is dropped silently. `soundPresets` therefore stores only custom and edited sounds (untouched built-ins are rebuilt on load); even so, only ~7 fit. Measure `encodeURIComponent(JSON.stringify(...))` before adding anything big to a cookie.
- `@tonejs/midi` names a key signature by its major key even when the file marks it minor (A minor reads as `'C'` + `'minor'`); `parseSong` converts it. Its writer also encodes key signatures wrongly, so a test needing one builds the bytes by hand (see `player.test.ts`).
- Shell aliases may add `-i` to `cp`/`mv`/`rm`. Use `-f` so nothing blocks on a prompt.
- esbuild's dev server (`make run`) exits as soon as stdin closes. Fine in a terminal, but a script that backgrounds it must hold stdin open (`tail -f /dev/null | npm run serve &`) or it stops before the first request.

## Issue tracking: beads

This project uses **bd (beads)**. Run `bd prime` for full workflow context; the SessionStart hook in `.claude/settings.json` (and `.codex/hooks.json`) does this automatically.

```bash
bd ready                # Find available work
bd show <id>            # View issue details
bd update <id> --claim  # Claim work
bd close <id>           # Complete work
```

- Use `bd` for all task tracking. No TodoWrite, TaskCreate or markdown TODO lists.
- Create the beads issue before writing code; mark it in progress when starting.
- Persist cross-session knowledge with `bd remember "insight"`, searchable via `bd memories <keyword>`. No MEMORY.md files.
- Do not use `bd edit`; it opens `$EDITOR` and hangs.
- Session close: `bd close` finished issues, file issues for follow-up work, run quality gates (`make test`, `make typecheck`, `npm run test:e2e` when UI changed), then `git status` and hand off per the conservative git policy above. `bd dolt push` only when asked.
- Storage: issues live in a local Dolt DB under `.beads/`; sync uses `refs/dolt/data` on the git remote; `.beads/issues.jsonl` is a passive export, not the source of truth. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md.
- Codex users: the `beads` skill at `.agents/skills/beads/SKILL.md` carries the same workflow.
