import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyError, turnEvidence, boundedCleanup } from '../src/spike-evidence.mjs';
import { assertSubscriptionEnvironment } from '../src/runtime.mjs';

test('arbitrary provider secrets and text cannot enter evidence', () => {
  for (const secret of ['access_token=synthetic-secret', 'https://example.test?token=synthetic-secret', 'PRIVATE_KEY=synthetic-secret', 'unrecognized-token-format']) {
    const evidence = JSON.stringify({ failure: classifyError(new Error(secret)), turn: turnEvidence({ text: secret, output: { token: secret }, usage: { inputTokens: 2, secret }, events: { [secret]: 1, finish: 1 }, textDeltaTimesMs: [1, secret] }) });
    assert.ok(!evidence.includes(secret));
  }
});
test('cleanup failure remains a closed explicit outcome', async () => {
  const result = await boundedCleanup({ destroy: async () => { throw new Error('secret'); } }, { destroy: async () => { throw new Error('secret'); } });
  assert.deepEqual(result, { runtime: 'unconfirmed', container: 'unconfirmed' });
});
test('subscription factory refuses API and Gateway overrides', () => {
  assertSubscriptionEnvironment({ HOME: '/home/test' });
  for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN', 'OPENAI_BASE_URL']) {
    assert.throws(() => assertSubscriptionEnvironment({ [key]: 'synthetic-secret' }), { code: 'subscription-environment-refused' });
  }
});

test('upstream console and direct stderr diagnostics cannot print secrets', async () => {
  const { spawnSync } = await import('node:child_process');
  const moduleUrl = new URL('../src/spike-evidence.mjs', import.meta.url).href;
  const script = `import {installClosedDiagnostics} from ${JSON.stringify(moduleUrl)}; const counts=installClosedDiagnostics(); console.warn('access_token=synthetic-secret'); console.error('PRIVATE_KEY=synthetic-secret'); process.stderr.write('https://example.test?token=synthetic-secret'); console.log(JSON.stringify(counts));`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), { warnings: 1, errors: 1, stderrChunks: 1 });
});
