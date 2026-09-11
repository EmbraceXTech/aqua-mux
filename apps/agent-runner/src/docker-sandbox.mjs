import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

const dockerEnv = () => Object.fromEntries(['PATH', 'HOME', 'DOCKER_HOST', 'DOCKER_CONTEXT'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
export async function docker(args, input) {
  const child = spawn('docker', args, { env: dockerEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
  const chunks = [];
  child.stdout.on('data', chunk => chunks.push(chunk));
  // Docker diagnostics can include process environment. Never relay them.
  child.stderr.resume();
  const exit = new Promise((resolve, reject) => {
    child.once('error', () => reject(new Error('Docker could not start')));
    child.once('close', code => resolve(code));
  });
  child.stdin.on('error', () => {});
  child.stdin.end(input);
  if (await exit !== 0) throw new Error('Docker operation failed');
  return Buffer.concat(chunks);
}

// Receives credentials over stdin, never command arguments or Docker container Env.
const launcher = `
const fs=require('fs'),{spawn}=require('child_process');
let data='';process.stdin.on('data',d=>data+=d);process.stdin.on('end',()=>{
 const p=JSON.parse(data);
 const c=spawn('/bin/sh',['-c',p.command],{cwd:p.cwd,env:{...process.env,...p.env},detached:true,stdio:['ignore','inherit','inherit']});
 fs.writeFileSync(p.pidFile,String(c.pid),{mode:0o600});
 c.on('error',()=>process.exit(127));c.on('exit',(code)=>{try{fs.unlinkSync(p.pidFile)}catch{};process.exit(code??1)});
});`;

export async function createDockerSandbox({ id, image = 'aquamux-runtime-spike:local' } = {}) {
  if (!id) {
    id = `aquamux-runtime-${randomUUID()}`;
    await docker(['run', '-d', '--name', id, '--label', 'aquamux.runtime-spike=true',
      '--init', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--memory=2g', '--cpus=2',
      '--pids-limit=128', '-p', '127.0.0.1::4000', '--user', 'node', '-w', '/home/node', image, 'sleep', 'infinity']);
    await docker(['exec', id, 'mkdir', '-p', '/home/node/workspace']);
  }
  if (!/^aquamux-runtime-[a-f0-9-]+$/.test(id)) throw new Error('Invalid spike container identifier');
  const inspection = JSON.parse((await docker(['inspect', id])).toString())[0];
  if (inspection.Config.Labels?.['aquamux.runtime-spike'] !== 'true' || inspection.Mounts.length) throw new Error('Sandbox must have spike label and no mounts');
  const binding = inspection.NetworkSettings.Ports['4000/tcp']?.[0];
  if (binding?.HostIp !== '127.0.0.1') throw new Error('Bridge must bind loopback only');
  let stopped = false;
  const session = {
    id, defaultWorkingDirectory: '/home/node/workspace', ports: [4000],
    description: 'Disposable local Docker container without host mounts or signing credentials.',
    async getPortEndpoint() { return { url: `http://127.0.0.1:${binding.HostPort}` }; },
    async getPortUrl() { return (await this.getPortEndpoint()).url; },
    async stop() { if (!stopped) { await docker(['stop', '-t', '2', id]); stopped = true; } },
    async destroy() { await docker(['rm', '-f', id]); stopped = true; },
    async spawn({ command, workingDirectory = '/home/node/workspace', env = {}, abortSignal }) {
      abortSignal?.throwIfAborted();
      const pidFile = `/tmp/spike-${randomUUID()}.pid`;
      const child = spawn('docker', ['exec', '-i', '-u', 'node', id, 'node', '-e', launcher], { env: dockerEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
      let finished = false;
      const kill = async () => {
        if (finished) return;
        await docker(['exec', id, 'node', '-e', `try{process.kill(-Number(require('fs').readFileSync(process.argv[1],'utf8')),'SIGKILL')}catch{}`, pidFile]);
        child.kill('SIGTERM');
      };
      const abort = () => { void kill().catch(() => child.kill('SIGKILL')); };
      abortSignal?.addEventListener('abort', abort, { once: true });
      const exit = new Promise((resolve, reject) => {
        child.once('error', () => reject(new Error('Sandbox process could not start')));
        child.once('close', code => {
          finished = true;
          abortSignal?.removeEventListener('abort', abort);
          if (abortSignal?.aborted) reject(abortSignal.reason);
          else resolve({ exitCode: code ?? 1 });
        });
      });
      // Attach a rejection handler before the caller starts consuming streams.
      exit.catch(() => {});
      child.stdin.on('error', () => {});
      child.stdin.end(JSON.stringify({ command, cwd: workingDirectory, env, pidFile }));
      return { stdout: Readable.toWeb(child.stdout), stderr: Readable.toWeb(child.stderr), wait: () => exit, kill };
    },
    async run(options) {
      const proc = await this.spawn(options);
      const [stdout, stderr, { exitCode }] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.wait()]);
      return { stdout, stderr, exitCode };
    },
    async readBinaryFile({ path, abortSignal }) {
      const result = await this.run({ command: `node -e ${quote("const f=require('fs');try{process.stdout.write(f.readFileSync(process.argv[1]).toString('base64'))}catch{process.exit(2)}")} ${quote(path)}`, abortSignal });
      return result.exitCode === 0 ? Buffer.from(result.stdout, 'base64') : null;
    },
    async readFile(options) { const bytes = await this.readBinaryFile(options); return bytes === null ? null : new Blob([bytes]).stream(); },
    async readTextFile(options) {
      const bytes = await this.readBinaryFile(options);
      if (bytes === null) return null;
      const text = new TextDecoder(options.encoding).decode(bytes);
      return options.startLine || options.endLine ? text.split('\n').slice((options.startLine ?? 1) - 1, options.endLine).join('\n') : text;
    },
    async writeBinaryFile({ path, content, abortSignal }) {
      const script = "const f=require('fs'),p=require('path');f.mkdirSync(p.dirname(process.argv[1]),{recursive:true});f.writeFileSync(process.argv[1],Buffer.from(process.argv[2],'base64'))";
      const result = await this.run({ command: `node -e ${quote(script)} ${quote(path)} ${quote(Buffer.from(content).toString('base64'))}`, abortSignal });
      if (result.exitCode) throw new Error('Sandbox file write failed');
    },
    async writeTextFile(options) { await this.writeBinaryFile({ ...options, content: Buffer.from(options.content) }); },
    async writeFile(options) { await this.writeBinaryFile({ ...options, content: new Uint8Array(await new Response(options.content).arrayBuffer()) }); },
  };
  session.restricted = () => Object.fromEntries(["description", "spawn", "run", "readFile", "readBinaryFile", "readTextFile", "writeFile", "writeBinaryFile", "writeTextFile"].map(k => [k, typeof session[k] === "function" ? session[k].bind(session) : session[k]]));
  return session;
}
function quote(value) { return `'${value.replaceAll("'", "'\\''")}'`; }
