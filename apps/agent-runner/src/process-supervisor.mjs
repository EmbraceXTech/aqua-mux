import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { docker, dockerEnvironment, DockerOperationError } from './docker-command.mjs';

// Credentials enter over stdin; they never appear in Docker argv or Config.Env.
const launcher = `
const fs = require('fs');
const { spawn } = require('child_process');
let data = '';
process.stdin.on('data', chunk => data += chunk);
process.stdin.on('end', () => {
  const input = JSON.parse(data);
  if (fs.existsSync(input.pidFile + '.cancel')) process.exit(1);
  const child = spawn('/bin/sh', ['-c', input.command], {
    cwd: input.cwd,
    env: { ...process.env, ...input.env },
    detached: true,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  const killGroup = () => {
    try { process.kill(-child.pid, 'SIGKILL'); } catch {}
  };
  fs.writeFileSync(input.pidFile, String(child.pid), { mode: 0o600 });
  if (fs.existsSync(input.pidFile + '.cancel')) killGroup();
  child.on('error', () => process.exit(127));
  child.on('exit', code => {
    killGroup();
    try { fs.unlinkSync(input.pidFile); } catch {}
    process.exit(code ?? 1);
  });
});`;
const terminateGroup = `
const fs = require('fs');
fs.writeFileSync(process.argv[1] + '.cancel', '');
try { process.kill(-Number(fs.readFileSync(process.argv[1], 'utf8')), 'SIGKILL'); } catch {}
`;

export async function spawnSandboxProcess(id, { command, workingDirectory = '/home/node/workspace', env = {}, abortSignal }) {
  abortSignal?.throwIfAborted();
  const pidFile = `/tmp/spike-${randomUUID()}.pid`;
  const child = spawn('docker', ['exec', '-i', '-u', 'node', id, 'node', '-e', launcher], {
    env: dockerEnvironment(), stdio: ['pipe', 'pipe', 'pipe'],
  });
  let finished = false;
  let killPromise;
  const kill = () => {
    if (!killPromise) killPromise = (async () => {
      if (finished) return; // The supervisor already killed its remaining group.
      try { await docker(['exec', id, 'node', '-e', terminateGroup, pidFile], undefined, { timeoutMs: 5000 }); }
      catch { // Fall back to the whole container when process cleanup is uncertain.
        await docker(['kill', id], undefined, { timeoutMs: 5000 });
      } finally { child.kill('SIGKILL'); }
    })();
    return killPromise;
  };
  const abort = () => { void kill().catch(() => child.kill('SIGKILL')); };
  abortSignal?.addEventListener('abort', abort, { once: true });
  const exit = new Promise((resolve, reject) => {
    child.once('error', () => reject(new DockerOperationError('sandbox-process-start-failed')));
    child.once('close', async code => {
      finished = true;
      abortSignal?.removeEventListener('abort', abort);
      if (killPromise) {
        try { await killPromise; }
        catch { reject(new DockerOperationError('sandbox-process-cleanup-unconfirmed')); return; }
      }
      if (abortSignal?.aborted) reject(abortSignal.reason);
      else resolve({ exitCode: code ?? 1 });
    });
  });
  exit.catch(() => {});
  child.stdin.on('error', () => {});
  child.stdin.end(JSON.stringify({ command, cwd: workingDirectory, env, pidFile }));
  if (abortSignal?.aborted) abort();
  return { stdout: Readable.toWeb(child.stdout), stderr: Readable.toWeb(child.stderr), wait: () => exit, kill };
}
