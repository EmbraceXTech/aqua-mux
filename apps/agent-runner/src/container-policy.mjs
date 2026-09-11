import { randomUUID } from 'node:crypto';
import { DockerOperationError } from './docker-command.mjs';

export const DEFAULT_IMAGE = 'aquamux-runtime-spike:local';
export function containerArguments(id, imageId, owner) {
  return ['run', '-d', '--name', id, '--label', 'aquamux.runtime-spike=true',
    '--label', `aquamux.runtime-owner=${owner}`, '--init', '--cap-drop=ALL',
    '--security-opt=no-new-privileges', '--memory=2g', '--cpus=2', '--pids-limit=128',
    '-p', '127.0.0.1::4000', '--user', 'node', '-w', '/home/node', imageId, 'sleep', 'infinity'];
}
export function validateContainer(info, identity, { allowStopped = false } = {}) {
  const config = info.HostConfig;
  const bindings = info.State.Running ? info.NetworkSettings.Ports : config.PortBindings;
  const restrictionsHold = info.Id === identity.instanceId
    && info.Name === `/${identity.id}`
    && info.Image === identity.imageId
    && info.Config.Labels?.['aquamux.runtime-spike'] === 'true'
    && info.Config.Labels?.['aquamux.runtime-owner'] === identity.owner
    && (info.State.Running === true || (allowStopped && info.State.Status === 'exited'))
    && info.Config.User === 'node'
    && config.Init === true && config.Privileged === false
    && config.CapDrop?.length === 1 && config.CapDrop[0] === 'ALL' && !config.CapAdd?.length
    && config.SecurityOpt?.length === 1 && config.SecurityOpt[0] === 'no-new-privileges'
    && config.Memory > 0 && config.Memory <= 2 * 1024 ** 3
    && config.NanoCpus > 0 && config.NanoCpus <= 2e9
    && config.PidsLimit > 0 && config.PidsLimit <= 128
    && !config.Devices?.length && !config.DeviceRequests?.length
    && !config.Binds?.length && !info.Mounts?.length
    && ['', 'default', 'bridge'].includes(config.NetworkMode)
    && !config.PidMode && !config.UTSMode && !config.UsernsMode
    && (!config.CgroupnsMode || config.CgroupnsMode === 'private')
    && ['', 'private'].includes(config.IpcMode)
    && Object.keys(bindings).length === 1
    && bindings['4000/tcp']?.length === 1
    && bindings['4000/tcp'][0].HostIp === '127.0.0.1';
  if (!restrictionsHold) throw new DockerOperationError('sandbox-policy-mismatch');
}

export async function acquireContainer(execute, { identity, image = DEFAULT_IMAGE, abortSignal, restartStopped = false } = {}) {
  let owned = false;
  let selected = identity;
  try {
    if (!selected) {
      const images = JSON.parse((await execute(['image', 'inspect', image], undefined, { abortSignal })).toString());
      selected = { id: `aquamux-runtime-${randomUUID()}`, imageId: images[0].Id, owner: randomUUID() };
      // Record ownership before run: a timed-out client may still have created it.
      owned = true;
      const created = await execute(containerArguments(selected.id, selected.imageId, selected.owner), undefined, { abortSignal, timeoutMs: 30000 });
      selected.instanceId = created.toString().trim();
      await execute(['exec', selected.id, 'mkdir', '-p', '/home/node/workspace'], undefined, { abortSignal });
    }
    if (!/^aquamux-runtime-[a-f0-9-]+$/.test(selected.id)
      || !/^sha256:[a-f0-9]{64}$/.test(selected.imageId)
      || !/^[a-f0-9-]{36}$/.test(selected.owner)
      || !/^[a-f0-9]{64}$/.test(selected.instanceId)) throw new DockerOperationError('sandbox-identity-invalid');
    let info = JSON.parse((await execute(['inspect', selected.id], undefined, { abortSignal })).toString())[0];
    validateContainer(info, selected, { allowStopped: restartStopped });
    if (!info.State.Running && restartStopped) {
      await execute(['start', selected.id], undefined, { abortSignal });
      info = JSON.parse((await execute(['inspect', selected.id], undefined, { abortSignal })).toString())[0];
      validateContainer(info, selected);
    }
    return { identity: selected, binding: info.NetworkSettings.Ports['4000/tcp'][0] };
  } catch (error) {
    if (owned) {
      try { await execute(['rm', '-f', selected.instanceId || selected.id], undefined, { timeoutMs: 10000 }); }
      catch { throw new DockerOperationError('sandbox-acquisition-cleanup-unconfirmed'); }
    }
    throw error;
  }
}
