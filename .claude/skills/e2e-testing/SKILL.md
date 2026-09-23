---
name: e2e-testing
description: Boot the midi-info app and drive it with Playwright, for a one-off manual check or a saved regression test. Use whenever asked to run/test/screenshot the app in a browser, verify a UI change actually works end-to-end, or add/extend an e2e test for a feature or bug fix. Replaces re-bootstrapping Playwright and a static server from scratch each session.
---

# Testing midi-info with Playwright

The app is a static page: `index.html` plus an esbuild bundle. `e2e/` already
has the bootstrap solved - `e2e/server.ts` (serves the built `dist/` on an
ephemeral port) and
`e2e/fixtures.ts` (`launchApp()`, `openSettings()`/`closeSettings()`,
`setLevel()`, `pressKeys()`/`releaseKeys()` to play notes with no MIDI
device, `chordDisplayMain()`, `openHighlighter()`, `highlightedMidis()`).
Playwright is a
devDependency and its Chromium build is already downloaded in this
environment - don't re-solve any of that, import from `e2e/fixtures.ts`.

## Running the existing suite

```bash
npm run test:e2e   # runs `npm run build` first, then every e2e/*.test.ts
```

Always goes through a real rebuild first, so it never tests a stale
`dist/`. If you only need the build step (e.g. before a one-off script),
run `npm run build` yourself.

## One-off manual check (not saved)

For "does this actually work" during development - no test file, just a
throwaway script:

```ts
// /tmp/scratch.ts (or your scratchpad dir)
import { launchApp, openSettings } from '/home/owen/code/midi-info/e2e/fixtures';

const app = await launchApp();
await openSettings(app.page);
// ...interact, assert, or:
await app.page.screenshot({ path: '/tmp/scratch.png' });
await app.close();
```

Run it with `node --import tsx /tmp/scratch.ts` (add `--test` only if you
use `node:test`). Rebuild first (`npm run build`) if you changed anything
under `src/`. Don't leave this file in the repo - it's for looking, not
for posterity.

## Saving it as a regression test

Once a feature or fix is done and worth protecting, promote the same
script into a real test rather than deleting it:

- File: `e2e/<feature>.test.ts` (matched by `npm run test:e2e`'s glob).
- Use `describe`/`test` from `node:test` and `assert` from
  `node:assert/strict`, exactly like `src/*.test.ts` already does.
- `const app = await launchApp()` then `try { ... } finally { await
  app.close(); }` - always close, even on failure, or the browser/server
  leak across tests.
- Prefer asserting on real state (a CSS custom property's computed value,
  `<select>` option lists, downloaded file contents) over screenshots.
  Screenshots are for *you* to look at while developing the test, not for
  the test to assert against.
- See `e2e/theme.test.ts` for a full worked example (named-theme select,
  debug-only editor, export/import, error handling) and
  `e2e/chords.test.ts` for playing notes and reading the chord display
  and highlighted keys.

## Checking what analytics would report

Analytics is host-gated: `shouldTrack()` in `src/analytics.ts` only turns
the tracker on for `winder.github.io`, and the measurement ID is baked in
at build time. So a plain `launchApp()` never records anything. To see
events, use `launchAppAsProduction()` from `e2e/fixtures.ts`: it serves
the same `dist/` under the production origin via `page.route`, stubs the
gtag.js download so nothing reaches Google, and leaves every gtag call in
`window.dataLayer`. Read them with `dataLayerCalls(page)`; each is a tuple
like `['event', 'first_mouse_note', {}]` or
`['set', 'user_properties', {...}]`.

The bundle must carry an ID for this to work. `npm run test:e2e` builds
with a dummy `GA_MEASUREMENT_ID=G-E2ETEST`; a manual script needs the same
prefix on its `npm run build`, or the config call never happens and
`dataLayerCalls` stays empty. `e2e/analytics.test.ts` is the worked
example, and the event/user-property list of record is the header comment
in `src/analytics.ts`.

## Gotchas

- **Rebuild before testing.** `e2e/server.ts` serves whatever is in
  `dist/` - it does not bundle `src/*.ts` on the fly. A change under `src/`
  is invisible to a running test until `npm run build` runs.
  `npm run test:e2e` does this for you; a manual script must do it itself.
- **Programmatic clicks on detached elements bypass panel-close logic.**
  `downloadJSON()` (in `src/ui.ts`) appends a temporary `<a>` straight to
  `document.body` and clicks it. That click bubbles to the document-level
  "click outside closes the settings panel" listener and closes the
  panel, even though the Export button that triggered it lives inside the
  panel. This is real app behavior, not a test bug - reopen the panel
  (`openSettings`) after clicking Export/Import-triggering buttons if you
  need it open for a later step.
- **The open settings panel overlays the top of the page.** Anything
  under it, including the Highlighter toggle, is unclickable until
  `closeSettings()` runs. Playwright reports this as a label from
  `#topBar` intercepting pointer events.
- **If Chromium is ever missing** (`browserType.launch: Executable doesn't
  exist`): run `npx playwright install chromium`. Should not be needed
  here - it's already cached.
