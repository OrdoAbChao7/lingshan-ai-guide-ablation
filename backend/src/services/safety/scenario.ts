/**
 * 安全场景加载与静态一致性校验。
 *
 * 场景文件是只读输入（数据中心 `data/safety/<file>`），加载时做结构校验和引用完整性检查，
 * 任何悬空引用都会直接抛错，避免把坏数据带入规划器。
 */
import fs from 'node:fs';
import path from 'node:path';
import { resolveDataPath } from '../../config/paths';
import { SafetyScenarioSchema, type SafetyScenario } from './types';

export const DEFAULT_SCENARIO_FILE = 'scenario-default.json';

export function validateScenarioReferences(scenario: SafetyScenario): string[] {
  const errors: string[] = [];
  const regionIds = new Set<string>();
  for (const region of scenario.regions) {
    if (regionIds.has(region.id)) errors.push(`duplicate region id: ${region.id}`);
    regionIds.add(region.id);
  }

  const corridorIds = new Set<string>();
  for (const corridor of scenario.corridors) {
    if (corridorIds.has(corridor.id)) errors.push(`duplicate corridor id: ${corridor.id}`);
    corridorIds.add(corridor.id);
    if (!regionIds.has(corridor.from_region_id)) {
      errors.push(`corridor ${corridor.id} from_region_id unknown: ${corridor.from_region_id}`);
    }
    if (!regionIds.has(corridor.to_region_id)) {
      errors.push(`corridor ${corridor.id} to_region_id unknown: ${corridor.to_region_id}`);
    }
    if (corridor.from_region_id === corridor.to_region_id) {
      errors.push(`corridor ${corridor.id} connects a region to itself`);
    }
  }

  const exitIds = new Set<string>();
  for (const exit of scenario.exits) {
    if (exitIds.has(exit.id)) errors.push(`duplicate exit id: ${exit.id}`);
    exitIds.add(exit.id);
    if (!regionIds.has(exit.region_id)) {
      errors.push(`exit ${exit.id} region_id unknown: ${exit.region_id}`);
    }
  }

  const thresholds = scenario.config.default_thresholds;
  if (!(thresholds.watch_density < thresholds.high_density && thresholds.high_density < thresholds.critical_density)) {
    errors.push('default thresholds must satisfy watch < high < critical');
  }

  for (const region of scenario.regions) {
    if (region.thresholds) {
      const t = region.thresholds;
      if (!(t.watch_density < t.high_density && t.high_density < t.critical_density)) {
        errors.push(`region ${region.id} thresholds must satisfy watch < high < critical`);
      }
    }
  }

  for (const demo of scenario.demo_scenarios) {
    for (const step of demo.steps) {
      if (step.action === 'observe') {
        for (const regionId of Object.keys(step.observations)) {
          if (!regionIds.has(regionId)) errors.push(`demo ${demo.id} observes unknown region: ${regionId}`);
        }
      }
      if (step.action === 'incident.create') {
        for (const id of step.affected.region_ids) {
          if (!regionIds.has(id)) errors.push(`demo ${demo.id} incident references unknown region: ${id}`);
        }
        for (const id of step.affected.corridor_ids) {
          if (!corridorIds.has(id)) errors.push(`demo ${demo.id} incident references unknown corridor: ${id}`);
        }
        for (const id of step.affected.exit_ids) {
          if (!exitIds.has(id)) errors.push(`demo ${demo.id} incident references unknown exit: ${id}`);
        }
      }
    }
  }

  return errors;
}

export function loadSafetyScenario(fileName = DEFAULT_SCENARIO_FILE): SafetyScenario {
  const filePath = path.isAbsolute(fileName) ? fileName : resolveDataPath('safety', fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Safety scenario not found: ${filePath}`);
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const scenario = SafetyScenarioSchema.parse(raw);
  const errors = validateScenarioReferences(scenario);
  if (errors.length > 0) {
    throw new Error(`Invalid safety scenario: ${errors.join('; ')}`);
  }
  return scenario;
}

/** 场景文件路径（用于状态接口展示实际输入来源）。 */
export function scenarioPath(fileName = DEFAULT_SCENARIO_FILE): string {
  return path.isAbsolute(fileName) ? fileName : resolveDataPath('safety', fileName);
}
