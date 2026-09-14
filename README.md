# MIDI Piano

Connects to a MIDI keyboard and shows what notes and chords you're playing on an on-screen keyboard.

## Tech stack

- Go (stdlib only) for a static file server
- HTML/CSS/JS, using the Web MIDI API in the browser (Chrome or Edge only — Firefox and Safari don't support it)

## Run locally

```
go run main.go
```

Then open http://localhost:8080 in Chrome or Edge and allow MIDI access when prompted.
