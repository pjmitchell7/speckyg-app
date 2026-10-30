import { LOCAL_SPEECH_MAX_SECONDS, LOCAL_SPEECH_SAMPLE_RATE, type LocalSpeechCommand, type LocalSpeechProgress, type LocalSpeechResponse } from './localSpeechModel';
export { LOCAL_SPEECH_DOWNLOAD_ESTIMATE_MB, LOCAL_SPEECH_MODEL, LOCAL_SPEECH_MODEL_REVISION, LOCAL_SPEECH_SAMPLE_RATE } from './localSpeechModel';
export type { LocalSpeechProgress } from './localSpeechModel';

export class LocalSpeechError extends Error {
  constructor(public code:'cancelled'|'timeout'|'busy'|'unsupported'|'invalid_audio'|'model', message:string){super(message);this.name='LocalSpeechError';}
}
export interface LocalSpeechOptions {signal?:AbortSignal;onProgress?:(progress:LocalSpeechProgress)=>void}
export interface SpeechWorker {
  onmessage:((event:MessageEvent<LocalSpeechResponse>)=>void)|null;
  onerror:((event:ErrorEvent)=>void)|null;
  postMessage(message:LocalSpeechCommand, transfer?:Transferable[]):void;
  terminate():void;
}
type Pending = {id:number;resolve:(value:string|undefined)=>void;reject:(error:Error)=>void;options:LocalSpeechOptions;cleanup:()=>void};
export function localSpeechSupported(){return typeof Worker!=='undefined'&&typeof WebAssembly!=='undefined';}

/** Constructing this object is inert. Only prepare/transcribe starts a worker/download. */
export class LocalSpeech {
  private worker:SpeechWorker|null=null;
  private pending:Pending|null=null;
  private nextId=0;
  private prepared=false;
  constructor(private factory:()=>SpeechWorker=()=>new Worker(new URL('./localSpeech.worker.ts',import.meta.url),{type:'module'})){}
  get ready(){return this.prepared;}
  async prepare(options:LocalSpeechOptions={}):Promise<void>{
    if(options.signal?.aborted)throw new LocalSpeechError('cancelled','Speech setup was stopped.');
    if(this.prepared){options.onProgress?.({phase:'ready'});return;}
    await this.run({operation:'prepare'},options,300_000);
  }
  async transcribe(audio:Float32Array, options:LocalSpeechOptions={}):Promise<string>{
    if(!(audio instanceof Float32Array)||audio.length<160||audio.length>LOCAL_SPEECH_SAMPLE_RATE*LOCAL_SPEECH_MAX_SECONDS||!audio.every(Number.isFinite))throw new LocalSpeechError('invalid_audio','Record a short message, up to 30 seconds.');
    if(options.signal?.aborted)throw new LocalSpeechError('cancelled','Listening was stopped.');
    let energy=0;for(const sample of audio)energy+=sample*sample;
    if(Math.sqrt(energy/audio.length)<.001)return '';
    await this.prepare(options);
    const copy=new Float32Array(audio);
    const result=await this.run({operation:'transcribe',audio:copy},options,120_000);
    return result??'';
  }
  /** Also invalidates queued callbacks; a later call gets a fresh worker and cached model. */
  cancel(){if(this.pending)this.fail(new LocalSpeechError('cancelled','Listening was stopped.'));}
  dispose(){this.fail(new LocalSpeechError('cancelled','Listening was stopped.'));}
  private fail(error:Error){
    const pending=this.pending;this.pending=null;
    if(pending){pending.cleanup();pending.reject(error);}
    const worker=this.worker;this.worker=null;this.prepared=false;
    if(worker){worker.onmessage=null;worker.onerror=null;worker.terminate();}
  }
  private ensureWorker(){
    if(this.worker)return this.worker;
    let worker:SpeechWorker;
    try{worker=this.factory();}catch{throw new LocalSpeechError('unsupported','On-device listening could not start in this browser.');}
    this.worker=worker;
    worker.onmessage=event=>{
      if(this.worker!==worker)return;
      const message=event.data,pending=this.pending;
      if(!pending||message.id!==pending.id)return;
      if(message.type==='progress'){pending.options.onProgress?.(message.progress);return;}
      if(message.type==='error'){this.fail(new LocalSpeechError('model',message.message));return;}
      if(message.type==='ready')this.prepared=true;
      if(message.type==='result'&&(typeof message.text!=='string'||message.text.length>2000)){this.fail(new LocalSpeechError('model','The speech model returned an invalid message. Try again.'));return;}
      pending.cleanup();this.pending=null;
      pending.resolve(message.type==='result'?message.text:undefined);
    };
    worker.onerror=()=>{if(this.worker===worker)this.fail(new LocalSpeechError('model','On-device listening could not load. Check your connection and try again.'));};
    return worker;
  }
  private run(command:{operation:'prepare'}|{operation:'transcribe';audio:Float32Array}, options:LocalSpeechOptions, timeoutMs:number):Promise<string|undefined>{
    if(this.pending)return Promise.reject(new LocalSpeechError('busy','Listening is already getting ready.'));
    if(options.signal?.aborted)return Promise.reject(new LocalSpeechError('cancelled','Listening was stopped.'));
    let worker:SpeechWorker;try{worker=this.ensureWorker();}catch(error){return Promise.reject(error);}
    const id=++this.nextId;
    return new Promise((resolve,reject)=>{
      const abort=()=>this.fail(new LocalSpeechError('cancelled','Listening was stopped.'));
      const timer=setTimeout(()=>this.fail(new LocalSpeechError('timeout','On-device listening took too long. Try again, or use a faster connection for the first download.')),timeoutMs);
      this.pending={id,resolve,reject,options,cleanup:()=>{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}};
      options.signal?.addEventListener('abort',abort,{once:true});
      if(options.signal?.aborted){abort();return;}
      try{worker.postMessage({...command,id},command.operation==='transcribe'?[command.audio.buffer as ArrayBuffer]:[]);}catch{this.fail(new LocalSpeechError('model','On-device listening could not start. Try again.'));}
    });
  }
}
export const createLocalSpeech=()=>new LocalSpeech();
