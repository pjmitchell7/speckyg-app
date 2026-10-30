import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TurnGate } from './turnGate';

test('cancel invalidates audio callbacks as well as aborting the request', () => {
  const gate = new TurnGate();
  const first = gate.begin();
  assert.equal(gate.isCurrent(first.id), true);
  gate.cancel();
  assert.equal(first.signal.aborted, true);
  assert.equal(gate.isCurrent(first.id), false);
  const second = gate.begin();
  assert.equal(gate.isCurrent(second.id), true);
  assert.equal(gate.isCurrent(first.id), false);
});

test('beginning a new turn makes every prior pending completion stale', () => {
  const gate = new TurnGate();
  const old = Array.from({length: 20}, () => gate.begin());
  assert.equal(old.filter(t => !t.signal.aborted).length, 1);
  assert.equal(gate.isCurrent(old.at(-1)!.id), true);
  assert.ok(old.slice(0,-1).every(t => !gate.isCurrent(t.id)));
});
