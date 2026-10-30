/** Exact public browser runtime/model revisions; no hosted inference or API key. */
export const LOCAL_SPEECH_MODEL = 'Xenova/whisper-tiny.en';
export const LOCAL_SPEECH_MODEL_REVISION = '79fb389fc764e7c395bd330e9531d9d32ada7049';
export const LOCAL_SPEECH_LIBRARY_VERSION = '3.8.1';
export const LOCAL_SPEECH_RUNTIME_BASE = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/';
export const LOCAL_SPEECH_DOWNLOAD_ESTIMATE_MB = 75;
export const LOCAL_SPEECH_SAMPLE_RATE = 16_000;
export const LOCAL_SPEECH_MAX_SECONDS = 30;
export interface LocalSpeechProgress {
  phase: 'loading' | 'download' | 'ready' | 'transcribing';
  loadedBytes?: number;
  totalBytes?: number;
  file?: string;
}
export type LocalSpeechCommand = {id:number; operation:'prepare'} | {id:number; operation:'transcribe'; audio:Float32Array};
export type LocalSpeechResponse = {id:number; type:'progress'; progress:LocalSpeechProgress} | {id:number; type:'ready'} | {id:number; type:'result'; text:string} | {id:number; type:'error'; message:string};
