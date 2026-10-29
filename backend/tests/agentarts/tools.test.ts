import assert from 'node:assert/strict';
import test from 'node:test';
import { executeTool, runDecision } from '../../src/services/agentarts/tools';
import { loadRouteGraph } from '../../src/services/route/route-contract';
import { extractSceneState } from '../../src/services/scene/scene-extractor';

const scene = { currentLocation: 'south_gate', currentTime: '09:00', remainingMinutes: 120,
  mobility: 'wheelchair', interests: [], mustVisitSpotIds: ['LS-013'],
  preferredPerformanceIds: [], visitedSpotIds: [], missingCriticalFields: [] };
const dependencies = { graph: loadRouteGraph(), extract: async (query: string) => {
  const state = extractSceneState(query);
  return { state, source: 'rules' as const, confidence: {}, missingFields: state.missingCriticalFields,
    conflicts: [], trace: { configured: false, executed: false, status: 'skipped' as const, fallbackUsed: false } };
} };

test('plan and independent validation use the same registered graph', async () => {
  const result = await executeTool('plan_route', { scene_state: scene }, dependencies);
  assert.equal(result.status, 'success');
  const checked = await executeTool('validate_route', { scene_state: scene, route: result.data.route }, dependencies);
  assert.equal(checked.data.valid, true);
  assert.ok(result.data.route.steps.some((step: any) => step.spotId === 'LS-013'));
});

test('route decisions cannot be injected into scene input', async () => {
  await assert.rejects(executeTool('plan_route', { scene_state: { ...scene, feasible: true, steps: [] } }, dependencies));
});

test('missing time produces clarification rather than a guessed route', async () => {
  const result = await runDecision({ intent: 'route', query: '从南门出发只有90分钟，带行动不便的家人去梵宫' }, dependencies);
  assert.equal(result.status, 'needs_clarification');
  assert.ok(result.data.missing_fields.includes('currentTime'));
  assert.equal(result.data.route, undefined);
});

test('a forged feasible flag and shifted start are blocked', async () => {
  const planned = await executeTool('plan_route', { scene_state: scene }, dependencies);
  const result = await executeTool('validate_route', { scene_state: scene,
    route: { ...planned.data.route, startTime: '08:00', feasible: true } }, dependencies);
  assert.equal(result.status, 'infeasible');
  assert.ok(result.data.violations.some((v: any) => v.code === 'scene_start_mismatch'));
});

test('an empty plan cannot be published as feasible', async () => {
  const result = await executeTool('validate_route', { scene_state: { ...scene, mustVisitSpotIds: [] },
    route: { startTime: '09:00', steps: [], totalMinutes: 0, walkingMinutes: 0, visitingMinutes: 0, waitingMinutes: 0, feasible: true } }, dependencies);
  assert.equal(result.data.valid, false);
});

test('compressed walking and visiting timeline cannot bypass the budget', async () => {
  const result = await executeTool('validate_route', { scene_state: { ...scene, remainingMinutes: 1, mustVisitSpotIds: ['LS-001'] },
    route: { startTime: '09:00', steps: [{ spotId: 'LS-001', arrive: '09:00', start: '09:00', end: '09:01',
      walkMinutes: 5, visitMinutes: 15, reasonCode: 'forged' }], totalMinutes: 1, walkingMinutes: 5, visitingMinutes: 15, waitingMinutes: 0, feasible: true } }, dependencies);
  assert.equal(result.data.valid, false);
});

test('performance requires an explicit registered slot', async () => {
  const result = await executeTool('validate_route', {
    scene_state: { ...scene, currentLocation: 'LS-013', remainingMinutes: 20 },
    route: { startTime: '09:00', totalMinutes: 20, walkingMinutes: 0, visitingMinutes: 20, waitingMinutes: 0,
      steps: [{ spotId: 'LS-013', arrive: '09:00', start: '09:00', end: '09:20', walkMinutes: 0, visitMinutes: 20,
        pathSpotIds: ['LS-013'], performanceDurationMinutes: 20, performanceId: 'performance_lingshan_jixiangsong', reasonCode: 'forged' }] },
  }, dependencies);
  assert.equal(result.data.valid, false);
});

