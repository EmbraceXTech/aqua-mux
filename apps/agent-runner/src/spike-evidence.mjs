const eventTypes = new Set(['start', 'start-step', 'reasoning-start', 'reasoning-delta', 'reasoning-end', 'text-start', 'text-delta', 'text-end', 'finish-step', 'finish', 'abort', 'error', 'tool-call', 'tool-result']);
const errorCodes = new Set(['docker-aborted', 'docker-timeout', 'docker-output-limit', 'docker-start-failed', 'docker-command-failed', 'sandbox-policy-mismatch', 'sandbox-identity-invalid', 'sandbox-acquisition-cleanup-unconfirmed', 'sandbox-process-start-failed', 'sandbox-process-cleanup-unconfirmed', 'subscription-environment-refused']);
const numeric = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export function classifyError(error) {
  if (errorCodes.has(error?.code)) return { code: error.code };
  if (error?.name === 'TimeoutError') return { code: 'timed-out' };
  if (error?.name === 'AbortError') return { code: 'cancelled' };
  return { code: 'runtime-check-failed' };
}
export function turnEvidence(result) {
  return {
    passed: true,
    events: Object.fromEntries(Object.entries(result.events ?? {}).filter(([key, value]) => eventTypes.has(key) && numeric(value))),
    textDeltaTimesMs: (result.textDeltaTimesMs ?? []).filter(numeric),
    ...(numeric(result.elapsedMs) ? { elapsedMs: result.elapsedMs } : {}),
    usage: Object.fromEntries(['inputTokens', 'outputTokens', 'totalTokens'].filter(key => numeric(result.usage?.[key])).map(key => [key, result.usage[key]])),
  };
}
export function installClosedDiagnostics() {
  // Upstream adapter diagnostic messages are arbitrary strings. Count them only.
  const counts = { warnings: 0, errors: 0, stderrChunks: 0 };
  console.warn = () => { counts.warnings += 1; };
  console.error = () => { counts.errors += 1; };
  process.stderr.write = (chunk, encoding, callback) => {
    counts.stderrChunks += 1;
    const done = typeof encoding === 'function' ? encoding : callback;
    if (done) queueMicrotask(done);
    return true;
  };
  return counts;
}
export async function boundedCleanup(session, sandbox) {
  const result = { runtime: 'not-needed', container: 'not-needed' };
  if (session) {
    let timer;
    try {
      await Promise.race([session.destroy(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error()), 10000); })]);
      result.runtime = 'stopped';
    } catch { result.runtime = 'unconfirmed'; }
    finally { clearTimeout(timer); }
  }
  if (sandbox) {
    try { await sandbox.destroy(); result.container = 'removed'; }
    catch { result.container = 'unconfirmed'; }
  }
  return result;
}
