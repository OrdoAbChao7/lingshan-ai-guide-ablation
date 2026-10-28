/** Isolated local verification runtime: no .env loading, no paid models, no platform claims. */
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';

async function main() {
  delete process.env.AGNES_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  const token = randomBytes(32).toString('hex');
  process.env.AGENTARTS_TOOL_API_KEY = token;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lingshan-agentarts-'));
  fs.cpSync(path.resolve(__dirname, '../../data/raw'), path.join(root, 'raw'), { recursive: true });
  process.env.DATA_ROOT = root;
  const output = path.resolve(process.argv[2] || '../tmp/agentarts-local-runtime.json');
  const { createApp } = await import('../src/app');
  const express = (await import('express')).default;
  const { createAgentArtsRouter } = await import('../src/api/v1/agentarts');
  const { verifyToken } = await import('../src/api/v1/auth');
  const app = express(); app.use(express.json());
  app.use('/api/v1/agentarts', createAgentArtsRouter({ auditRoot: () => path.join(root, 'traces') }));
  app.use('/api/v1/admin/agentarts', verifyToken, createAgentArtsRouter({ trustedAdmin: true, auditRoot: () => path.join(root, 'traces') }));
  app.use(createApp());
  const isolated = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => isolated.once('listening', resolve));
  const address = isolated.address() as { port: number };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify({ pid: process.pid, base_url: `http://127.0.0.1:${address.port}`, token, audit_root: root }), { mode: 0o600 });
  console.log(`Isolated offline tool runtime ready; metadata file: ${output}`);
  const cleanup = () => { isolated.closeAllConnections(); isolated.close(); fs.rmSync(output, { force: true });
    const tempBase = path.resolve(os.tmpdir());
    if (path.dirname(path.resolve(root)) !== tempBase || !path.basename(root).startsWith('lingshan-agentarts-'))
      throw new Error('Refusing cleanup outside the isolated temporary directory');
    fs.rmSync(root, { recursive: true, force: true }); process.exit(0); };
  process.on('SIGINT', cleanup); process.on('SIGTERM', cleanup);
}
main().catch(() => { console.error('Local verification runtime failed'); process.exit(1); });
