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
  const director = new GestureDirector(() => 0), seen = new Set<string>();
  assert.deepEqual(advance(director, 10), {kind:'rest',amount:0,source:'rest'});
  let activeFrames = 0, restFrames = 0;
  for (let i=0; i<1600; i++) {
    const frame = director.update(.05, idle); seen.add(frame.kind);
    assert(frame.amount>=0 && frame.amount<=1 && Number.isFinite(frame.amount));
    if (frame.kind === 'rest') restFrames++; else activeFrames++;
  }
  assert.deepEqual([...seen].sort(), ['crossed','point','rest','stretch']);
  assert(restFrames > activeFrames*2, 'idle must spend most of its time relaxed');
});
test('content cues wait for actual playback and word boundaries; cancellation settles promptly', () => {
  const director = new GestureDirector(() => 1);
  const text = 'Take your time with this. Remember to call your friend.';
  const speaking: GestureInput = {...idle,state:'speaking',text,replyId:'a',charIndex:2};
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
  const speech: GestureInput = {...idle,state:'speaking',replyId:'slow',text:'A little pause. Remember this.'};
  assert.equal(director.update(2,speech).kind,'point');
  assert.equal(director.update(.4,{...idle,state:'listening'}).kind,'rest');
});
