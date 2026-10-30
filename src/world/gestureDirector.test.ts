import test from 'node:test';
import assert from 'node:assert/strict';
import { GestureDirector, speechGesture, type GestureInput } from './gestureDirector';
const idle: GestureInput = {state:'idle', mood:'warm', reducedMotion:false};
function advance(director: GestureDirector, seconds: number, input = idle) {
  let frame = director.update(0, input);
  for (let i=0; i<Math.round(seconds*20); i++) frame = director.update(.05, input);
  return frame;
}
test('rest opens the scene; all idle clips are occasional, bounded and return to rest', () => {
  let seed=103;
  const director = new GestureDirector(() => {seed=(seed*1664525+1013904223)>>>0;return seed/2**32;}), seen = new Set<string>();
  assert.deepEqual(advance(director, 10), {kind:'rest',amount:0,source:'rest'});
  let activeFrames = 0, restFrames = 0;
  let previousActive='';
  for (let i=0; i<4800; i++) {
    const frame = director.update(.05, idle); seen.add(frame.kind);
    assert(frame.amount>=0 && frame.amount<=1 && Number.isFinite(frame.amount));
    if (frame.kind === 'rest') restFrames++; else activeFrames++;
    if(frame.kind!=='rest'&&frame.amount===0){assert.notEqual(frame.kind,previousActive);previousActive=frame.kind;}
  }
  assert.deepEqual([...seen].sort(), ['crossed','point','rest','stretch']);
  assert(restFrames > activeFrames*2, 'idle must spend most of its time relaxed');
});
test('content cues wait for actual playback and word boundaries; cancellation settles promptly', () => {
  const director = new GestureDirector(() => 1);
  const text = 'Take your time with this. Remember to call your friend.';
  const speaking: GestureInput = {...idle,state:'speaking',speechAge:0,boundaryAge:0,text,replyId:'a',charIndex:2};
  assert.equal(advance(director, 3, {...speaking,state:'thinking'}).kind,'rest');
  assert.equal(advance(director, .5, speaking).kind,'rest');
  assert.equal(advance(director, .5, {...speaking,charIndex:text.indexOf('Remember')}).kind,'point');
  const released = advance(director, .4, {...idle,state:'listening'});
  assert.equal(released.kind,'rest');
  assert.equal(advance(director, 5, {...idle,state:'listening'}).kind,'rest');
});
test('greetings and sensitive replies stay warm; reduced motion suppresses every large pose', () => {
  assert.equal(speechGesture('Mi name SpeckyG. Good fi meet yuh.','warm'),null);
  assert.equal(speechGesture('Remember you can take your time.','gentle'),null);
  assert.equal(speechGesture('Take a breath and relax.','warm')?.kind,'stretch');
  assert.equal(speechGesture('Really? Tell mi more.','curious')?.kind,'crossed');
  const director=new GestureDirector(() => 0); director.trigger('crossed');
  assert.equal(advance(director,1).kind,'crossed');
  assert.equal(advance(director,.05,{...idle,reducedMotion:true}).kind,'rest');
  assert.equal(advance(director,60,{...idle,reducedMotion:true}).kind,'rest');
  const gentle = new GestureDirector(() => 0);
  assert.equal(advance(gentle,60,{...idle,mood:'gentle'}).kind,'rest');
});
test('a replacement manual pose settles through rest instead of snapping between extremes', () => {
  const director = new GestureDirector(() => 1);
  director.trigger('stretch');
  const before = advance(director, 2); assert.equal(before.amount, 1);
  director.trigger('crossed');
  const release = advance(director, .1);
  assert.equal(release.kind, 'stretch'); assert(release.amount > 0 && release.amount < 1);
  const replacement = advance(director, .3);
  assert.equal(replacement.kind, 'crossed'); assert(replacement.amount < .1);
});
test('dropped frames cannot leave a clip stuck or make speech timing run in slow motion', () => {
  const director = new GestureDirector(() => 1); director.trigger('stretch');
  assert.equal(director.update(2,idle).amount,1);
  assert.equal(director.update(3.5,idle).kind,'rest');
  const speech: GestureInput = {...idle,state:'speaking',speechAge:0,boundaryAge:0,replyId:'slow',text:'A little pause. Remember this.'};
  assert.equal(director.update(2,speech).kind,'rest');
  assert.equal(director.update(10,speech).kind,'rest');
  assert.equal(director.update(.05,{...speech,charIndex:speech.text!.indexOf('Remember')}).kind,'rest');
  const fresh={...speech,replyId:'fresh',playbackId:2};
  assert.equal(director.update(.05,{...fresh,charIndex:fresh.text!.indexOf('Remember')}).kind,'point');
  assert.equal(director.update(.4,{...idle,state:'listening'}).kind,'rest');
});