test('registered performance still needs wheelchair admission buffer', async () => {
  const result = await executeTool('validate_route', {
    scene_state: { ...scene, currentLocation: 'LS-013', currentTime: '10:30', remainingMinutes: 60 },
    route: { startTime: '10:30', totalMinutes: 25, walkingMinutes: 0, visitingMinutes: 20, waitingMinutes: 5,
      steps: [{ spotId: 'LS-013', arrive: '10:30', start: '10:35', end: '10:55', walkMinutes: 0, visitMinutes: 20, waitingMinutes: 5,
        pathSpotIds: ['LS-013'], performanceDurationMinutes: 20, performanceId: 'performance_lingshan_jixiangsong', performanceStartTime: '10:35', reasonCode: 'too_late' }] },
  }, dependencies);
  assert.equal(result.data.valid, false);
  assert.ok(result.data.violations.some((v: any) => v.code === 'insufficient_admission_buffer'));
});

test('alternative keeps hard constraints and refuses impossible mandatory destination', async () => {
  const original = { ...scene, remainingMinutes: 1 };
  const result = await executeTool('suggest_alternative', { scene_state: original, failure_reasons: ['time_budget_exceeded'] }, dependencies);
  assert.equal(result.status, 'infeasible');
  assert.deepEqual(result.data.scene_state.mustVisitSpotIds, original.mustVisitSpotIds);
  assert.equal(result.data.scene_state.remainingMinutes, 1);
  assert.equal(result.data.scene_state.mobility, 'wheelchair');
});

test('knowledge with no sources never returns a supported answer', async () => {
  const result = await runDecision({ intent: 'knowledge', query: '不存在的资料' }, {
    ...dependencies, search: async () => ({ answer: '模型猜测', evidence: [], trace: {} }),
  });
  assert.equal(result.status, 'no_evidence');
  assert.equal(result.data.answer, undefined);
});

test('decision only releases independently validated route and records calls', async () => {
  const result = await runDecision({ intent: 'route', scene_state: scene }, dependencies);
  assert.equal(result.status, 'success');
  assert.equal(result.data.validation.valid, true);
  assert.deepEqual(result.calls.map(call => call.tool), ['plan_route', 'validate_route']);
});

test('optional missing extraction fields do not block a complete scene', async () => {
  const result = await executeTool('extract_scene_state', { query: '完整输入' }, { ...dependencies,
    extract: async () => ({ state: scene as any, source: 'llm', confidence: {},
      missingFields: ['budget', 'pace', 'mealRequested'], conflicts: [],
      trace: { configured: true, executed: true, status: 'success', fallbackUsed: false } }),
  });
  assert.equal(result.status, 'success');
});

test('unresolved extraction conflict stops planning until explicitly corrected', async () => {
  const deps = { ...dependencies, extract: async () => ({ state: { ...scene, missingCriticalFields: ['currentTime'] } as any,
    source: 'llm' as const, confidence: { currentTime: 0.1 }, missingFields: ['currentTime'], conflicts: ['currentTime'],
    trace: { configured: true, executed: true, status: 'success' as const, fallbackUsed: false } }) };
  const result = await runDecision({ intent: 'route', query: '时间不清楚' }, deps);
  assert.equal(result.status, 'needs_clarification');
  const fixed = await runDecision({ intent: 'route', query: '时间不清楚', scene_state: { currentTime: '10:00' } }, deps);
  assert.equal(fixed.status, 'success');
});

test('critical low confidence requires confirmation even if a value exists', async () => {
  const result = await executeTool('extract_scene_state', { query: '含糊时刻' }, { ...dependencies,
    extract: async () => ({ state: scene as any, source: 'llm', confidence: { currentTime: 0.5 }, missingFields: [], conflicts: [],
      trace: { configured: true, executed: true, status: 'success', fallbackUsed: false } }),
  });
  assert.equal(result.status, 'needs_clarification');
  assert.ok(result.data.missing_fields.includes('currentTime'));
});

test('mobility conflict cannot silently relax limited mobility to normal', async () => {
  const deps = { ...dependencies, extract: async () => ({ state: { ...scene, mobility: 'normal' as const },
    source: 'merged' as const, confidence: { mobility: 0.9 }, missingFields: [], conflicts: ['mobility'],
    trace: { configured: true, executed: true, status: 'success' as const, fallbackUsed: false } }) };
  const blocked = await runDecision({ intent: 'route', query: '行动能力有冲突' }, deps);
  assert.equal(blocked.status, 'needs_clarification');
  assert.ok(blocked.data.missing_fields.includes('mobility'));
  const corrected = await runDecision({ intent: 'route', query: '行动能力有冲突', scene_state: { mobility: 'limited' } }, deps);
  assert.equal(corrected.status, 'success');
  assert.equal(corrected.data.scene_state.mobility, 'limited');
});
