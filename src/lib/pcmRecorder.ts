import { assetUrl } from './assetUrl';

export interface PcmRecording { finish(): Promise<Float32Array>; cancel(): void }
const aborted = () => new DOMException('Recording was cancelled.', 'AbortError');

/** Downsample bounded mono PCM without a server or container-codec dependency. */
export function resample16k(input: Float32Array, sourceRate: number): Float32Array {
  if (!Number.isFinite(sourceRate) || sourceRate < 8000 || sourceRate > 192000) throw Error('Unsupported microphone sample rate.');
  const bounded = input.subarray(0, Math.floor(sourceRate * 30));
  const ratio = sourceRate / 16000, result = new Float32Array(Math.floor(bounded.length / ratio));
  for (let out = 0; out < result.length; out++) {
    const start = out * ratio, end = Math.min((out + 1) * ratio, bounded.length);
    let sum = 0;
    for (let at = Math.floor(start); at < Math.ceil(end); at++) {
      const sample = Number.isFinite(bounded[at]) ? Math.max(-1, Math.min(1, bounded[at])) : 0;
      sum += sample * Math.max(0, Math.min(end, at + 1) - Math.max(start, at));
    }
    result[out] = sum / (end - start);
  }
  return result;
}

/** Recording owns/cleans its AudioContext, including a warmed context passed in. */
export async function startPcmRecording(options: {
  signal: AbortSignal; context?: AudioContext | null; onError?: (error: Error) => void;
}): Promise<PcmRecording> {
  const { signal } = options;
  if (signal.aborted) throw aborted();
  if (!navigator.mediaDevices?.getUserMedia) throw Error('Microphone access needs HTTPS and a supported browser.');
  let context = options.context ?? null, stream: MediaStream | null = null;
  let source: MediaStreamAudioSourceNode | null = null, processor: AudioWorkletNode | ScriptProcessorNode | null = null, gain: GainNode | null = null;
  let workletNode: AudioWorkletNode | null = null, scriptNode: ScriptProcessorNode | null = null;
  let chunks: Float32Array[] = [], count = 0, finishing = false, cleaned = false, ended = false;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let resolveFinish: ((pcm: Float32Array) => void) | null = null, rejectFinish: ((error: Error) => void) | null = null;
  let finishPromise: Promise<Float32Array> | null = null;
  const stopTracks = () => stream?.getTracks().forEach(track => track.stop());
  const cleanup = () => {
    if (cleaned) return; cleaned = true;
    if (flushTimer) clearTimeout(flushTimer);
    signal.removeEventListener('abort', cancel);
    stopTracks();
    if (workletNode) { workletNode.port.onmessage = null; workletNode.onprocessorerror = null; workletNode.port.close(); }
    if (scriptNode) scriptNode.onaudioprocess = null;
    try { source?.disconnect(); processor?.disconnect(); gain?.disconnect(); } catch { /* Already disconnected. */ }
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  };
  const cancel = () => { if (ended) return; ended = true; chunks = []; cleanup(); rejectFinish?.(aborted()); };
  signal.addEventListener('abort', cancel, { once: true });
  const accept = (samples: Float32Array) => {
    if (ended || signal.aborted || !context) return;
    const room = Math.max(0, Math.floor(context.sampleRate * 30) - count);
    const copy = samples.slice(0, room);
    if (copy.length) { chunks.push(copy); count += copy.length; }
  };
  const complete = () => {
    if (ended) return;
    ended = true;
    const mono = new Float32Array(count); let offset = 0;
    for (const chunk of chunks) { mono.set(chunk, offset); offset += chunk.length; }
    chunks = []; const sampleRate = context!.sampleRate; cleanup();
    try { resolveFinish?.(resample16k(mono, sampleRate)); } catch (error) { rejectFinish?.(error as Error); }
  };
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 }, video: false });
    if (signal.aborted || ended) { stopTracks(); throw aborted(); }
    if (!context || context.state === 'closed') context = new AudioContext();
    await context.resume();
    if (signal.aborted || ended) throw aborted();
    source = context.createMediaStreamSource(stream);
    gain = context.createGain(); gain.gain.value = 0;
    if (context.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
      await context.audioWorklet.addModule(assetUrl('assets/pcm-recorder.js'));
      if (signal.aborted || ended) throw aborted();
      const worklet = new AudioWorkletNode(context, 'specky-pcm-recorder', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      processor = worklet; workletNode = worklet;
      worklet.port.onmessage = event => {
        if (event.data?.type === 'samples' && event.data.samples instanceof Float32Array) accept(event.data.samples);
        else if (event.data?.type === 'flushed') complete();
      };
      worklet.onprocessorerror = () => { cancel(); options.onError?.(Error('The microphone audio processor stopped. Please try again.')); };
    } else {
      const script = context.createScriptProcessor(4096, 1, 1); processor = script; scriptNode = script;
      script.onaudioprocess = event => { if (!finishing) accept(event.inputBuffer.getChannelData(0)); event.outputBuffer.getChannelData(0).fill(0); };
    }
    source.connect(processor); processor.connect(gain); gain.connect(context.destination);
    return {
      cancel,
      finish() {
        if (finishPromise) return finishPromise;
        if (signal.aborted || ended) return Promise.reject(aborted());
        finishing = true;
        finishPromise = new Promise<Float32Array>((resolve, reject) => { resolveFinish = resolve; rejectFinish = reject; });
        stopTracks();
        if (workletNode) {
          workletNode.port.postMessage({ type: 'finish' });
          flushTimer = setTimeout(complete, 1000);
        } else complete();
        return finishPromise;
      },
    };
  } catch (error) {
    stopTracks(); cleanup();
    throw signal.aborted ? aborted() : error;
  }
}
