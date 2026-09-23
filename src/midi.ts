// Web MIDI API wrapper: requests access, tracks connected inputs, and
// turns raw MIDI messages into note on/off callbacks.

const SUSTAIN_PEDAL_CONTROLLER = 64;

export interface MidiCallbacks {
  onNoteOn: (midi: number) => void;
  onNoteOff: (midi: number) => void;
  onSustainChange: (isDown: boolean) => void;
  onStatusChange: (text: string, className: string) => void;
  onInputsChange: (inputNames: string[]) => void;
  // Browser has no Web MIDI API at all (Safari, Firefox).
  onUnsupported: () => void;
  // Outcome of the requestMIDIAccess() permission prompt.
  onAccess: (granted: boolean) => void;
}

function handleMIDIMessage(callbacks: MidiCallbacks, event: MIDIMessageEvent) {
  const data = event.data;
  if (!data) return;
  const [status, data1, data2] = data;
  const command = status & 0xf0;
  if (command === 0x90 && data2 > 0) {
    callbacks.onNoteOn(data1);
  } else if (command === 0x80 || (command === 0x90 && data2 === 0)) {
    callbacks.onNoteOff(data1);
  } else if (command === 0xb0 && data1 === SUSTAIN_PEDAL_CONTROLLER) {
    callbacks.onSustainChange(data2 >= 64);
  }
}

export function initMIDI(callbacks: MidiCallbacks): void {
  if (!navigator.requestMIDIAccess) {
    callbacks.onStatusChange('Web MIDI API not supported in this browser. Try a different browser.', 'error');
    callbacks.onUnsupported();
    return;
  }

  const attachedInputs = new Set<string>();

  function attachInput(input: MIDIInput) {
    if (attachedInputs.has(input.id)) return;
    input.onmidimessage = (event: Event) => handleMIDIMessage(callbacks, event as MIDIMessageEvent);
    attachedInputs.add(input.id);
  }

  function refreshInputList(access: MIDIAccess) {
    const inputs: MIDIInput[] = [];
    access.inputs.forEach(input => inputs.push(input));
    if (inputs.length === 0) {
      callbacks.onStatusChange('No MIDI devices found. Connect a device.', '');
      callbacks.onInputsChange([]);
      return;
    }
    inputs.forEach(attachInput);
    callbacks.onInputsChange(inputs.map(input => input.name || input.id));
    callbacks.onStatusChange(`Connected: listening to ${inputs.length} device(s)`, 'connected');
  }

  navigator.requestMIDIAccess().then(access => {
    callbacks.onAccess(true);
    refreshInputList(access);
    access.onstatechange = () => refreshInputList(access);
  }).catch(err => {
    callbacks.onAccess(false);
    callbacks.onStatusChange('MIDI access denied or unavailable: ' + err.message, 'error');
  });
}
