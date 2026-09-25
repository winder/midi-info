// Web MIDI API wrapper: requests access, tracks connected inputs, and
// turns raw MIDI messages into note on/off callbacks. Also the pure model
// behind the top bar's MIDI picker (midiPickerModel), which is DOM-free so
// it can be unit-tested in node.

const SUSTAIN_PEDAL_CONTROLLER = 64;

// Where MIDI stands, for the UI to render.
export type MidiState =
  | { kind: 'checking' }
  | { kind: 'unsupported' }
  | { kind: 'denied'; message: string }
  | { kind: 'ready'; inputs: string[] }; // device names, possibly empty

export interface MidiCallbacks {
  // velocity is the raw 1-127 key velocity.
  onNoteOn: (midi: number, velocity: number) => void;
  onNoteOff: (midi: number) => void;
  onSustainChange: (isDown: boolean) => void;
  onStateChange: (state: MidiState) => void;
  // Browser has no Web MIDI API at all (Safari).
  onUnsupported: () => void;
  // Outcome of the requestMIDIAccess() permission prompt.
  onAccess: (granted: boolean) => void;
}

export interface MidiController {
  // Listen to only the device with this name, or to every device (null).
  // A name that isn't connected also means every device, so a preferred
  // device that's unplugged doesn't silence the others.
  setInputFilter(name: string | null): void;
}

function inputName(input: MIDIInput): string {
  return input.name || input.id;
}

function handleMIDIMessage(callbacks: MidiCallbacks, event: MIDIMessageEvent) {
  const data = event.data;
  if (!data) return;
  const [status, data1, data2] = data;
  const command = status & 0xf0;
  if (command === 0x90 && data2 > 0) {
    callbacks.onNoteOn(data1, data2);
  } else if (command === 0x80 || (command === 0x90 && data2 === 0)) {
    callbacks.onNoteOff(data1);
  } else if (command === 0xb0 && data1 === SUSTAIN_PEDAL_CONTROLLER) {
    callbacks.onSustainChange(data2 >= 64);
  }
}

export function initMIDI(callbacks: MidiCallbacks): MidiController {
  let filter: string | null = null;
  let connected: string[] = [];
  const listening = (input: MIDIInput) =>
    filter === null || !connected.includes(filter) || inputName(input) === filter;

  const controller: MidiController = {
    setInputFilter(name) {
      filter = name;
    },
  };

  callbacks.onStateChange({ kind: 'checking' });
  if (!navigator.requestMIDIAccess) {
    callbacks.onStateChange({ kind: 'unsupported' });
    callbacks.onUnsupported();
    return controller;
  }

  const attachedInputs = new Set<string>();

  function attachInput(input: MIDIInput) {
    if (attachedInputs.has(input.id)) return;
    input.onmidimessage = (event: Event) => {
      if (listening(input)) handleMIDIMessage(callbacks, event as MIDIMessageEvent);
    };
    attachedInputs.add(input.id);
  }

  function refreshInputList(access: MIDIAccess) {
    const inputs: MIDIInput[] = [];
    access.inputs.forEach(input => inputs.push(input));
    inputs.forEach(attachInput);
    connected = inputs.map(inputName);
    callbacks.onStateChange({ kind: 'ready', inputs: connected });
  }

  navigator.requestMIDIAccess().then(access => {
    callbacks.onAccess(true);
    refreshInputList(access);
    access.onstatechange = () => refreshInputList(access);
  }).catch(err => {
    callbacks.onAccess(false);
    callbacks.onStateChange({ kind: 'denied', message: err.message });
  });
  return controller;
}

// ---- Top-bar MIDI picker ----

// The picker's "All devices" entry. Safe as a sentinel: a connected
// device always has a name (or falls back to its id).
export const ALL_DEVICES = '';

export interface MidiPickerModel {
  options: { value: string; label: string }[];
  value: string;
  // Nothing to choose: the single option is just the status.
  disabled: boolean;
  // The full story, for the hover tooltip.
  title: string;
  error: boolean;
}

// What the MIDI picker shows for a state. Its selected entry is the status
// ("All devices (2)", "No MIDI device"...), so a separate status line isn't
// needed; the tooltip carries the detail. `preferred` is the device the
// user picked, which only takes effect while it's connected.
export function midiPickerModel(state: MidiState, preferred: string | null): MidiPickerModel {
  const status = (label: string, title: string, error = false): MidiPickerModel =>
    ({ options: [{ value: ALL_DEVICES, label }], value: ALL_DEVICES, disabled: true, title, error });
  switch (state.kind) {
    case 'checking':
      return status('Checking MIDI…', 'Checking for Web MIDI support…');
    case 'unsupported':
      return status('No Web MIDI',
        'This browser doesn’t support Web MIDI, so a MIDI keyboard can’t connect. Try Chrome, Edge or Firefox. You can still play the on-screen keys.', true);
    case 'denied':
      return status('MIDI blocked',
        `MIDI access was denied or is unavailable (${state.message}). Allow MIDI for this site in your browser’s site settings, then reload.`, true);
    case 'ready': {
      if (state.inputs.length === 0) {
        return status('No MIDI device', 'No MIDI devices found. Connect one and it’s picked up automatically.');
      }
      const value = preferred !== null && state.inputs.includes(preferred) ? preferred : ALL_DEVICES;
      const listeningTo = value === ALL_DEVICES ? state.inputs.join(', ') : value;
      return {
        options: [
          { value: ALL_DEVICES, label: `All devices (${state.inputs.length})` },
          ...state.inputs.map(name => ({ value: name, label: name })),
        ],
        value,
        disabled: false,
        title: `Listening to: ${listeningTo}. Pick one device to ignore the others.`,
        error: false,
      };
    }
  }
}
