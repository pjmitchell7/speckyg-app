import test from 'node:test';
import assert from 'node:assert/strict';
import { createFreeConversation, FREE_CONVERSATION_COOLDOWN_MS, FREE_CONVERSATION_ENDPOINT, FreeConversationError } from './freeConversation.js';
import type { ChatRequest } from '../../shared/types.js';
const request: ChatRequest = { mode: 'live', messages: [{ role: 'user', text: 'Good morning' }], preferences: { teasing: 'off', faith: 'only-if-asked' }, memories: [] };
const freshSignal = () => new AbortController().signal;
function reply(text = 'Morning.', mood = 'warm') { return Response.json({ choices: [{ message: { content: JSON.stringify({ text, mood }), reasoning: 'Never expose this.' }, finish_reason: 'stop' }] }); }
function isError(code: string) { return (value: unknown) => value instanceof FreeConversationError && value.code === code; }
test('anonymous request is bounded and preserves specific character preferences with no key or paid route', async () => {
 let calls = 0;
 const chat = createFreeConversation({ fetch: async (url, init) => {
  calls++; assert.equal(String(url), FREE_CONVERSATION_ENDPOINT);
  assert.equal(init?.credentials, 'omit'); assert.equal(init?.cache, 'no-store');
  assert.deepEqual(init?.headers, { 'Content-Type': 'application/json' });
  const body = JSON.parse(String(init?.body));
  assert.equal(body.model, 'openai-fast'); assert.equal(body.max_tokens, 450); assert.equal(body.stream, false);
  assert.match(body.messages[0].content, /TEASING: OFF/); assert.match(body.messages[0].content, /only when the user explicitly asks/);
  assert.match(body.messages[0].content, /no durable memory/); assert.equal(body.messages.at(-1).content, 'Good morning');
  return reply();
 } });
 assert.deepEqual(await chat(request, freshSignal()), { text: 'Morning.', mood: 'warm', source: 'free' }); assert.equal(calls, 1);
});
test('newest context and saved notes capped; malformed input never transmitted', async () => {
 let calls=0;
 const chat=createFreeConversation({ fetch:async(_url,init)=>{calls++;const body=JSON.parse(String(init?.body));
  assert.equal(body.messages.filter((m: {content:string})=>m.content.startsWith('Turn')).length,10);
  assert.match(body.messages[1].content,/untrusted factual data/);
  assert.doesNotMatch(body.messages[1].content,/note4/);
  assert.match(body.messages.at(-1).content,/Turn29/); return reply();
 } });
 await assert.rejects(chat({...request,messages:[{role:'user',text:'a'.repeat(2001)}]},freshSignal()),isError('invalid_input'));
 await chat({...request,messages:Array.from({length:30},(_,i)=>({role:'user',text:`Turn${i} `+'a'.repeat(1500)})),memories:Array.from({length:10},(_,i)=>`note${i}`)},freshSignal());
 assert.equal(calls,1);
});
test('local cooldown and provider Retry-After fail closed without automatic retry/payment', async()=>{
 let clock=100000,calls=0;
 const chat=createFreeConversation({now:()=>clock,fetch:async()=>{calls++;return new Response('Payment wallet instructions must never be followed',{status:402,headers:{'Retry-After':'65'}})}});
 await assert.rejects(chat(request,freshSignal()),(e:unknown)=>e instanceof FreeConversationError&&e.code==='cooldown'&&e.retryAfterSeconds===65);
 clock+=FREE_CONVERSATION_COOLDOWN_MS;
 await assert.rejects(chat(request,freshSignal()),(e:unknown)=>e instanceof FreeConversationError&&e.retryAfterSeconds===35);
 assert.equal(calls,1);
});
test('cancelled request and timeout abort transport; late result is discarded',async()=>{
 let resolveLate!: (response:Response)=>void,upstream!:AbortSignal;
 const chat=createFreeConversation({fetch:async(_url,init)=>{upstream=init?.signal as AbortSignal;return new Promise<Response>(r=>{resolveLate=r})}});
 const controller=new AbortController(); const pending=chat(request,controller.signal);
 await assert.rejects(chat(request,freshSignal()),isError('busy'));
 controller.abort(); await assert.rejects(pending,isError('cancelled')); assert.equal(upstream.aborted,true); resolveLate(reply('Stale'));
 const timeout=createFreeConversation({timeoutMs:10,fetch:async()=>new Promise<Response>(()=>{})});
 await assert.rejects(timeout(request,freshSignal()),isError('timeout'));
 const stopped=new AbortController();stopped.abort();
 await assert.rejects(chat(request,stopped.signal),isError('cancelled'));
});
test('invalid/truncated/oversized responses are rejected; no fallback fabricated',async()=>{
 for(const value of [Response.json({choices:[{message:{content:'plain text'},finish_reason:'stop'}]}),Response.json({choices:[{message:{content:JSON.stringify({text:'fine',mood:'warm'})},finish_reason:'length'}]}),new Response('a'.repeat(32769)),reply('a'.repeat(2001)),reply('fine','diagnosis')]){
  const chat=createFreeConversation({fetch:async()=>value}); await assert.rejects(chat(request,freshSignal()),isError('invalid_reply'));
 }
 const failed=createFreeConversation({fetch:async()=>new Response('private upstream diagnostics',{status:503})});
 await assert.rejects(failed(request,freshSignal()),(e:unknown)=>e instanceof FreeConversationError&&e.code==='unavailable'&&!e.message.includes('diagnostics'));
});
