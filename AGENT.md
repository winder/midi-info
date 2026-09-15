# AGENT.md

MIDI Piano: connects to a MIDI keyboard via the Web MIDI API and renders an on-screen keyboard showing played notes, intervals, and detected chords.

## Layout

- `index.html` - UI layout and CSS only. No inline JS.
- `src/theory.ts` - pure logic, no DOM: note/key spelling, `DEFAULT_CHORD_FORMULAS`, `detectChords`, `parseChordFormulas`.
- `src/midi.ts` - Web MIDI wrapper (`initMIDI`).
- `src/ui.ts` - SVG piano rendering + DOM updates. Functions take data in, don't own state.
- `src/app.ts` - orchestrator: app state, cookie persistence, event wiring, init.
- `src/theory.test.ts` - unit tests (Node's built-in test runner via `tsx`, not jest/vitest). Only `theory.ts` is tested - `ui`/`app`/`midi` are DOM/MIDI-dependent and would need jsdom.
- `chords.md` - source spec for the chord library. Check it before adding/changing chords.
- `app.js` - esbuild bundle of `src/app.ts`. **Committed to git** (see Build below - this is load-bearing, not an oversight).

Commands are in `Makefile` (`make build|run|dev|test|typecheck`) - read it rather than trusting this doc to stay in sync.

## Build - why app.js is committed

GitHub Pages serves this repo statically from `master` with no CI build step, and Go's `//go:embed index.html app.js` in `main.go` needs the file present at `go build` time. Both paths require `app.js` to already exist in the tree, so it's checked into git rather than gitignored.

**After any change under `src/`, run `make build` and commit the updated `app.js` alongside it** - otherwise the deployed site and the embedded Go binary silently keep serving stale JS.

The release workflow (`.github/workflows/release.yml`, triggered by pushing a `v*` tag) runs `npm ci && npm test && npm run build` before `goreleaser`, so a tagged release always embeds freshly-built, test-passing JS regardless of what's committed.

## Deployment

- **GitHub Pages**: https://winder.github.io/midi-info/ - static, auto-redeploys on push to `master` (serves `index.html` + `app.js` directly, no build step).
- **Go binary releases**: `git tag vX.Y.Z && git push origin vX.Y.Z` triggers goreleaser via GitHub Actions, builds linux/darwin/windows binaries with `app.js` embedded.
- **Local dev**: `make run` (builds then `go run main.go`) serves `http://localhost:8080`. A server from a prior session may already be bound to that port - `lsof -ti:8080 -sTCP:LISTEN | xargs -r kill` before restarting.

## Git remote: use SSH, not HTTPS

`origin` is `git@github.com:winder/midi-info.git`. The HTTPS/gh-cli OAuth token available in this environment lacks the `workflow` scope, so pushing any commit that touches `.github/workflows/*` over HTTPS gets rejected. SSH auth isn't subject to that scope restriction.

## Chord detection design (decided, not defaults to revisit casually)

- **Matching is strict**: a chord matches only when the played notes are an exact pitch-class match to a formula's intervals (no more, no fewer). This was an explicit choice (core-tone/partial matching was offered and declined) - don't loosen it without checking with the user first.
- **Perfect 5th (interval `7`) is auto-omittable**: `withoutPerfectFifth()` in `theory.ts` generates a second variant of every base formula that contains a plain perfect 5th, with it removed, under the same symbol. Altered 5ths (`b5`/`#5`, e.g. `aug`, `7b5`) do NOT get this treatment - the altered 5th is the point of those chords.
- **9ths are often implied**: e.g. `Δ7#11` includes the natural 9 by default, because that's how it's actually voiced (confirmed against a real reported bug - the 5-note formula without the 9 was rejecting valid input).
- **Notation uses real jazz symbols**, not ASCII approximations: minor = `-`, diminished = `°`/`°7`, half-diminished = `ø7`, major7 = `Δ7`. Slash/inversion chords render as tight `C/E` (no spaces, no "bass" word). This was explicitly requested - don't revert to `m`/`dim`/`Maj7`/`C / E bass`.
- **Key spelling** (`buildKeyNoteNames`): the 7 diatonic scale tones use real key-signature math (so F# major spells the physical F key as `E#`, not `F`), but the 5 chromatic (non-scale) tones fall back to a simple per-key sharp/flat table, since there's no single settled convention for passing-tone spelling.
- **Chord table is user-editable**: a `chordFormulas` cookie persists edits made via the settings-popup table (add/edit/delete rows), with Export/Import as JSON files. `parseChordFormulas` in `theory.ts` is the single validator for both paths - it's strict (rejects a malformed table outright rather than silently defaulting bad entries).

## Gotchas

- TypeScript's Web MIDI types are incomplete: `MIDIInputMap` has no `.values()`. Use `.forEach` to collect inputs into an array instead (see `midi.ts`).
- CSS specificity trap already hit once: an ID selector's `display` property beats the browser's built-in `[hidden] { display: none }` attribute selector. Any element toggled via the `hidden` attribute needs an explicit `#id[hidden] { display: none }` rule if the same ID also sets `display` unconditionally.
