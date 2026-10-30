import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalSpeech, LocalSpeechError, type SpeechWorker } from './localSpeech';
import type { LocalSpeechCommand, LocalSpeechResponse } from './localSpeechModel';
class FixtureWorker implements SpeechWorker {
  onmessage:SpeechWorker['onmessage']=null;onerror:SpeechWorker['onerror']=null;
  messages:LocalSpeechCommand[]=[];terminated=false;
  postMessage(message:LocalSpeechCommand){this.messages.push(message);}
  terminate(){this.terminated=true;}
  reply(response:LocalSpeechResponse){this.onmessage?.({data:response}as MessageEvent<LocalSpeechResponse>);}
}
const audible=()=>Float32Array.from({length:8000},(_,i)=>Math.sin(i/10)*.1);
test('model setup is opt-in; a completed job detaches its abort listener and retains a warm worker',async()=>{
  let starts=0;const worker=new FixtureWorker(),service=new LocalSpeech(()=>{starts++;return worker;});
  assert.equal(starts,0);const controller=new AbortController(),progress:string[]=[];
  const setup=service.prepare({signal:controller.signal,onProgress:value=>progress.push(value.phase)});
  assert.equal(starts,1);const first=worker.messages[0];assert.equal(first.operation,'prepare');
  worker.reply({id:first.id,type:'progress',progress:{phase:'download',loadedBytes:100,totalBytes:200}});
  worker.reply({id:first.id,type:'ready'});await setup;controller.abort();
  assert.equal(service.ready,true);assert.equal(worker.terminated,false);assert.deepEqual(progress,['download']);
  const input=audible(),transcription=service.transcribe(input);
  await new Promise(resolve=>setTimeout(resolve,0));
  const command=worker.messages.at(-1)!;assert.equal(command.operation,'transcribe');
  if(command.operation==='transcribe'){assert.notEqual(command.audio.buffer,input.buffer);assert.equal(command.audio.length,input.length);}
  worker.reply({id:command.id,type:'result',text:'Hello, good morning.'});
  assert.equal(await transcription,'Hello, good morning.');assert.equal(starts,1);service.dispose();
});
test('cancel terminates computation/download and late worker replies cannot complete a replacement job',async()=>{
  const workers:FixtureWorker[]=[];const service=new LocalSpeech(()=>{const worker=new FixtureWorker();workers.push(worker);return worker;});
  const signal=new AbortController(),first=service.prepare({signal:signal.signal}),oldHandler=workers[0].onmessage!;
  signal.abort();await assert.rejects(first,(e:unknown)=>e instanceof LocalSpeechError&&e.code==='cancelled');assert.equal(workers[0].terminated,true);
  const second=service.prepare();let completed=false;void second.then(()=>{completed=true;});
  oldHandler({data:{id:workers[0].messages[0].id,type:'ready'}}as MessageEvent<LocalSpeechResponse>);
  await Promise.resolve();assert.equal(completed,false);assert.equal(service.ready,false);
  workers[1].reply({id:workers[1].messages[0].id,type:'ready'});await second;assert.equal(service.ready,true);service.dispose();
});
test('invalid/oversized/silent audio does not start a worker; busy setup does not duplicate downloads',async()=>{
  let starts=0;const worker=new FixtureWorker(),service=new LocalSpeech(()=>{starts++;return worker;});
  for(const input of [new Float32Array(0),new Float32Array(480001),Float32Array.from({length:8000},()=>NaN)])await assert.rejects(service.transcribe(input),(e:unknown)=>e instanceof LocalSpeechError&&e.code==='invalid_audio');
  assert.equal(await service.transcribe(new Float32Array(8000)),'');assert.equal(starts,0);
  const pending=service.prepare();await assert.rejects(service.prepare(),(e:unknown)=>e instanceof LocalSpeechError&&e.code==='busy');assert.equal(starts,1);
  service.cancel();await assert.rejects(pending);assert.equal(worker.terminated,true);
});
test('worker failure resets model state, while stale IDs cannot resolve an active job',async()=>{
  const workers:FixtureWorker[]=[];const service=new LocalSpeech(()=>{const worker=new FixtureWorker();workers.push(worker);return worker;});
  const first=service.prepare();workers[0].onerror?.({}as ErrorEvent);await assert.rejects(first,(e:unknown)=>e instanceof LocalSpeechError&&e.code==='model');assert.equal(service.ready,false);
  const next=service.prepare(),id=workers[1].messages[0].id;
  workers[1].reply({id:id-1,type:'ready'});assert.equal(service.ready,false);
  workers[1].reply({id,type:'ready'});await next;
  const long=service.transcribe(audible());await new Promise(resolve=>setTimeout(resolve,0));
  workers[1].reply({id:workers[1].messages.at(-1)!.id,type:'result',text:'x'.repeat(2001)});
  await assert.rejects(long);assert.equal(workers[1].terminated,true);assert.equal(service.ready,false);
});
