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
    const resumed = await createDockerSandbox({ identity: sandbox.identity });
    assert.equal(resumed.id, sandbox.id);
    const orphan = await sandbox.spawn({ command: '(sleep 1; touch /tmp/review-orphan) >/dev/null 2>&1 &' });
    await Promise.all([new Response(orphan.stdout).text(), new Response(orphan.stderr).text(), orphan.wait()]);
    await orphan.kill();
    const controller = new AbortController();
    const processHandle = await sandbox.spawn({ command: 'sleep 3; touch /tmp/late-write', abortSignal: controller.signal });
    const streams = Promise.all([new Response(processHandle.stdout).text(), new Response(processHandle.stderr).text()]);
    setTimeout(() => controller.abort(new DOMException('Test cancellation', 'AbortError')), 500);
    await assert.rejects(processHandle.wait(), { name: 'AbortError' });
    await streams;
    const earlyController = new AbortController();
    const early = await sandbox.spawn({ command: 'sleep 3; touch /tmp/early-abort-write', abortSignal: earlyController.signal });
    const earlyStreams = Promise.all([new Response(early.stdout).text(), new Response(early.stderr).text()]);
    earlyController.abort(new DOMException('Immediate cancellation', 'AbortError'));
    await assert.rejects(early.wait(), { name: 'AbortError' });
    await earlyStreams;
    await new Promise(resolve => setTimeout(resolve, 3200));
    assert.equal((await sandbox.run({ command: 'test ! -e /tmp/late-write && test ! -e /tmp/early-abort-write && test ! -e /tmp/review-orphan' })).exitCode, 0);
  } finally {
    delete process.env.SPIKE_SIGNING_SECRET_CANARY;
    await sandbox.destroy();
    await assert.rejects(docker(['inspect', sandbox.id]));
  }
});

test('real resume refuses an externally created container without restrictions', { skip: !process.env.RUN_DOCKER_TESTS, timeout: 30000 }, async () => {
  const { randomUUID } = await import('node:crypto');
  const image = JSON.parse((await docker(['image', 'inspect', 'aquamux-runtime-spike:local'])).toString())[0];
  const identity = { id: `aquamux-runtime-${randomUUID()}`, imageId: image.Id, owner: randomUUID() };
  await docker(['run', '-d', '--name', identity.id, '--label', 'aquamux.runtime-spike=true', '--label', `aquamux.runtime-owner=${identity.owner}`, '--user', 'root', '-p', '127.0.0.1::4000', image.Id, 'sleep', 'infinity']);
  try {
    await assert.rejects(createDockerSandbox({ identity }), { code: 'sandbox-policy-mismatch' });
  } finally {
    await docker(['rm', '-f', identity.id]);
    await assert.rejects(docker(['inspect', identity.id]));
  }
});
