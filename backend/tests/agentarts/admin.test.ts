import assert from 'node:assert/strict';
import test from 'node:test';
import { startTestServer, jsonBody } from '../helpers/api-fixtures';

test('admin decision route requires JWT and returns audited local execution', async () => {
  const server = await startTestServer();
  try {
    const input = { intent: 'route', scene_state: { currentLocation: 'south_gate' } };
    assert.equal((await server.request('/api/v1/admin/agentarts/decide', jsonBody(input))).status, 401);
    const login = await server.request('/api/v1/auth/login', jsonBody({ username: 'admin', password: 'lingshan2026' }));
    const response = await server.request('/api/v1/admin/agentarts/decide', {
      ...jsonBody(input), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login.body.token || login.body.access_token}` },
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.execution_origin, 'local_reference');
    assert.equal(response.body.status, 'needs_clarification');
    assert.ok(response.body.trace_id);
  } finally { await server.close(); }
});
