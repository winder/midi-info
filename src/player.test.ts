import { describe, test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Midi } from '@tonejs/midi';
import { MidiPlayer, Song, formatTime, parseSong } from './player';

// A player on mocked time, logging every callback as a short string.
function harness(song: Song) {
  const log: string[] = [];
  let ended = 0;
  const player = new MidiPlayer(song, {
    noteOn: (midi, velocity) => log.push(`on ${midi} ${velocity}`),
    noteOff: midi => log.push(`off ${midi}`),
    pedal: down => log.push(down ? 'pedal down' : 'pedal up'),
    onEnd: () => ended++,
  }, () => Date.now());
  return { log, player, ended: () => ended, advance: (ms: number) => mock.timers.tick(ms) };
}

// Two notes a second apart, the second held under the pedal.
const SONG: Song = {
  duration: 2,
  notes: [
    { midi: 60, start: 0, end: 1, velocity: 90 },
    { midi: 64, start: 1, end: 2, velocity: 70 },
  ],
  pedal: [{ time: 1, down: true }, { time: 2, down: false }],
  keySignature: null,
};

describe('MidiPlayer', () => {
  beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'] }));
  afterEach(() => mock.timers.reset());

  test('plays notes and pedal in time, then ends back at 0', () => {
    const h = harness(SONG);
    h.player.play();
    assert.deepEqual(h.log, ['on 60 90']);
    h.advance(999);
    assert.deepEqual(h.log, ['on 60 90']);
    h.advance(1);
    assert.deepEqual(h.log, ['on 60 90', 'off 60', 'pedal down', 'on 64 70']);
    h.advance(1000);
    assert.deepEqual(h.log.slice(4), ['off 64', 'pedal up']);
    assert.equal(h.ended(), 1);
    assert.equal(h.player.playing, false);
    assert.equal(h.player.position, 0);
  });

  test('pause releases the pedal and notes, and resume does not re-strike them', () => {
    const h = harness(SONG);
    h.player.play();
    h.advance(1500);
    h.log.length = 0;
    h.player.pause();
    assert.deepEqual(h.log, ['pedal up', 'off 64']);
    assert.equal(h.player.position, 1.5);
    h.advance(5000);
    assert.equal(h.player.position, 1.5);
    h.log.length = 0;
    h.player.play();
    assert.deepEqual(h.log, ['pedal down']);
    h.advance(500);
    assert.deepEqual(h.log, ['pedal down', 'pedal up']);
    assert.equal(h.ended(), 1);
  });

  test('stop releases everything and goes back to the start, ready to play again', () => {
    const h = harness(SONG);
    h.player.play();
    h.advance(1500);
    h.log.length = 0;
    h.player.stop();
    assert.deepEqual(h.log, ['pedal up', 'off 64']);
    assert.equal(h.player.playing, false);
    assert.equal(h.player.position, 0);
    h.log.length = 0;
    h.player.play();
    assert.deepEqual(h.log, ['on 60 90']);
    assert.equal(h.ended(), 0);
  });

  test('seek while playing continues from notes that start later', () => {
    const h = harness(SONG);
    h.player.play();
    h.player.seek(0.5);
    assert.deepEqual(h.log, ['on 60 90', 'off 60']);
    h.advance(500);
    assert.deepEqual(h.log.slice(2), ['pedal down', 'on 64 70']);
  });

  test('seek while paused moves without playing anything', () => {
    const h = harness(SONG);
    h.player.seek(1.25);
    assert.deepEqual(h.log, []);
    assert.equal(h.player.playing, false);
    assert.equal(h.player.position, 1.25);
  });

  test('notesAt lists the notes spanning a moment', () => {
    const song: Song = {
      ...SONG,
      notes: [
        { midi: 67, start: 0, end: 2, velocity: 80 },
        { midi: 60, start: 0, end: 1, velocity: 80 },
        { midi: 64, start: 1, end: 2, velocity: 80 },
      ],
    };
    const h = harness(song);
    assert.deepEqual(h.player.notesAt(0.5), [60, 67]);
    assert.deepEqual(h.player.notesAt(1), [64, 67]);
  });

  test('ends with everything released even if an event lies past the duration', () => {
    const song: Song = {
      duration: 1,
      notes: [{ midi: 60, start: 0, end: 1, velocity: 80 }],
      pedal: [{ time: 0, down: true }, { time: 1.5, down: false }],
      keySignature: null,
    };
    const h = harness(song);
    h.player.play();
    h.advance(1000);
    assert.deepEqual(h.log, ['pedal down', 'on 60 80', 'off 60', 'pedal up']);
    assert.equal(h.ended(), 1);
    assert.equal(h.player.playing, false);
  });

  test('a repeated note is lifted before it is struck again', () => {
    const song: Song = {
      ...SONG,
      notes: [
        { midi: 60, start: 0, end: 1, velocity: 80 },
        { midi: 60, start: 1, end: 2, velocity: 80 },
      ],
      pedal: [],
    };
    const h = harness(song);
    h.player.play();
    h.advance(1000);
    assert.deepEqual(h.log, ['on 60 80', 'off 60', 'on 60 80']);
  });
});

