import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgent, validateReview } from '../src/runtime.mjs';

test('schema accepts only the complete spike contract', () => {
  assert.deepEqual(validateReview({ status: 'hold', marker: 'ok' }), { status: 'hold', marker: 'ok' });
  for (const input of [null, {}, { status: 'trade', marker: 'ok' }, { status: 'hold', marker: 5 }, { status: 'hold', marker: 'ok', calldata: '0x' }]) {
    assert.throws(() => validateReview(input), /Invalid spike output/);
  }
});
test('provider choice is explicit and never silently substituted', () => {
  assert.equal(createAgent('codex').harnessId, 'codex');
  assert.equal(createAgent('claude').harnessId, 'claude-code');
  assert.throws(() => createAgent('gateway'), /Unknown provider/);
});
