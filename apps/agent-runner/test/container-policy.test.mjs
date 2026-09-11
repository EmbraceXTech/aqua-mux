import test from 'node:test';
import assert from 'node:assert/strict';
import { validateContainer } from '../src/container-policy.mjs';
const identity = { id: 'aquamux-runtime-abc', imageId: 'sha256:abc', owner: 'fixture' };
const baseline = {
  Name: '/aquamux-runtime-abc', Image: identity.imageId, State: { Running: true }, Mounts: [],
  Config: { User: 'node', Labels: { 'aquamux.runtime-spike': 'true', 'aquamux.runtime-owner': 'fixture' } },
  HostConfig: { Init: true, Privileged: false, CapDrop: ['ALL'], CapAdd: null, SecurityOpt: ['no-new-privileges'], Memory: 2147483648, NanoCpus: 2000000000, PidsLimit: 128, NetworkMode: 'default', PidMode: '', IpcMode: 'private' },
  NetworkSettings: { Ports: { '4000/tcp': [{ HostIp: '127.0.0.1', HostPort: '12345' }] } },
};
test('resume rejects changed identity and missing creation restrictions', () => {
  validateContainer(baseline, identity);
  const mutations = [
    x => x.Config.User = 'root', x => x.HostConfig.CapDrop = [], x => x.HostConfig.Memory = 0,
    x => x.HostConfig.SecurityOpt = [], x => x.HostConfig.Privileged = true,
    x => x.HostConfig.NetworkMode = 'host', x => x.HostConfig.PidMode = 'host',
    x => x.NetworkSettings.Ports['5000/tcp'] = [{ HostIp: '127.0.0.1' }],
    x => x.NetworkSettings.Ports['4000/tcp'].push({ HostIp: '0.0.0.0' }),
    x => x.Image = 'different-image', x => x.Config.Labels['aquamux.runtime-owner'] = 'different-owner',
    x => x.State.Running = false, x => x.Mounts.push({ Source: '/host' }),
  ];
  for (const mutate of mutations) {
    const input = structuredClone(baseline);
    mutate(input);
    assert.throws(() => validateContainer(input, identity), { code: 'sandbox-policy-mismatch' });
  }
});