test('a word missed during a manual performance is consumed, never replayed afterward',()=>{
  const d=new GestureDirector(()=>1),text='Take a moment. Remember this.';
  const s:GestureInput={...idle,state:'speaking',replyId:'busy',playbackId:1,text,speechAge:0,boundaryAge:0};
  d.update(.01,s);d.trigger('stretch');advance(d,1,s);
  const word={...s,charIndex:text.indexOf('Remember')};
  assert.equal(d.update(.05,word).source,'manual');
  assert.equal(advance(d,6,word).kind,'rest','missed cue cannot wait behind the manual clip');
  assert.equal(advance(d,2,{...word,charIndex:text.length-1}).kind,'rest');
});

test('old, unknown, passed-word and blocked-frame cues are dropped conservatively',()=>{
  const text='Take a moment. Remember this.',index=text.indexOf('Remember');
  const s:GestureInput={...idle,state:'speaking',replyId:'stale',playbackId:1,text,speechAge:0};
  for(const event of [{charIndex:index,boundaryAge:.351},{charIndex:index},{charIndex:index+8,boundaryAge:0}]){
    const d=new GestureDirector(()=>1);d.update(.01,s);
    assert.equal(d.update(.02,{...s,...event}).kind,'rest');
    assert.equal(d.update(.02,{...s,charIndex:index,boundaryAge:0}).kind,'rest','consumed cue cannot revive');
  }
  const blocked=new GestureDirector(()=>1);blocked.update(.01,s);
  assert.equal(blocked.update(2.2,{...s,charIndex:index,boundaryAge:0}).kind,'rest');
  assert.equal(blocked.update(.02,{...s,charIndex:index,boundaryAge:0}).kind,'rest');
  const opening=new GestureDirector(()=>1);
  assert.equal(opening.update(.02,{...s,text:'Remember this.',speechAge:2}).kind,'rest');
});

test('a fresh playback ID re-arms a repeated reply without requiring an observed idle frame',()=>{
  const d=new GestureDirector(()=>1),text='Take a moment. Remember this.';
  const s:GestureInput={...idle,state:'speaking',replyId:'same-message',playbackId:10,text,speechAge:0,boundaryAge:0};
  d.update(.01,s);assert.equal(d.update(.05,{...s,charIndex:text.indexOf('Remember')}).kind,'point');
  assert.equal(advance(d,4,s).kind,'rest');
  const replay={...s,playbackId:11,charIndex:null};
  assert.equal(d.update(.05,replay).kind,'rest');
  assert.equal(d.update(.05,{...replay,charIndex:text.indexOf('Remember')}).kind,'point');
});
test('late or absent first word events cannot fire a later cue on an estimated clock',()=>{
  const director=new GestureDirector(()=>.5),speech:GestureInput={...idle,state:'speaking',speechAge:0,boundaryAge:0,replyId:'late',text:'Take a moment. Remember this.'};
  assert.equal(advance(director,8,speech).kind,'rest');
  assert.equal(advance(director,.5,{...speech,charIndex:0}).kind,'rest');
  assert.equal(advance(director,.5,{...speech,charIndex:15}).kind,'point');
  const opening=new GestureDirector(()=>.5);
  assert.equal(advance(opening,.5,{...speech,replyId:'opening',text:'Remember this.'}).kind,'point');
  assert.equal(advance(new GestureDirector(),2,{...speech,state:'thinking',text:'Remember this.'}).kind,'rest');
});
