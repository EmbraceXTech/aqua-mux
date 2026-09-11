import { docker } from './docker-command.mjs';
import { acquireContainer } from './container-policy.mjs';
import { spawnSandboxProcess } from './process-supervisor.mjs';
export { docker } from './docker-command.mjs';

/**
 * @param {{ identity?: import('./container-policy.mjs').ContainerIdentity, image?: string, abortSignal?: AbortSignal, restartStopped?: boolean, onAcquiring?: (identity: import('./container-policy.mjs').ContainerIdentity) => void | Promise<void> }} [options]
 */
export async function createDockerSandbox(options = {}) {
  const { identity, binding } = await acquireContainer(docker, options);
  const { id } = identity;
  let stopped = false;
  const session = {
    id, identity, defaultWorkingDirectory: '/home/node/workspace', ports: [4000],
    description: 'Disposable local Docker container without host mounts or signing credentials.',
    async getPortEndpoint() { return { url: `http://127.0.0.1:${binding.HostPort}` }; },
    async getPortUrl() { return (await this.getPortEndpoint()).url; },
    async stop() {
      if (stopped) return;
      await docker(['stop', '-t', '2', identity.instanceId], undefined, { timeoutMs: 10000 });
      stopped = true;
    },
    async destroy() {
      await docker(['rm', '-f', identity.instanceId], undefined, { timeoutMs: 10000 });
      stopped = true;
    },
    spawn(options) { return spawnSandboxProcess(identity.instanceId, options); },
    async run(options) {
      const proc = await this.spawn(options);
      const [stdout, stderr, { exitCode }] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.wait()]);
      return { stdout, stderr, exitCode };
    },
    async readBinaryFile({ path, abortSignal }) {
      const result = await this.run({ command: `node -e ${quote("const f=require('fs');try{process.stdout.write(f.readFileSync(process.argv[1]).toString('base64'))}catch(e){process.exit(e.code==='ENOENT'?2:3)}")} ${quote(path)}`, abortSignal });
      if (result.exitCode === 2) return null;
      if (result.exitCode) throw new Error('Sandbox file read failed');
      return Buffer.from(result.stdout, 'base64');
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
  session.restricted = () => Object.fromEntries([
    'description', 'spawn', 'run', 'readFile', 'readBinaryFile', 'readTextFile',
    'writeFile', 'writeBinaryFile', 'writeTextFile',
  ].map(key => [key, typeof session[key] === 'function' ? session[key].bind(session) : session[key]]));
  return session;
}
function quote(value) { return `'${value.replaceAll("'", "'\\''")}'`; }
