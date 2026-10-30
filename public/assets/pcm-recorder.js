class SpeckyPcmRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(4096);
    this.offset = 0;
    this.finished = false;
    this.port.onmessage = event => {
      if (event.data?.type !== 'finish' || this.finished) return;
      this.flush(); this.finished = true;
      this.port.postMessage({ type: 'flushed' });
    };
  }
  flush() {
    if (!this.offset) return;
    const samples = this.buffer.slice(0, this.offset);
    this.port.postMessage({ type: 'samples', samples }, [samples.buffer]);
    this.offset = 0;
  }
  process(inputs, outputs) {
    for (const channel of outputs[0] ?? []) channel.fill(0);
    if (this.finished) return false;
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (let frame = 0; frame < channels[0].length; frame++) {
      let mono = 0;
      for (const channel of channels) mono += channel[frame] ?? 0;
      this.buffer[this.offset++] = mono / channels.length;
      if (this.offset === this.buffer.length) this.flush();
    }
    return true;
  }
}
registerProcessor('specky-pcm-recorder', SpeckyPcmRecorder);
