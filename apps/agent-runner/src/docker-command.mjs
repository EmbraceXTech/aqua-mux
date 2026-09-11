import { spawn } from 'node:child_process';

export class DockerOperationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'DockerOperationError';
    this.code = code;
  }
}
export function dockerEnvironment() {
  return Object.fromEntries(['PATH', 'HOME', 'DOCKER_HOST', 'DOCKER_CONTEXT']
    .filter(key => process.env[key])
    .map(key => [key, process.env[key]]));
}

// Also exported for controlled subprocess tests that never stop the shared daemon.
export function executeBounded(command, args, { input, abortSignal, timeoutMs = 15000, env = dockerEnvironment() } = {}) {
  if (abortSignal?.aborted) return Promise.reject(new DockerOperationError('docker-aborted'));
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = [];
    let size = 0;
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      abortSignal?.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve(value);
    };
    const stop = code => {
      child.kill('SIGKILL');
      child.stdout.destroy();
      child.stderr.destroy();
      child.stdin.destroy();
      finish(new DockerOperationError(code));
    };
    const abort = () => stop('docker-aborted');
    const timer = setTimeout(() => stop('docker-timeout'), timeoutMs);
    abortSignal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', chunk => {
      size += chunk.length;
      if (size > 8 * 1024 * 1024) stop('docker-output-limit');
      else chunks.push(chunk);
    });
    child.stderr.resume();
    child.once('error', () => finish(new DockerOperationError('docker-start-failed')));
    child.once('close', code => finish(code === 0 ? null : new DockerOperationError('docker-command-failed'), Buffer.concat(chunks)));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
    if (abortSignal?.aborted) abort();
  });
}
export function docker(args, input, options = {}) {
  return executeBounded('docker', args, { ...options, input });
}
