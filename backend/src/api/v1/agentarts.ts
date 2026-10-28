import { Router } from 'express';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { resolveDataPath } from '../../config/paths';
import { CONTRACT_VERSION, DecisionInputSchema, ToolNameSchema, toolInputs } from '../../services/agentarts/contracts';
import { executeTool, runDecision, type ToolDependencies } from '../../services/agentarts/tools';

interface RouterOptions {
  // Only mount this mode behind the existing admin JWT middleware.
  trustedAdmin?: boolean;
  apiKey?: () => string | undefined;
  auditRoot?: () => string;
  timeoutMs?: number;
  dependencies?: ToolDependencies;
}
const uuid = z.string().uuid();
const digest = (value: string) => createHash('sha256').update(value).digest();

export function createAgentArtsRouter(options: RouterOptions = {}): Router {
  const router = Router();
  const auditRoot = options.auditRoot || (() => resolveDataPath('agentarts-traces'));
  const timeoutMs = Math.min(options.timeoutMs || 40_000, 40_000);
  let active = 0;
  router.use((req, res, next) => {
    if (options.trustedAdmin) { next(); return; }
    const key = (options.apiKey || (() => process.env.AGENTARTS_TOOL_API_KEY))();
    if (!key) { res.status(503).json({ status: 'error', error: { code: 'NOT_CONFIGURED', message: '工具认证尚未配置' } }); return; }
    const supplied = req.get('X-API-Key') || '';
    if (!supplied || !timingSafeEqual(digest(supplied), digest(key))) {
      res.status(401).json({ status: 'error', error: { code: 'UNAUTHORIZED', message: '工具认证失败' } }); return;
    }
    next();
  });
  const append = (traceId: string, entry: unknown) => {
    const root = auditRoot();
    fs.mkdirSync(root, { recursive: true });
    fs.appendFileSync(path.join(root, `${traceId}.jsonl`), JSON.stringify({ timestamp: new Date().toISOString(), ...entry as object }) + '\n', { mode: 0o600 });
  };
  router.get('/traces/:traceId', (req, res) => {
    if (!uuid.safeParse(req.params.traceId).success) { res.status(400).json({ error: { code: 'INVALID_TRACE_ID' } }); return; }
    try {
      const file = path.join(auditRoot(), `${req.params.traceId}.jsonl`);
      if (!fs.existsSync(file)) { res.status(404).json({ error: { code: 'TRACE_NOT_FOUND' } }); return; }
      res.json({ trace_id: req.params.traceId, records: fs.readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line)) });
    } catch { res.status(503).json({ error: { code: 'AUDIT_UNAVAILABLE' } }); }
  });
  router.post(['/tools/:tool', '/decide'], async (req, res) => {
    const decision = req.path === '/decide';
    const parsedName = ToolNameSchema.safeParse(req.params.tool);
    if (!decision && !parsedName.success) { res.status(404).json({ error: { code: 'UNKNOWN_TOOL' } }); return; }
    const tool = decision ? 'decide' : parsedName.data!;
    const requestedTrace = req.get('X-Trace-Id');
    if (requestedTrace && !uuid.safeParse(requestedTrace).success) {
      res.status(400).json({ error: { code: 'INVALID_TRACE_ID' } }); return;
    }
    const traceId = requestedTrace || randomUUID();
    const callId = randomUUID();
    const started = Date.now();
    const envelope = <T extends object>(result: T) => ({ contract_version: CONTRACT_VERSION, trace_id: traceId,
      call_id: callId, tool, execution_origin: decision ? 'local_reference' : 'local_tools',
      latency_ms: Date.now() - started, ...result });
    if (active >= 8) { res.status(429).json(envelope({ status: 'error', error: { code: 'BUSY', message: '工具繁忙，请稍后重试' } })); return; }
    const parsed = (decision ? DecisionInputSchema : toolInputs[parsedName.data!]).safeParse(req.body);
    if (!parsed.success) { res.status(400).json(envelope({ status: 'error', error: { code: 'INVALID_INPUT',
      message: '输入不符合工具契约', fields: parsed.error.issues.map(issue => issue.path.join('.')) } })); return; }
    try { append(traceId, { call_id: callId, event: 'started', tool, input: parsed.data }); }
    catch { res.status(503).json(envelope({ status: 'error', error: { code: 'AUDIT_UNAVAILABLE' } })); return; }
    active++;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    let auditFailed = false;
    try {
      const work = decision ? runDecision(parsed.data, options.dependencies, call => {
        if (!controller.signal.aborted) {
          try { append(traceId, { call_id: callId, event: 'tool_completed', ...call }); }
          catch { auditFailed = true; throw new Error('audit_failed'); }
        }
      }, controller.signal) : executeTool(parsedName.data!, parsed.data, options.dependencies);
      // Retain the concurrency slot until the underlying work really settles after a timeout.
      const tracked = work.finally(() => { active--; });
      const result = await Promise.race([tracked, new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('tool_timeout')); }, timeoutMs);
      })]);
      const output = envelope(result);
      try { append(traceId, { call_id: callId, event: 'completed', output }); }
      catch { auditFailed = true; throw new Error('audit_failed'); }
      res.json(output);
    } catch (error) {
      const timeout = error instanceof Error && error.message === 'tool_timeout';
      const output = envelope({ status: 'error', error: { code: auditFailed ? 'AUDIT_UNAVAILABLE' : timeout ? 'TOOL_TIMEOUT' : 'TOOL_FAILED',
        message: auditFailed ? '执行记录保存失败' : timeout ? '工具调用超时，未发布路线' : '工具执行失败，未发布路线' } });
      try { append(traceId, { call_id: callId, event: 'failed', output }); }
      catch { auditFailed = true; }
      if (auditFailed) { output.error.code = 'AUDIT_UNAVAILABLE'; output.error.message = '执行记录保存失败'; }
      res.status(auditFailed ? 503 : timeout ? 504 : 502).json(output);
    } finally { if (timer) clearTimeout(timer); }
  });
  return router;
}

export const agentArtsRouter = createAgentArtsRouter();
