import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createCodex } from '@ai-sdk/harness-codex';
import { createClaudeCode } from '@ai-sdk/harness-claude-code';
import { Output, jsonSchema } from 'ai';

export function isolateHostEnvironment() {
  assertSubscriptionEnvironment();
  for (const key of Object.keys(process.env)) {
    if (!['PATH', 'HOME', 'USER', 'CODEX_HOME', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'TMPDIR'].includes(key)) delete process.env[key];
  }
}
export const reviewSchema = {
  type: 'object', additionalProperties: false,
  properties: { status: { type: 'string', enum: ['hold'] }, marker: { type: 'string' } },
  required: ['status', 'marker'],
};
export function validateReview(value) {
  if (!value || value.status !== 'hold' || typeof value.marker !== 'string' || Object.keys(value).sort().join(',') !== 'marker,status') throw new Error('Invalid spike output');
  return value;
}
/**
 * @param {'codex' | 'claude'} provider
 * @param {{ structured?: boolean, schema?: import('ai').FlexibleSchema<unknown>, instructions?: string, tools?: import('ai').ToolSet }} [options]
 */
export function createAgent(provider, { structured = false, schema, instructions, tools } = {}) {
  assertSubscriptionEnvironment();
  if (!['codex', 'claude'].includes(provider)) throw new Error('Unknown provider');
  return new HarnessAgent({
    harness: provider === 'codex' ? createCodex({ auth: 'direct', reasoningEffort: 'medium' }) : createClaudeCode({ auth: 'direct', maxTurns: 8, thinking: { type: 'disabled' } }),
    model: provider === 'codex' ? 'gpt-6-astra' : 'claude-sonnet-4-6',
    permissionMode: 'allow-all',
    ...(tools ? { tools } : {}),
    instructions: instructions ?? 'This is an isolated runtime compatibility test. Follow the exact requested response. Never inspect credentials or use tools unless the test explicitly asks for a harmless command.',
    ...(structured || schema ? { output: Output.object({ schema: schema ?? jsonSchema(reviewSchema) }) } : {}),
    debug: { enabled: false }, onLog: () => {},
  });
}
export async function collectTurn(agent, session, prompt, abortSignal) {
  const started = Date.now();
  const result = await agent.stream({ session, prompt, abortSignal });
  const events = {};
  const timings = [];
  let text = '';
  let failed = false;
  for await (const part of result.fullStream) {
    events[part.type] = (events[part.type] ?? 0) + 1;
    if (part.type === 'text-delta') { text += part.text; timings.push(Date.now() - started); }
    if (part.type === 'error') failed = true;
  }
  if (abortSignal?.aborted) throw abortSignal.reason;
  if (failed) throw new Error('Adapter emitted an error event');
  const output = agent.hasOutput ? validateReview(await result.output) : undefined;
  return { text, output, events, textDeltaTimesMs: timings, elapsedMs: Date.now() - started, usage: await result.totalUsage };
}

export function assertSubscriptionEnvironment(env = process.env) {
  const forbidden = Object.keys(env).some(key => /^(OPENAI_|ANTHROPIC_|AI_GATEWAY_|VERCEL_|CODEX_API_KEY$|CLAUDE_CODE_OAUTH_TOKEN$)/.test(key) && env[key]);
  if (forbidden) {
    const error = new Error('subscription-environment-refused');
    error.code = 'subscription-environment-refused';
    throw error;
  }
}
