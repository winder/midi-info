import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_DEVICES, MidiState, midiPickerModel } from './midi';

describe('midiPickerModel', () => {
  test('without devices, the single disabled entry is the status', () => {
    const cases: [MidiState, string, boolean][] = [
      [{ kind: 'checking' }, 'Checking MIDI…', false],
      [{ kind: 'unsupported' }, 'No Web MIDI', true],
      [{ kind: 'denied', message: 'Permission denied' }, 'MIDI blocked', true],
      [{ kind: 'ready', inputs: [] }, 'No MIDI device', false],
    ];
    for (const [state, label, error] of cases) {
      const model = midiPickerModel(state, null);
      assert.deepEqual(model.options, [{ value: ALL_DEVICES, label }]);
      assert.equal(model.disabled, true);
      assert.equal(model.error, error);
      assert.ok(model.title.length > 0);
    }
  });

  test('the denied tooltip carries the browser’s reason and the fix', () => {
    const { title } = midiPickerModel({ kind: 'denied', message: 'Permission denied' }, null);
    assert.match(title, /Permission denied/);
    assert.match(title, /site settings/);
  });

  test('with devices: All devices first, then each device', () => {
    const model = midiPickerModel({ kind: 'ready', inputs: ['Keys', 'Pads'] }, null);
    assert.deepEqual(model.options.map(o => o.label), ['All devices (2)', 'Keys', 'Pads']);
    assert.equal(model.value, ALL_DEVICES);
    assert.equal(model.disabled, false);
    assert.match(model.title, /Listening to: Keys, Pads/);
  });

  test('a preferred device is selected while connected, and ignored while not', () => {
    assert.equal(midiPickerModel({ kind: 'ready', inputs: ['Keys', 'Pads'] }, 'Pads').value, 'Pads');
    assert.match(midiPickerModel({ kind: 'ready', inputs: ['Keys', 'Pads'] }, 'Pads').title, /Listening to: Pads\./);
    assert.equal(midiPickerModel({ kind: 'ready', inputs: ['Keys'] }, 'Pads').value, ALL_DEVICES);
  });
});
