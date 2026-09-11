import test from 'node:test';
import assert from 'node:assert/strict';
import { executeBounded, DockerOperationError } from '../src/docker-command.mjs';
import { acquireContainer } from '../src/container-policy.mjs';

test('hung Docker control command has a bounded deadline', async () => {
  const started = Date.now();
  await assert.rejects(executeBounded(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeoutMs: 50 }), { code: 'docker-timeout' });
  assert.ok(Date.now() - started < 1000);
});
test('Docker control cancellation rejects without exposing stderr', async () => {
  await assert.rejects(executeBounded(process.execPath, ['-e', 'console.error("access_token=synthetic-secret");setInterval(()=>{},1000)'], { abortSignal: AbortSignal.timeout(50) }), error => error.code === 'docker-aborted' && !String(error).includes('synthetic-secret'));
});
test('every post-creation acquisition failure attempts bounded owned cleanup', async () => {
  for (const failureAt of ['run', 'exec', 'inspect']) {
    const calls = [];
    const execute = async (args, input, options) => {
      calls.push({ args, options });
      if (args[0] === 'image') return Buffer.from(JSON.stringify([{ Id: `sha256:${'a'.repeat(64)}` }]));
      if (args[0] === failureAt) throw new DockerOperationError('docker-timeout');
      return Buffer.from(args[0] === 'run' ? 'b'.repeat(64) : '');
    };
    await assert.rejects(acquireContainer(execute), { code: 'docker-timeout' });
    const cleanup = calls.at(-1);
    assert.equal(cleanup.args[0], 'rm');
    assert.ok(/^aquamux-runtime-/.test(cleanup.args[2]) || /^[a-f0-9]{64}$/.test(cleanup.args[2]));
    assert.equal(cleanup.options.timeoutMs, 10000);
  }
});
test('failed acquisition cleanup is explicit', async () => {
  const execute = async args => {
    if (args[0] === 'image') return Buffer.from(JSON.stringify([{ Id: `sha256:${'a'.repeat(64)}` }]));
    throw new DockerOperationError('docker-timeout');
  };
  await assert.rejects(acquireContainer(execute), { code: 'sandbox-acquisition-cleanup-unconfirmed' });
});

test('acquisition awaits durable registration before any container is created', async () => {
  const sequence = [];
  const execute = async args => {
    sequence.push(args[0]);
    if (args[0] === 'image') return Buffer.from(JSON.stringify([{ Id: `sha256:${'a'.repeat(64)}` }]));
    if (args[0] === 'run') throw new DockerOperationError('docker-timeout');
    return Buffer.from('');
  };
  await assert.rejects(acquireContainer(execute, { onAcquiring: async identity => {
    assert.match(identity.id, /^aquamux-runtime-/);
    assert.equal(identity.instanceId, undefined);
    await new Promise(resolve => setTimeout(resolve, 10));
    sequence.push('registered');
  } }), { code: 'docker-timeout' });
  assert.deepEqual(sequence, ['image', 'registered', 'run', 'rm']);
});

test('failed durable registration never creates a container', async () => {
  const calls = [];
  const execute = async args => {
    calls.push(args[0]);
    return Buffer.from(JSON.stringify([{ Id: `sha256:${'a'.repeat(64)}` }]));
  };
  await assert.rejects(acquireContainer(execute, { onAcquiring: async () => { throw new Error('registration failed'); } }));
  assert.deepEqual(calls, ['image']);
});
