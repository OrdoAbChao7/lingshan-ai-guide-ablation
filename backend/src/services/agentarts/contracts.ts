import { z } from 'zod';
import { SceneStateSchema } from '../scene/scene-state';

export const CONTRACT_VERSION = '1.0.0';
export const ToolNameSchema = z.enum(['extract_scene_state', 'search_knowledge', 'plan_route', 'validate_route', 'suggest_alternative']);
export type ToolName = z.infer<typeof ToolNameSchema>;
export const QuerySchema = z.string().trim().min(1).max(4000);
export const SceneInputSchema = SceneStateSchema.partial().strict();
const minutes = z.number().int().nonnegative().max(1440);
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const violation = z.object({ code: z.string(), message: z.string(), stepIndex: z.number().int().nonnegative().optional() }).strict();
export const RouteSchema = z.object({
  startTime: clock,
  steps: z.array(z.object({
    spotId: z.string(), arrive: clock, start: clock, end: clock,
    walkMinutes: minutes, visitMinutes: minutes, waitingMinutes: minutes.optional(),
    performanceDurationMinutes: minutes.optional(), pathSpotIds: z.array(z.string()).max(100).optional(),
    reasonCode: z.string(), performanceId: z.string().optional(), performanceName: z.string().optional(),
    performanceStartTime: clock.optional(),
  }).strict()).max(23),
  totalMinutes: minutes, walkingMinutes: minutes, visitingMinutes: minutes, waitingMinutes: minutes,
  feasible: z.boolean().optional(), outcome: z.enum(['feasible', 'feasible_with_rejected_preferences', 'needs_clarification', 'infeasible']).optional(),
  satisfiedConstraints: z.array(z.string()).optional(),
  rejectedRequests: z.array(z.object({ item: z.string(), reasonCode: z.string() }).strict()).optional(),
  violations: z.array(violation).optional(),
}).strict();

export const toolInputs = {
  extract_scene_state: z.object({ query: QuerySchema }).strict(),
  search_knowledge: z.object({ query: QuerySchema }).strict(),
  plan_route: z.object({ scene_state: SceneInputSchema }).strict(),
  validate_route: z.object({ scene_state: SceneInputSchema, route: RouteSchema }).strict(),
  suggest_alternative: z.object({ scene_state: SceneInputSchema, failure_reasons: z.array(z.string()).max(30) }).strict(),
};
export const DecisionInputSchema = z.object({
  intent: z.enum(['knowledge', 'route']), query: QuerySchema.optional(), scene_state: SceneInputSchema.optional(),
}).strict().refine(value => value.intent === 'knowledge' ? Boolean(value.query) : Boolean(value.query || value.scene_state),
  'knowledge 需要 query；route 需要 query 或 scene_state');

export type ToolStatus = 'success' | 'needs_clarification' | 'infeasible' | 'no_evidence';
export interface ToolResult { status: ToolStatus; data: Record<string, any> }
