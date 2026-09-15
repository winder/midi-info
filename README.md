# MIDI Piano

Connects to a MIDI keyboard and shows what notes and chords you're playing on an on-screen keyboard.

## Tech stack

- Go (stdlib only) for a static file server
- TypeScript (`src/`), bundled with esbuild into `app.js`
- Web MIDI API in the browser

## Run locally

```
make install
make run
```

Then open http://localhost:8080 and allow MIDI access when prompted. Browser support for the Web MIDI API varies, so if it doesn't work try a different browser.

Other Makefile targets: `make dev` (rebuild `app.js` on save), `make test` (unit tests), `make typecheck`.
