import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { CONTRACT_VERSION, DecisionInputSchema, toolInputs } from '../src/services/agentarts/contracts';

function jsonSchema(schema: z.ZodTypeAny): Record<string, any> {
  const def = schema._def;
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) return jsonSchema(schema.unwrap());
  if (schema instanceof z.ZodEffects) return jsonSchema(schema.innerType());
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    return { type: 'object', additionalProperties: false,
      properties: Object.fromEntries(Object.entries(shape).map(([key, value]) => [key, jsonSchema(value as z.ZodTypeAny)])),
      required: Object.entries(shape).filter(([, value]) => !(value as z.ZodTypeAny).isOptional()).map(([key]) => key) };
  }
  if (schema instanceof z.ZodArray) return { type: 'array', items: jsonSchema(schema.element),
    ...(def.maxLength ? { maxItems: def.maxLength.value } : {}) };
  if (schema instanceof z.ZodEnum) return { type: 'string', enum: schema.options };
  if (schema instanceof z.ZodRecord) return { type: 'object', additionalProperties: jsonSchema(def.valueType) };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
  if (schema instanceof z.ZodString || schema instanceof z.ZodNumber) {
    const string = schema instanceof z.ZodString;
    const result: Record<string, any> = { type: string ? 'string' : 'number' };
    for (const check of def.checks) {
      if (check.kind === 'int') result.type = 'integer';
      if (check.kind === 'min') result[string ? 'minLength' : 'minimum'] = check.value;
      if (check.kind === 'max') result[string ? 'maxLength' : 'maximum'] = check.value;
      if (check.kind === 'regex') result.pattern = check.regex.source;
    }
    return result;
  }
  throw new Error(`Unsupported schema ${def.typeName}`);
}
const response = { description: '工具返回契约；success 之外的业务状态同样使用 HTTP 200。平台必须判断 status。',
  content: { 'application/json': { schema: { type: 'object', required: ['contract_version', 'trace_id', 'call_id', 'status'],
    properties: { contract_version: { type: 'string' }, trace_id: { type: 'string', format: 'uuid' },
      call_id: { type: 'string', format: 'uuid' }, execution_origin: { type: 'string', enum: ['local_tools', 'local_reference'] },
      status: { type: 'string', enum: ['success', 'needs_clarification', 'infeasible', 'no_evidence', 'error'] },
      latency_ms: { type: 'number' }, data: { type: 'object' }, error: { type: 'object' } } } } } };
const operation = (name: string, schema: z.ZodTypeAny) => ({ operationId: name,
  parameters: [{ in: 'header', name: 'X-Trace-Id', required: false, schema: { type: 'string', format: 'uuid' } }],
  requestBody: { required: true, content: { 'application/json': { schema: jsonSchema(schema) } } },
  responses: { 200: response, ...Object.fromEntries([400, 401, 404, 429, 502, 503, 504].map(code => [code, {
    description: '请求、认证、繁忙或执行错误；尚未开始执行时可能没有 trace_id/call_id。',
    content: { 'application/json': { schema: { type: 'object', required: ['error'], properties: {
      status: { type: 'string', enum: ['error'] }, trace_id: { type: 'string', format: 'uuid' },
      error: { type: 'object', required: ['code'], properties: { code: { type: 'string' }, message: { type: 'string' } } },
    } } } },
  }])) } });
const document = { openapi: '3.0.3', info: { title: '灵小禅 AgentArts HTTP Tools', version: CONTRACT_VERSION },
  servers: [{ url: 'https://REPLACE_WITH_YOUR_DOMAIN/api/v1/agentarts' }],
  security: [{ ApiKey: [] }], components: { securitySchemes: { ApiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' } } },
  paths: Object.fromEntries([...Object.entries(toolInputs).map(([name, schema]) => [`/tools/${name}`, { post: operation(name, schema) }]),
    ['/decide', { post: { ...operation('local_reference_decision', DecisionInputSchema), description: '仅本地参考编排；AgentArts 应分别调用五个工具。knowledge 需要 query；route 需要 query 或 scene_state。' } }],
    ['/traces/{trace_id}', { get: { operationId: 'read_trace', parameters: [{ name: 'trace_id', in: 'path', required: true,
      schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: '已保存的调用记录', content: {
      'application/json': { schema: { type: 'object', properties: { trace_id: { type: 'string' }, records: { type: 'array', items: { type: 'object' } } } } },
    } } } } }]]) };
const dest = path.resolve(__dirname, '../../docs/competition/huawei-ict/openapi.json');
fs.writeFileSync(dest, JSON.stringify(document, null, 2) + '\n');
console.log(dest);
