import { extractSceneStateWithLLM } from '../scene/scene-extractor';
import { SceneStateSchema, type SceneState } from '../scene/scene-state';
import { loadRouteGraph, type RouteGraph } from '../route/route-contract';
import { planRouteRequest } from '../route/route-planning-service';
import { validateRoute, type RoutePlan, type RouteViolation } from '../route/route-validator';
import { queryRAG } from '../rag-service';
import { randomUUID } from 'node:crypto';
import { DecisionInputSchema, toolInputs, type ToolName, type ToolResult } from './contracts';

export interface ToolDependencies {
  graph?: RouteGraph;
  extract?: typeof extractSceneStateWithLLM;
  search?: (query: string) => Promise<{ answer: string; evidence: unknown[]; trace: unknown }>;
}
const criticalFields = ['currentLocation', 'currentTime', 'remainingMinutes'];
const guardedFields = [...criticalFields, 'mobility', 'mustVisitSpotIds', 'visitedSpotIds', 'preferredPerformanceIds', 'preferredPerformanceTimes'];
const fieldLabels: Record<string, string> = { currentLocation: '当前位置', currentTime: '开始游览时间',
  remainingMinutes: '剩余游览时间', mobility: '行动能力', mustVisitSpotIds: '必去景点', visitedSpotIds: '已游览景点',
  preferredPerformanceIds: '期望观看的演出', preferredPerformanceTimes: '期望演出场次' };
const clarification = (fields: string[]) => `请补充或确认：${fields.map(field => fieldLabels[field] || field).join('、')}`;

function sceneFrom(input: unknown): SceneState {
  const state = SceneStateSchema.parse({ mobility: 'unknown', interests: [], mustVisitSpotIds: [],
    preferredPerformanceIds: [], visitedSpotIds: [], missingCriticalFields: [], ...(input as object) });
  state.missingCriticalFields = [...new Set([...state.missingCriticalFields.filter(key => guardedFields.includes(key)),
    ...criticalFields.filter(key => state[key as keyof SceneState] === undefined)])];
  return state;
}

export function checkRoute(route: RoutePlan, scene: SceneState, graph: RouteGraph) {
  const result = validateRoute(route, scene, graph);
  const violations: RouteViolation[] = result.violations.filter(v => v.code !== 'missing_preferred_performance');
  if (scene.missingCriticalFields.length) violations.push({ code: 'missing_critical_fields', message: '必要场景字段缺失' });
  if (!graph.spots.some(spot => spot.id === scene.currentLocation)) violations.push({ code: 'unknown_current_location', message: '出发地点未登记' });
  if (route.startTime !== scene.currentTime) violations.push({ code: 'scene_start_mismatch', message: '路线开始时刻与游客输入不一致' });
  if (!route.steps.length) violations.push({ code: 'empty_route', message: '没有可执行的游览步骤' });
  const clock = (value: string) => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };
  let previousEnd = clock(route.startTime);
  let waiting = 0;
  route.steps.forEach((step, stepIndex) => {
    const arrive = clock(step.arrive), start = clock(step.start), end = clock(step.end);
    const wait = start - arrive;
    if (arrive !== previousEnd + step.walkMinutes || end - start !== step.visitMinutes || wait < 0 ||
        (step.waitingMinutes !== undefined && step.waitingMinutes !== wait))
      violations.push({ code: 'step_time_conservation', message: '步行、等待与停留时间轴不守恒', stepIndex });
    waiting += wait;
    if (step.performanceId) {
      const performance = graph.performances.find(item => item.id === step.performanceId);
      if (!step.performanceStartTime || !performance?.start_times.includes(step.performanceStartTime) || step.start !== step.performanceStartTime)
        violations.push({ code: 'missing_or_invalid_performance_slot', message: '演出必须对应已登记的明确场次', stepIndex });
      const admissionBuffer = scene.mobility === 'limited' || scene.mobility === 'wheelchair' ? 20 : 15;
      if (wait < admissionBuffer) violations.push({ code: 'insufficient_admission_buffer', message: `演出需预留 ${admissionBuffer} 分钟入场缓冲`, stepIndex });
    }
    previousEnd = end;
  });
  if (route.waitingMinutes !== waiting || route.totalMinutes !== route.walkingMinutes + route.visitingMinutes + route.waitingMinutes)
    violations.push({ code: 'aggregate_time_conservation', message: '总耗时与步行、停留、等待之和不一致' });
  // Existing validator uses a performance anchor for some historical budgets. The tool boundary
  // always checks the complete visit, including the performance, against the visitor deadline.
  if (scene.remainingMinutes !== undefined && route.totalMinutes > scene.remainingMinutes)
    violations.push({ code: 'complete_time_budget_exceeded', message: '完整路线（含演出结束）超过剩余时间' });
  return { valid: violations.length === 0, violations, preference_warnings: result.violations.filter(v => v.code === 'missing_preferred_performance') };
}

