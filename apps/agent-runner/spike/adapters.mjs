import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createDockerSandbox } from '../src/docker-sandbox.mjs';
import { isolateHostEnvironment, createAgent, collectTurn } from '../src/runtime.mjs';

import { classifyError, turnEvidence, installClosedDiagnostics, boundedCleanup } from '../src/spike-evidence.mjs';

isolateHostEnvironment();
const diagnostics = installClosedDiagnostics();
const [provider = 'codex', phase = 'prepare'] = process.argv.slice(2);
if (!['codex', 'claude'].includes(provider) || !['prepare', 'resume'].includes(phase)) throw new Error('Use codex|claude prepare|resume');
const directory = resolve(import.meta.dirname, '../.runtime');
await mkdir(directory, { recursive: true, mode: 0o700 });
const statePath = `${directory}/${provider}-session.json`;
const evidencePath = `${directory}/${provider}-${phase}-evidence.json`;
const evidence = { provider, phase, timestamp: new Date().toISOString(), checks: {} };
let previous;
let sandbox;
let session;
let retain = false;
const log = message => console.log(JSON.stringify({ provider, phase, message }));
try {
  previous = phase === 'resume' ? JSON.parse(await readFile(statePath, 'utf8')) : null;
  sandbox = await createDockerSandbox({ identity: previous?.containerIdentity, abortSignal: AbortSignal.timeout(45000) });
  evidence.imageId = sandbox.identity.imageId;
  log('container ready');
  let agent = createAgent(provider);
  session = await agent.createSession({ sandboxSession: sandbox, ...(previous ? { sessionId: previous.sessionId, resumeFrom: previous.resumeFrom } : {}), abortSignal: AbortSignal.timeout(180000) });
  log('session ready');
  if (phase === 'prepare') {
    const marker = `aqua-${randomUUID()}`;
    const result = await collectTurn(agent, session, `Remember this test marker for the next message: ${marker}. Write a 150-word explanation of how rain forms. Do not call tools.`, AbortSignal.timeout(90000));
    if (!result.text || !result.events['text-delta']) throw new Error('No streamed text');
    evidence.checks.streaming = turnEvidence(result);
    const resumeFrom = await session.stop();
    const state = { containerIdentity: sandbox.identity, sessionId: session.sessionId, resumeFrom, marker };
    await writeFile(statePath + '.tmp', JSON.stringify(state), { mode: 0o600 });
    await rename(statePath + '.tmp', statePath);
    session = null;
    retain = true;
    evidence.checks.stopAndPersist = { passed: true, hostPid: process.pid };
    log('runtime stopped; resume state saved privately; process can exit');
  } else {
    const result = await collectTurn(agent, session, 'Return only the test marker from my previous message. Do not call tools.', AbortSignal.timeout(90000));
    if (result.text.trim() !== previous.marker) throw new Error('Session marker was not recovered');
    evidence.checks.restartRecovery = { ...turnEvidence(result), markerMatched: true, hostPid: process.pid };
    await session.destroy();
    session = null;
    agent = createAgent(provider, { structured: true });
    session = await agent.createSession({ sandboxSession: sandbox, abortSignal: AbortSignal.timeout(60000) });
    const structured = await collectTurn(agent, session, 'Return status hold and marker schema-proof. Do not call tools.', AbortSignal.timeout(90000));
    if (structured.output.marker !== 'schema-proof') throw new Error('Unexpected schema marker');
    evidence.checks.structured = { ...turnEvidence(structured), schemaMatched: true };
    await session.destroy();
    session = null;
    agent = createAgent(provider);
    session = await agent.createSession({ sandboxSession: sandbox, abortSignal: AbortSignal.timeout(60000) });
    for (const kind of ['timeout', 'cancellation']) {
      const controller = new AbortController();
      const signal = kind === 'timeout' ? AbortSignal.timeout(1500) : controller.signal;
      const timer = kind === 'cancellation' ? setTimeout(() => controller.abort(new DOMException('Test cancellation', 'AbortError')), 1500) : null;
      const started = Date.now();
      let rejected = false;
      try {
        await collectTurn(agent, session, 'Write a detailed 3000-word essay about rain. Do not call tools.', signal);
      } catch (error) {
        if (!signal.aborted) throw error;
        rejected = true;
      } finally { clearTimeout(timer); }
      if (!rejected) throw new Error(`${kind} did not interrupt the run`);
      evidence.checks[kind] = { passed: true, elapsedMs: Date.now() - started, reason: signal.reason.name };
      // Codex can emit a late abort frame after the host stream closes.
      // Never reuse that bridge for a new review.
      await session.destroy();
      session = null;
      session = await agent.createSession({ sandboxSession: sandbox, abortSignal: AbortSignal.timeout(60000) });
      evidence.checks[kind].recoveryPolicy = 'retire-interrupted-session';
      const recovery = await collectTurn(agent, session, 'Return only RECOVERED. Do not call tools.', AbortSignal.timeout(90000));
      if (recovery.text.trim() !== 'RECOVERED') throw new Error(`Session failed after ${kind}`);
      evidence.checks[`${kind}Recovery`] = { ...turnEvidence(recovery), responseMatched: true };
      log(`${kind} and subsequent turn passed`);
    }
  }
} catch (error) {
  evidence.failure = classifyError(error);
  process.exitCode = 1;
} finally {
  evidence.cleanup = await boundedCleanup(session, sandbox && !retain ? sandbox : null);
  if (evidence.cleanup.runtime === 'unconfirmed' || evidence.cleanup.container === 'unconfirmed') process.exitCode = 1;
  evidence.diagnostics = diagnostics;
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(evidence));
}
