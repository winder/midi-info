# MIDI Piano

Connects to a MIDI keyboard and shows what notes and chords you're playing on an on-screen keyboard.

## Tech stack

- TypeScript (`src/`), bundled with esbuild
- Static site, deployed to GitHub Pages
- Web MIDI API in the browser

## Run locally

```
make install
make run
```

Then open http://localhost:8080 and allow MIDI access when prompted. Browser support for the Web MIDI API varies, so if it doesn't work try a different browser.

`make run` is esbuild's dev server: it rebundles on every request, so edits under `src/` show up on reload. Other Makefile targets: `make build` (production build into `dist/`), `make test` (unit tests), `make test-e2e` (browser tests), `make typecheck`.
