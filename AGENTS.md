# AGENTS.md

MIDI Piano: connects to a MIDI keyboard via the Web MIDI API and renders an on-screen keyboard showing played notes, intervals, detected chords and Roman numerals. Live at https://winder.github.io/midi-info/.

## Layout

- `index.html` - UI layout and CSS only. No inline JS.
- `src/theory.ts` - pure music theory, no DOM: key/mode spelling, chord formulas, `detectChords`, `romanNumeralLabel`, highlight scales/chords, `parseChordFormulas`.
- `src/midi.ts` - Web MIDI wrapper (`initMIDI`).
- `src/ui.ts` - SVG piano rendering, DOM helpers, themes and fonts. Functions take data in and own no state.
- `src/app.ts` - orchestrator: all app state, cookie persistence, event wiring, init.
- `src/theory.test.ts` - unit tests. Only `theory.ts` is unit-tested; `ui`/`app`/`midi` need a browser and are covered by e2e.
- `e2e/` - Playwright tests against the built bundle. `fixtures.ts` (`launchApp`, `openSettings`) and `server.ts` are the shared bootstrap.
- `chords.md` - source spec for the chord library. Check it before adding or changing chords.
- `app.js` - esbuild bundle of `src/app.ts`, **committed to git** (see Build).
- `main.go` - stdlib static server that embeds `index.html` and `app.js`.

Commands live in `Makefile` and `package.json` scripts. Read those rather than trusting a doc to stay in sync.

## Build

`npm run build` does three things: `tsc --noEmit`, esbuild `src/app.ts` into `app.js`, and rewrites the `app.js?v=<hash>` cache-buster in `index.html`. The hash is `git rev-parse --short HEAD`, so **a build stamps the current HEAD, and a commit that includes the build is therefore stamped one commit behind**. That is expected. CI rebuilds on deploy so the live site gets the right hash.

`app.js` is committed because `//go:embed` in `main.go` needs it present at `go build` time, and `make run` builds and runs the Go server directly. **After any change under `src/`, run `make build` and commit the updated `app.js` and `index.html` alongside it**, or the local Go binary silently serves stale JS.

Test runner is Node's built-in `node:test` via `tsx`, not jest or vitest. Tests use `describe`/`test` from `node:test` and `node:assert/strict`.

## Testing and verifying UI changes

- `make test` - unit tests.
- `make typecheck` - `tsc --noEmit`. `tsconfig.json` covers both `src` and `e2e`.
- `npm run test:e2e` - rebuilds, then runs every `e2e/*.test.ts` in headless Chromium.

For any change a user would see, run it in the browser. The e2e harness is the way to do that: read `.claude/skills/e2e-testing/SKILL.md` for the one-off script pattern, how to promote a script into a saved regression test, and the harness gotchas. The two that bite most: `e2e/server.ts` serves whatever `app.js` is on disk, so rebuild before testing, and `downloadJSON()` clicks a detached `<a>`, which bubbles to the document click listener and closes the settings panel.

## Deployment

- **GitHub Pages**: `.github/workflows/pages.yml` runs on push to `master`, builds fresh, and deploys `index.html` + `app.js`.
- **Go binary releases**: `git tag vX.Y.Z && git push origin vX.Y.Z` triggers `.github/workflows/release.yml`, which runs `npm ci && npm test && npm run build` and then goreleaser for linux/darwin/windows.
- **Local dev**: `make run` serves `http://localhost:8080`. `make stop` kills whatever holds that port, which a prior session often does. `make dev` rebuilds `app.js` on save but does not serve.

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

### Settings and persistence

- **Settings levels** `basic` / `intermediate` / `nerd` progressively disclose content. Gating is data-driven: modes, highlight scales and highlight chords carry a `minLevel` and `app.ts` filters them with `levelAtLeast`. Give new theory content a `minLevel` rather than adding UI branches. The chord and theme editors are separate tabs, always enabled, independent of level.
- **Everything persists in cookies**, one per setting (`level`, `visibleKeys`, `themes`, `themeName`, `chordFormulas`). Follow the `loadX`/`saveX` pair pattern at the top of `app.ts` for a new setting.
- **Themes are named color sets** in `BUILT_IN_THEMES` (`ui.ts`). Built-ins are always merged back into the saved list, cannot be deleted or renamed, and show as modified in the picker when edited. Any loader for persisted JSON goes through a strict `parse*` function that returns `null` on bad input, mirroring `parseChordFormulas`.
- **Visible keys is a zoom level**, not a range: all 88 keys always exist and the count only sets key width so that many fit the container. The rest scroll.

## Gotchas

- TypeScript's Web MIDI types are incomplete: `MIDIInputMap` has no `.values()`. Use `.forEach` to collect inputs (see `midi.ts`).
- An ID selector's `display` beats the browser's `[hidden] { display: none }`. Any element toggled via the `hidden` attribute whose ID also sets `display` needs an explicit `#id[hidden] { display: none }` rule. `index.html` already has these for the settings panel, chord/theme editor sections and highlighter body; add one for any new toggled section.
- Shell aliases may add `-i` to `cp`/`mv`/`rm`. Use `-f` so nothing blocks on a prompt.

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
