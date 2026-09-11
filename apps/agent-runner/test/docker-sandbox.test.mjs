import test from 'node:test';
import assert from 'node:assert/strict';
import { createDockerSandbox, docker } from '../src/docker-sandbox.mjs';

test('real container transport isolates host files and environment and kills aborted work', { skip: !process.env.RUN_DOCKER_TESTS, timeout: 30000 }, async () => {
  process.env.SPIKE_SIGNING_SECRET_CANARY = 'synthetic-only';
  const sandbox = await createDockerSandbox();
  try {
    const info = JSON.parse((await docker(['inspect', sandbox.id])).toString())[0];
    assert.deepEqual(info.Mounts, []);
    assert.equal(info.Config.User, 'node');
    assert.ok(info.HostConfig.CapDrop.includes('ALL'));
    assert.equal(info.NetworkSettings.Ports['4000/tcp'][0].HostIp, '127.0.0.1');
    const check = await sandbox.run({ command: 'test -z "$SPIKE_SIGNING_SECRET_CANARY" && test ! -e /Users/sainytk && test ! -e /var/run/docker.sock' });
    assert.equal(check.exitCode, 0);
    await sandbox.writeTextFile({ path: '/home/node/workspace/test.txt', content: 'one\ntwo\nthree' });
    assert.equal(await sandbox.readTextFile({ path: '/home/node/workspace/test.txt', startLine: 2, endLine: 2 }), 'two');
    assert.equal(await sandbox.readTextFile({ path: '/home/node/workspace/missing' }), null);
    const restricted = sandbox.restricted();
    assert.equal(restricted.destroy, undefined);
    const controller = new AbortController();
    const processHandle = await sandbox.spawn({ command: 'sleep 3; touch /tmp/late-write', abortSignal: controller.signal });
    const streams = Promise.all([new Response(processHandle.stdout).text(), new Response(processHandle.stderr).text()]);
    setTimeout(() => controller.abort(new DOMException('Test cancellation', 'AbortError')), 500);
    await assert.rejects(processHandle.wait(), { name: 'AbortError' });
    await streams;
    await new Promise(resolve => setTimeout(resolve, 3200));
    assert.equal((await sandbox.run({ command: 'test ! -e /tmp/late-write' })).exitCode, 0);
  } finally {
    delete process.env.SPIKE_SIGNING_SECRET_CANARY;
    await sandbox.destroy();
  }
});
