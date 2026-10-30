import test from 'node:test';
import assert from 'node:assert/strict';
import { resample16k, startPcmRecording } from './pcmRecorder';

function fixtures(getMedia?:()=>Promise<any>){
 const track={readyState:'live',stop(){this.readyState='ended';}};
 const stream={getTracks:()=>[track]};
 let disconnected=0;
 const node=()=>({connect(){},disconnect(){disconnected++;}});
 const processor={...node(),onaudioprocess:null as null|((event:any)=>void)};
 const context={state:'running',sampleRate:48000,resume:async()=>{},close:async()=>{context.state='closed';},createMediaStreamSource:()=>node(),createGain:()=>({...node(),gain:{value:1}}),createScriptProcessor:()=>processor,destination:{}};
 Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:{getUserMedia:getMedia??(async()=>stream)}},configurable:true});
 return{track,stream,processor,context,get disconnected(){return disconnected;}};
}

test('microphone resampling preserves level, clamps bad samples and bounds duration',()=>{
 const out=resample16k(new Float32Array(48000).fill(.25),48000);assert.equal(out.length,16000);assert(out.every(v=>v===.25));
 assert.equal(resample16k(new Float32Array(48000*31),48000).length,480000);
 assert(resample16k(Float32Array.from([NaN,Infinity,-2,2]),16000).every(v=>Number.isFinite(v)&&Math.abs(v)<=1));
 assert.throws(()=>resample16k(new Float32Array(1),0));
});

test('finish returns PCM once and closes microphone/context/nodes',async()=>{
 const f=fixtures(),signal=new AbortController().signal;
 const capture=await startPcmRecording({signal,context:f.context as unknown as AudioContext});
 const output=new Float32Array(4800).fill(1);
 f.processor.onaudioprocess!({inputBuffer:{getChannelData:()=>new Float32Array(4800).fill(.25)},outputBuffer:{getChannelData:()=>output}});
 const pending=capture.finish();assert.equal(capture.finish(),pending);
 const pcm=await pending;assert.equal(pcm.length,1600);assert(pcm.every(v=>v===.25));assert(output.every(v=>v===0));
 assert.equal(f.track.readyState,'ended');assert.equal(f.context.state,'closed');assert.equal(f.processor.onaudioprocess,null);assert.equal(f.disconnected,3);
 capture.cancel();assert.equal(f.disconnected,3);
});

test('aborted and late microphone permission resolutions release all capture resources',async()=>{
 const f=fixtures(),control=new AbortController();const capture=await startPcmRecording({signal:control.signal,context:f.context as unknown as AudioContext});
 control.abort();await assert.rejects(capture.finish(),e=>e instanceof DOMException&&e.name==='AbortError');assert.equal(f.track.readyState,'ended');assert.equal(f.context.state,'closed');
 let resolve!:(stream:any)=>void;const late=fixtures(()=>new Promise(r=>{resolve=r})),abort=new AbortController();
 const waiting=startPcmRecording({signal:abort.signal,context:late.context as unknown as AudioContext});abort.abort();resolve(late.stream);
 await assert.rejects(waiting,e=>e instanceof DOMException&&e.name==='AbortError');assert.equal(late.track.readyState,'ended');assert.equal(late.context.state,'closed');
});
