import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAgentArtsRouter } from '../../src/api/v1/agentarts';

async function fixture(options: Record<string, any> = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentarts-test-'));
  const app = express(); app.use(express.json());
  app.use('/agent', createAgentArtsRouter({ apiKey: () => 'test-key', auditRoot: () => root, ...options }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  const address = server.address() as any;
  return { root, request: async (endpoint: string, body?: unknown, key = 'test-key', trace?: string) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/agent${endpoint}`, {
      method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': key,
        ...(trace ? { 'X-Trace-Id': trace } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }); return { status: response.status, body: await response.json() as any };
  }, close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    fs.rmSync(root, { recursive: true, force: true }); } };
}

test('API key is mandatory and unconfigured service fails closed', async () => {
  const f = await fixture();
  try { assert.equal((await f.request('/tools/extract_scene_state', { query: '你好' }, '')).status, 401);
    assert.equal((await f.request('/tools/extract_scene_state', { query: '你好' }, 'wrong')).status, 401);
    assert.deepEqual(fs.readdirSync(f.root), []);
  } finally { await f.close(); }
  const disabled = await fixture({ apiKey: () => undefined });
  try { assert.equal((await disabled.request('/tools/extract_scene_state', { query: '你好' })).status, 503); }
  finally { await disabled.close(); }
});

test('HTTP tool returns correlated persisted trace without credentials', async () => {
  const f = await fixture();
  try {
    const result = await f.request('/tools/plan_route', { scene_state: { currentLocation: 'south_gate' } });
    assert.equal(result.status, 200); assert.equal(result.body.status, 'needs_clarification');
    assert.equal(result.body.contract_version, '1.0.0');
    const trace = await f.request(`/traces/${result.body.trace_id}`);
    assert.equal(trace.status, 200); assert.equal(trace.body.records.length, 2);
    assert.equal(trace.body.records[1].output.status, 'needs_clarification');
    assert.ok(!JSON.stringify(trace.body).includes('test-key'));
    const again = await f.request('/tools/plan_route', { scene_state: {} }, 'test-key', result.body.trace_id);
    assert.equal(again.body.trace_id, result.body.trace_id);
    assert.equal((await f.request('/traces/not-a-uuid')).status, 400);
  } finally { await f.close(); }
});

test('bad body and invalid tool return typed errors', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.request('/tools/plan_route', { scene_state: { feasible: true } })).status, 400);
    assert.equal((await f.request('/tools/not_a_tool', {})).status, 404);
    assert.equal((await f.request('/decide', { intent: 'unknown' })).status, 400);
  } finally { await f.close(); }
});

test('tool timeout and exception never produce successful result', async () => {
  const f = await fixture({ timeoutMs: 15, dependencies: { search: async () => {
    await new Promise(resolve => setTimeout(resolve, 50)); return { answer: 'late', evidence: [{}], trace: {} };
  } } });
  try { const result = await f.request('/tools/search_knowledge', { query: '票价' });
    assert.equal(result.status, 504); assert.equal(result.body.error.code, 'TOOL_TIMEOUT');
    assert.equal((await f.request(`/traces/${result.body.trace_id}`)).body.records.at(-1).output.status, 'error');
  } finally { await f.close(); }
  const broken = await fixture({ dependencies: { search: async () => { throw new Error('secret details'); } } });
  try { const result = await broken.request('/tools/search_knowledge', { query: '票价' });
    assert.equal(result.status, 502); assert.ok(!JSON.stringify(result.body).includes('secret details'));
  } finally { await broken.close(); }
});

test('audit write failure prevents claiming a recorded successful call', async () => {
  const f = await fixture({ auditRoot: () => '\0invalid' });
  try { const result = await f.request('/tools/plan_route', { scene_state: {} });
    assert.equal(result.status, 503); assert.equal(result.body.error.code, 'AUDIT_UNAVAILABLE');
  } finally { await f.close(); }
});