describe('parseSong', () => {
  function midiBytes(build: (midi: Midi) => void): Uint8Array {
    const midi = new Midi();
    build(midi);
    return midi.toArray();
  }

  test('reads notes, velocity and pedal', () => {
    const bytes = midiBytes(midi => {
      const track = midi.addTrack();
      track.addNote({ midi: 64, time: 0.5, duration: 0.5, velocity: 1 });
      track.addNote({ midi: 60, time: 0, duration: 1, velocity: 0.5 });
      track.addCC({ number: 64, value: 1, time: 0 });
      track.addCC({ number: 64, value: 0, time: 1.25 });
    });
    const song = parseSong(bytes);
    assert.ok(typeof song !== 'string');
    assert.deepEqual(song.notes.map(n => [n.midi, n.start, n.end, n.velocity]), [[60, 0, 1, 63], [64, 0.5, 1, 127]]);
    assert.deepEqual(song.pedal, [{ time: 0, down: true }, { time: 1.25, down: false }]);
    assert.equal(song.duration, 1.25, 'the duration runs to the last pedal-up');
  });

  // Built by hand: @tonejs/midi's writer encodes key signatures wrongly.
  // One track at 480 ticks per beat: A minor (0 sharps, minor), then one
  // quarter-note middle C.
  function keySignatureFile(sharps: number, minor: boolean): Uint8Array {
    const track = [
      0x00, 0xff, 0x59, 0x02, sharps & 0xff, minor ? 1 : 0,
      0x00, 0x90, 60, 64,
      0x83, 0x60, 0x80, 60, 0,
      0x00, 0xff, 0x2f, 0x00,
    ];
    return new Uint8Array([
      ...new TextEncoder().encode('MThd'), 0, 0, 0, 6, 0, 0, 0, 1, 0x01, 0xe0,
      ...new TextEncoder().encode('MTrk'), 0, 0, 0, track.length, ...track,
    ]);
  }

  test('reads the key signature, naming minor keys by their own tonic', () => {
    const cases: [number, boolean, { key: string; minor: boolean }][] = [
      [0, true, { key: 'A', minor: true }],
      [0, false, { key: 'C', minor: false }],
      [-2, false, { key: 'Bb', minor: false }],
      [3, true, { key: 'F#', minor: true }],
    ];
    for (const [sharps, minor, expected] of cases) {
      const song = parseSong(keySignatureFile(sharps, minor));
      assert.ok(typeof song !== 'string');
      assert.deepEqual(song.keySignature, expected);
    }
  });

  test('a file without a key signature has none', () => {
    const song = parseSong(midiBytes(midi => midi.addTrack().addNote({ midi: 60, time: 0, duration: 1 })));
    assert.ok(typeof song !== 'string');
    assert.equal(song.keySignature, null);
  });

  test('rejects more than one part', () => {
    const bytes = midiBytes(midi => {
      midi.addTrack().addNote({ midi: 60, time: 0, duration: 1 });
      midi.addTrack().addNote({ midi: 64, time: 0, duration: 1 });
    });
    assert.match(String(parseSong(bytes)), /2 instrument parts/);
  });

  test('rejects a file with no notes, and one that is not MIDI', () => {
    assert.match(String(parseSong(midiBytes(midi => midi.addTrack()))), /no notes/);
    assert.match(String(parseSong(new TextEncoder().encode('not a midi file'))), /readable MIDI/);
  });
});

describe('formatTime', () => {
  test('shows m:ss, rounding down', () => {
    assert.equal(formatTime(0), '0:00');
    assert.equal(formatTime(9.99), '0:09');
    assert.equal(formatTime(84.2), '1:24');
    assert.equal(formatTime(600), '10:00');
  });
});