export async function executeTool(name: ToolName, raw: unknown, deps: ToolDependencies = {}): Promise<ToolResult> {
  const input = toolInputs[name].parse(raw) as any;
  if (name === 'extract_scene_state') {
    const extraction = await (deps.extract || extractSceneStateWithLLM)(input.query);
    const state = sceneFrom(SceneStateSchema.strict().parse(extraction.state));
    const lowConfidence = Object.entries(extraction.confidence).filter(([field, confidence]) => {
      const value = state[field as keyof SceneState];
      const hasValue = value !== undefined && value !== 'unknown' && (!Array.isArray(value) || value.length > 0);
      return guardedFields.includes(field) && hasValue && confidence < 0.75;
    }).map(([field]) => field);
    const missing = [...new Set([...state.missingCriticalFields, ...extraction.conflicts.filter(field => guardedFields.includes(field)), ...lowConfidence])];
    state.missingCriticalFields = missing;
    return { status: missing.length ? 'needs_clarification' : 'success', data: {
      scene_state: state, missing_fields: missing, confidence: extraction.confidence,
      conflicts: extraction.conflicts, extraction_trace: extraction.trace, source: extraction.source,
      clarification: missing.length ? clarification(missing) : undefined,
    } };
  }
  if (name === 'search_knowledge') {
    const found = deps.search ? await deps.search(input.query) : await (async () => {
      const result = await queryRAG(input.query, `agentarts-${randomUUID()}`, { enableHistory: false });
      return { answer: result.answer, evidence: result.trace.retrievedDocuments, trace: result.trace };
    })();
    return { status: found.evidence.length ? 'success' : 'no_evidence', data: {
      ...(found.evidence.length ? { answer: found.answer } : {}), evidence: found.evidence, retrieval_trace: found.trace,
    } };
  }
  const graph = deps.graph || loadRouteGraph();
  const state = sceneFrom(input.scene_state);
  if (name === 'validate_route') {
    const checked = checkRoute(input.route, state, graph);
    return { status: checked.valid ? 'success' : 'infeasible', data: checked };
  }
  if (state.missingCriticalFields.length) return { status: 'needs_clarification', data: {
    scene_state: state, missing_fields: state.missingCriticalFields,
    clarification: clarification(state.missingCriticalFields),
  } };
  // Only soft preferences may be relaxed automatically. Mandatory destinations, mobility,
  // time budget, current time and location are retained unchanged.
  const planningState = name === 'suggest_alternative'
    ? { ...state, interests: [], preferredPerformanceIds: [], preferredPerformanceTimes: undefined }
    : state;
  const planned = await planRouteRequest({ scene_state: planningState }, { graph });
  if (planned.outcome === 'needs_clarification') return { status: 'needs_clarification', data: {
    scene_state: planned.scene_state, missing_fields: planned.scene_state.missingCriticalFields, clarification: planned.clarification,
  } };
  const checked = checkRoute(planned.route, planningState, graph);
  const feasible = planned.feasibility && checked.valid;
  return { status: feasible ? 'success' : 'infeasible', data: {
    scene_state: planningState, route: { ...planned.route, feasible, outcome: feasible ? planned.outcome : 'infeasible' },
    validation: checked, evidence: planned.evidence, explanation: planned.explanation,
    ...(name === 'suggest_alternative' ? { relaxed_fields: [
      ...(state.interests.length ? ['interests'] : []),
      ...(state.preferredPerformanceIds.length ? ['preferredPerformanceIds'] : []),
      ...(state.preferredPerformanceTimes ? ['preferredPerformanceTimes'] : []),
    ], failure_reasons: input.failure_reasons, original_requirements_met: false } : {}),
    data_scope: '基于登记静态路网计算；估算道路不代表现场测绘或实时导航保证。',
  } };
}

export interface DecisionCall { tool: ToolName; input: unknown; result: ToolResult; latency_ms: number }
export async function runDecision(raw: unknown, deps: ToolDependencies = {},
  record?: (call: DecisionCall) => void, signal?: AbortSignal): Promise<ToolResult & { calls: DecisionCall[] }> {
  const input = DecisionInputSchema.parse(raw);
  const calls: DecisionCall[] = [];
  const call = async (tool: ToolName, args: unknown) => {
    signal?.throwIfAborted();
    const started = Date.now();
    const result = await executeTool(tool, args, deps);
    signal?.throwIfAborted();
    const entry = { tool, input: args, result, latency_ms: Date.now() - started };
    calls.push(entry); record?.(entry);
    return result;
  };
  if (input.intent === 'knowledge') return { ...await call('search_knowledge', { query: input.query }), calls };
  let state = input.scene_state;
  if (input.query) {
    const extracted = await call('extract_scene_state', { query: input.query });
    state = { ...extracted.data.scene_state, ...state };
    state!.missingCriticalFields = extracted.data.missing_fields.filter((field: string) =>
      !input.scene_state || input.scene_state[field as keyof SceneState] === undefined);
  }
  const planned = await call('plan_route', { scene_state: state });
  if (planned.status === 'needs_clarification') return { ...planned, calls };
  const checked = await call('validate_route', { scene_state: state, route: planned.data.route });
  if (planned.status === 'success' && checked.data.valid) return { ...planned,
    data: { ...planned.data, validation: checked.data }, calls };
  const alternative = await call('suggest_alternative', { scene_state: state,
    failure_reasons: checked.data.violations.map((v: RouteViolation) => v.code) });
  if (alternative.status === 'success') {
    const rechecked = await call('validate_route', { scene_state: alternative.data.scene_state, route: alternative.data.route });
    if (rechecked.data.valid) return { ...alternative, data: { ...alternative.data, validation: rechecked.data,
      original_requirements_met: false }, calls };
  }
  return { status: 'infeasible', data: { original_requirements_met: false,
    reason: '在保留时间、行动能力和必去景点条件下，没有通过校验的方案。请明确调整要求后重试。',
    violations: checked.data.violations }, calls };
}
