import { LOCAL_SPEECH_MODEL, LOCAL_SPEECH_MODEL_REVISION, LOCAL_SPEECH_RUNTIME_BASE, type LocalSpeechCommand, type LocalSpeechResponse } from './localSpeechModel';

type Recognizer=(audio:Float32Array,options:Record<string,unknown>)=>Promise<{text:string}|{text:string}[]>;
interface BrowserTransformers {
  env:{allowLocalModels:boolean;useBrowserCache:boolean;useFS:boolean;useFSCache:boolean;backends:{onnx:{wasm:{numThreads:number;proxy:boolean;wasmPaths:string}}}};
  pipeline(task:string,model:string,options:Record<string,unknown>):Promise<Recognizer>;
}
const post=(response:LocalSpeechResponse)=>self.postMessage(response);
let model:Promise<Recognizer>|null=null,busy=false;
async function recognizer(id:number){
  if(model)return model;
  post({id,type:'progress',progress:{phase:'loading'}});
  model=(async()=>{
    // The exact standalone browser distribution bundles its matching ONNX JS.
    // External import keeps this optional runtime/WASM out of the app precache.
    const url=LOCAL_SPEECH_RUNTIME_BASE+'transformers.min.js';
    const transformers=await import(/* @vite-ignore */ url) as BrowserTransformers;
    transformers.env.allowLocalModels=false;transformers.env.useFS=false;transformers.env.useFSCache=false;transformers.env.useBrowserCache=true;
    const wasm=transformers.env.backends.onnx.wasm;
    wasm.numThreads=1;wasm.proxy=false;wasm.wasmPaths=LOCAL_SPEECH_RUNTIME_BASE;
    const files=new Map<string,{loaded:number;total:number}>();let lastProgress=0;
    return transformers.pipeline('automatic-speech-recognition',LOCAL_SPEECH_MODEL,{device:'wasm',dtype:'q8',revision:LOCAL_SPEECH_MODEL_REVISION,
      progress_callback:(event:{status?:string;file?:string;loaded?:number;total?:number})=>{
        if(!event.file)return;
        const previous=files.get(event.file)??{loaded:0,total:0};
        const total=Number.isFinite(event.total)?Math.max(0,event.total!):previous.total;
        const loaded=event.status==='done'?Math.max(total,previous.loaded):Number.isFinite(event.loaded)?Math.max(0,event.loaded!):previous.loaded;
        files.set(event.file,{loaded,total});
        if(performance.now()-lastProgress<120&&event.status!=='done')return;
        lastProgress=performance.now();
        const values=[...files.values()];post({id,type:'progress',progress:{phase:'download',file:event.file,loadedBytes:values.reduce((sum,file)=>sum+file.loaded,0),totalBytes:values.reduce((sum,file)=>sum+file.total,0)}});
      }});
  })();
  try{return await model;}catch(error){model=null;throw error;}
}
self.onmessage=async(event:MessageEvent<LocalSpeechCommand>)=>{
  const command=event.data;if(!command||!Number.isInteger(command.id))return;
  const id=command.id;
  if(busy){post({id,type:'error',message:'On-device listening is already busy.'});return;}
  busy=true;
  try{
    const transcriber=await recognizer(id);
    if(command.operation==='prepare'){post({id,type:'ready'});return;}
    if(!(command.audio instanceof Float32Array)||command.audio.length<160||command.audio.length>480_000||!command.audio.every(Number.isFinite))throw Error('Invalid recording');
    post({id,type:'progress',progress:{phase:'transcribing'}});
    const result=await transcriber(command.audio,{chunk_length_s:30,stride_length_s:0,return_timestamps:false,max_new_tokens:256,do_sample:false});
    const text=(Array.isArray(result)?result.map(part=>part.text).join(' '):result.text).trim();
    if(text.length>2000)throw Error('Oversized transcription');
    post({id,type:'result',text});
  }catch{
    post({id,type:'error',message:'On-device listening could not load or understand the recording. Check your connection for the speech download, then try again.'});
  }finally{busy=false;}
};
