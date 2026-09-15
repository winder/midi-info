// Web MIDI API wrapper: requests access, tracks connected inputs, and
// turns raw MIDI messages into note on/off callbacks.

export interface MidiCallbacks {
  onNoteOn: (midi: number) => void;
  onNoteOff: (midi: number) => void;
  onStatusChange: (text: string, className: string) => void;
  onInputsChange: (inputNames: string[]) => void;
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
  }
}

export function initMIDI(callbacks: MidiCallbacks): void {
  if (!navigator.requestMIDIAccess) {
    callbacks.onStatusChange('Web MIDI API not supported in this browser. Try a different browser.', 'error');
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
    refreshInputList(access);
    access.onstatechange = () => refreshInputList(access);
  }).catch(err => {
    callbacks.onStatusChange('MIDI access denied or unavailable: ' + err.message, 'error');
  });
}
