/** Firefox app flow with actual fake-media capture and a routed model fixture. */
import { firefox, expect } from '@playwright/test';
import assert from 'node:assert/strict';
const url=process.argv.find(value=>value.startsWith('--url='))?.slice(6)??'http://127.0.0.1:5173/';
const browser=await firefox.launch({headless:true,firefoxUserPrefs:{'media.navigator.streams.fake':true,'media.navigator.permission.disabled':true,'media.autoplay.default':0}});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await context.addInitScript(()=>{
  const w=window as any; w.__voiceTest={tracks:[]};
  const nativeCanvas=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,kind:string,...args:any[]):any{if(kind.startsWith('webgl'))return null;return(nativeCanvas as any).apply(this,[kind,...args]);}as typeof HTMLCanvasElement.prototype.getContext;
  const media=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia=async constraints=>{const stream=await media(constraints);w.__voiceTest.tracks.push(...stream.getTracks());return stream;};
 });
 let workers=0;
 await context.route('**/*localSpeech.worker*',async route=>{
  workers++;const delay=workers===1?3000:10;
  const body='self.onmessage=e=>{const c=e.data;if(c.operation==="prepare")setTimeout(()=>self.postMessage({id:c.id,type:"ready"}),'+delay+');else{self.postMessage({id:c.id,type:"progress",progress:{phase:"transcribing"}});setTimeout(()=>self.postMessage({id:c.id,type:"result",text:"Hello Specky"}),100);}};';
  await route.fulfill({contentType:'application/javascript',body});
 });
 await context.route('https://text.pollinations.ai/**',route=>route.abort());
 await context.route('https://cdn.jsdelivr.net/**',route=>route.abort());
 await context.route('https://huggingface.co/**',route=>route.abort());
 const page=await context.newPage();const external:string[]=[];
 context.on('request',request=>{if(request.url().startsWith('http')&&!request.url().startsWith(new URL(url).origin))external.push(request.url());});
 await page.goto(url);
 assert.equal(await page.evaluate(()=>!!((window as any).SpeechRecognition||(window as any).webkitSpeechRecognition)),false);
 assert.equal(workers,0);
 await page.getByRole('button',{name:'Talk to SpeckyG',exact:true}).click();
 assert.match(await page.getByRole('dialog').innerText(),/75 MB/);assert.equal(workers,0);
 await page.getByRole('button',{name:'Try scripted voice preview',exact:true}).click();
 await expect.poll(()=>workers).toBe(1);
 await page.getByRole('button',{name:'Cancel voice setup',exact:true}).click();
 await page.waitForTimeout(3200);
 await page.getByRole('button',{name:'Talk to SpeckyG',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>(window as any).__voiceTest.tracks.length),0);
 await page.getByRole('button',{name:'Talk to SpeckyG',exact:true}).click();
 await page.getByRole('button',{name:'Finish speaking',exact:true}).waitFor();
 await page.waitForTimeout(800);await page.getByRole('button',{name:'Finish speaking',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[role=log]')?.textContent?.includes('Hello Specky'));
 await page.waitForFunction(()=>document.querySelectorAll('[role=log] p').length>=3);
 assert.equal(await page.evaluate(()=>(window as any).__voiceTest.tracks.length>0),true);
 assert.equal(await page.evaluate(()=>(window as any).__voiceTest.tracks.every((track:MediaStreamTrack)=>track.readyState==='ended')),true);
 const stop=page.getByRole('button',{name:'Stop Specky’s reply',exact:true});
 if(await stop.isVisible())await stop.click();
 await page.getByRole('button',{name:'Talk to SpeckyG',exact:true}).click();await page.getByRole('button',{name:'Finish speaking',exact:true}).waitFor();
 assert.equal(workers,2);
 await page.getByRole('button',{name:'Cancel recording',exact:true}).click();
 assert.equal(await page.evaluate(()=>(window as any).__voiceTest.tracks.every((track:MediaStreamTrack)=>track.readyState==='ended')),true);
 assert.equal(await page.locator('textarea,input,[contenteditable=true]').count(),0);assert.deepEqual(external,[]);
 console.log(JSON.stringify({browser:await browser.version(),nativeRecognition:false,explicitDownloadConsent:true,noModelBeforeConsent:true,setupCancellationDoesNotOpenMic:true,actualFirefoxFakeMediaCapture:true,recognizedFixtureReachedReply:true,captureTracksClosed:true,warmModelReused:true,recordCancelReleases:true,noTyping:true,externalRequests:0,limits:'Model is a routed fixture here; real production WASM inference and AudioContext cleanup are checked separately. No real microphone, Patois or audible-output claim.'}));
 await context.close();
}finally{await browser.close();}
