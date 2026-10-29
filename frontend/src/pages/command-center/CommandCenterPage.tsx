/**
 * SkyGuard 指挥大屏（/command-center）。
 *
 * 设计原则：
 *  - 所有内容来自后端真实 API（/api/v1/safety/*），页面本身不做任何安全判定；
 *  - 颜色永远与文字/原因同时出现，不单独依靠颜色传达状态；
 *  - 已验证方案与候选方案在视觉上严格区分；
 *  - REJECT 下不显示任何绿色路线，DEGRADED 下不把过期数据当成实时状态。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import safetyApi from '../../services/safetyApi';
import type {
  AuditEntry,
  DemoRunResult,
  EvacuationPlan,
  EvacuationRoute,
  ProviderStatus,
  SafetyIncident,
  SafetyRegion,
  SafetyScenarioSummary,
  SafetyStateName,
  SafetyStatus,
  SafetyValidationResult,
} from '../../services/safetyApi';
import './CommandCenterPage.css';

const STATE_LABEL: Record<SafetyStateName, string> = {
  NORMAL: '常态运行',
  REROUTE: '重规划中',
  DEGRADED: '感知降级',
  REJECT: '安全拒绝',
};

const RISK_LABEL: Record<string, string> = {
  normal: '正常',
  watch: '关注',
  high: '高风险',
  critical: '极高风险',
  unknown: '未知',
};

const POLL_INTERVAL_MS = 5000;

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('zh-CN', { hour12: false });
}

function formatSince(iso: string | null | undefined): string {
  if (!iso) return '无';
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s 前`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}min 前`;
  return `${(seconds / 3600).toFixed(1)}h 前`;
}

export default function CommandCenterPage() {
  const [status, setStatus] = useState<SafetyStatus | null>(null);
  const [scenario, setScenario] = useState<SafetyScenarioSummary | null>(null);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedDemo, setSelectedDemo] = useState<string>('');
  const [demoResult, setDemoResult] = useState<DemoRunResult | null>(null);
  const [nlText, setNlText] = useState('');
  const [draftSummary, setDraftSummary] = useState<string | null>(null);
  const [incidentForm, setIncidentForm] = useState({
    type: 'fire',
    severity: 'critical',
    target: 'exit:E_B',
    description: '东侧主出口附近报火情',
  });

  const refresh = useCallback(async () => {
    try {
      const [nextStatus, nextAudit] = await Promise.all([safetyApi.status(), safetyApi.audit(40)]);
      setStatus(nextStatus);
      setAudit(nextAudit);
      setError(null);
    } catch (caught) {
      setError(`无法读取安全状态：${(caught as Error).message}`);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [nextScenario, nextProviders] = await Promise.all([safetyApi.scenario(), safetyApi.providers()]);
        if (cancelled) return;
        setScenario(nextScenario);
        setProviders(nextProviders);
        setSelectedDemo(current => current || nextScenario.demo_scenarios[0]?.id || '');
      } catch (caught) {
        if (!cancelled) setError(`无法加载场景：${(caught as Error).message}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (!cancelled) void refresh();
    };
    // 首次拉取放到定时器回调里，避免在 effect 体内同步触发状态更新
    const initial = setTimeout(tick, 0);
    const timer = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [refresh]);

  const runAction = useCallback(
    async (name: string, action: () => Promise<unknown>, successMessage: string) => {
      setBusy(name);
      setNotice(null);
      try {
        await action();
        setNotice(successMessage);
        await refresh();
      } catch (caught) {
        const message = (caught as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error
          ?.message;
        setNotice(`操作失败：${message ?? (caught as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  if (!status) {
    return (
      <div className="cc-root cc-loading">
        <p>{error ?? '正在连接安全决策服务…'}</p>
        {error ? (
          <button type="button" onClick={() => void refresh()}>
            重试
          </button>
        ) : null}
      </div>
    );
  }

  const plan = status.plan;
  const candidate = status.candidate_plan;
  const displayPlan = plan ?? candidate;
  const isCandidate = !plan && Boolean(candidate);

  return (
    <div className="cc-root">
      <header className="cc-topbar">
        <div className="cc-brand">
          <span className="cc-brand-mark">SkyGuard</span>
          <span className="cc-brand-sub">可信安全决策指挥大屏</span>
        </div>
        <StateBadge state={status.state.state} headline={status.state.headline} />
        <div className="cc-meta">
          <span title={status.scenario.notice}>{status.scenario.name}</span>
          <span>v{status.versions.scenario}</span>
          <span>约束版本 {status.versions.constraint}</span>
          <span>观测版本 {status.versions.observation}</span>
          <span className={status.inference_health.healthy ? 'cc-ok' : 'cc-bad'}>
            推理链路 {status.inference_health.healthy ? '正常' : `异常（${status.inference_health.reason ?? '未知'}）`}
          </span>
        </div>
      </header>

      {status.scenario.notice ? <div className="cc-disclaimer">⚠ {status.scenario.notice}</div> : null}
      {error ? <div className="cc-banner cc-banner-error">{error}</div> : null}
      {notice ? <div className="cc-banner">{notice}</div> : null}

      <div className="cc-grid">
        {/* ---------------- 左列：感知输入 ---------------- */}
        <section className="cc-panel cc-col-left">
          <PanelTitle title="感知输入" subtitle="人群观测与 provider 状态" />
          <div className="cc-actions">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                void runAction(
                  'simulate',
                  () =>
                    safetyApi.simulate({
                      R_MAIN: { count: 380, confidence: 0.92 },
                      R_ATRIUM: { count: 140, confidence: 0.9 },
                      R_EAST: { count: 220, confidence: 0.91 },
                      R_NORTH: { count: 110, confidence: 0.88 },
                      R_SOUTH: { count: 80, confidence: 0.9 },
                      R_WEST: { count: 70, confidence: 0.89 },
                    }),
                  '已写入模拟观测（标记为 simulation）并重新规划',
                )
              }
            >
              写入模拟观测
            </button>
            <button type="button" disabled={busy !== null} onClick={() => void refresh()}>
              刷新
            </button>
          </div>

          <ProviderList providers={providers} />

          <h4 className="cc-subtitle">各区域观测</h4>
          <table className="cc-table">
            <thead>
              <tr>
                <th>区域</th>
                <th>人数</th>
                <th>密度</th>
                <th>置信度</th>
                <th>时效</th>
                <th>来源</th>
              </tr>
            </thead>
            <tbody>
              {status.regions.map(region => {
                const observation = status.observations.find(item => item.region_id === region.id);
                const risk = status.risks.find(item => item.regionId === region.id);
                return (
                  <tr key={region.id} className={`risk-${risk?.level ?? 'unknown'}`}>
                    <td>
                      {region.name}
                      <span className="cc-muted"> {region.id}</span>
                    </td>
                    <td>{observation ? observation.estimated_count : '—'}</td>
                    <td>
                      {observation ? observation.estimated_density.toFixed(2) : '—'}
                      <span className="cc-muted"> 人/m²</span>
                    </td>
                    <td>{observation ? observation.confidence.toFixed(2) : '—'}</td>
                    <td>{formatSince(observation?.observed_at)}</td>
                    <td>
                      <span className={`cc-tag source-${observation?.source ?? 'none'}`}>
                        {observation ? observation.source : '无数据'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="cc-muted cc-small">
            面积来源：{status.regions.map(region => region.area_provenance).filter((value, index, array) => array.indexOf(value) === index).join(' / ')}
            ；摄像机标定：{status.regions.map(region => region.camera.calibration_status).filter((value, index, array) => array.indexOf(value) === index).join(' / ')}
          </p>
        </section>

        {/* ---------------- 中列：态势图 ---------------- */}
        <section className="cc-panel cc-col-center">
          <PanelTitle
            title="区域态势与疏散路线"
            subtitle={`时限 ${status.scenario.horizon_minutes} 分钟 · ${displayPlan ? `方案 ${displayPlan.plan_id}` : '暂无方案'}`}
          />
          <NetworkMap status={status} />
          <Legend isCandidate={isCandidate} hasPlan={Boolean(displayPlan)} />
          <div className="cc-route-summary">
            {displayPlan ? (
              <>
                <span className={isCandidate ? 'cc-badge cc-badge-warn' : 'cc-badge cc-badge-ok'}>
                  {isCandidate ? '候选方案 · 未通过校验' : '已验证方案'}
                </span>
                <span>
                  已分配 {displayPlan.evacuated_persons} / {displayPlan.total_persons} 人
                </span>
                <span className={displayPlan.unresolved_persons > 0 ? 'cc-bad' : 'cc-ok'}>
                  未解决 {displayPlan.unresolved_persons} 人
                </span>
                <span>方式：时间扩展最大流（含容量与时限约束）</span>
              </>
            ) : (
              <span className="cc-bad">当前无可展示方案（{status.state.headline}）</span>
            )}
          </div>
          {displayPlan && displayPlan.unresolved.length > 0 ? (
            <ul className="cc-unresolved">
              {displayPlan.unresolved.map(item => (
                <li key={item.region_id}>
                  未解决：{item.region_id} 尚有 {item.persons} 人 —— {item.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        {/* ---------------- 右列：决策与操作 ---------------- */}
        <section className="cc-panel cc-col-right">
          <PanelTitle title="决策状态" subtitle={`进入于 ${formatTime(status.state_entered_at)}`} />
          <div className={`cc-state-block state-${status.state.state}`}>
            <div className="cc-state-name">
              {status.state.state} · {STATE_LABEL[status.state.state]}
            </div>
            <div className="cc-state-headline">{status.state.headline}</div>
            <ul className="cc-reasons">
              {status.state.reasons.map((reason, index) => (
                <li key={`${reason.code}-${index}`} className={`severity-${reason.severity}`}>
                  <code>{reason.code}</code> {reason.message}
                </li>
              ))}
            </ul>
            <div className="cc-state-flags">
              <span>可发布：{status.state.publishable ? '是' : '否'}</span>
              <span>需人工介入：{status.state.requires_operator_action ? '是' : '否'}</span>
              <span>最后一次有效观测：{formatSince(status.state.last_valid_observation_at)}</span>
            </div>
          </div>

          <h4 className="cc-subtitle">独立校验结果</h4>
          <ValidationPanel validation={status.validation} candidateShown={isCandidate} />

          <h4 className="cc-subtitle">出口分配</h4>
          <ExitAllocation status={status} plan={displayPlan} />

          <h4 className="cc-subtitle">事件管理</h4>
          <IncidentPanel
            incidents={status.incidents}
            busy={busy}
            onConfirm={id =>
              void runAction(`confirm-${id}`, () => safetyApi.confirmIncident(id), '事件已确认，已重新规划并校验')
            }
            onResolve={id =>
              void runAction(`resolve-${id}`, () => safetyApi.resolveIncident(id), '事件已解除，旧方案已失效并重新规划')
            }
          />
          <div className="cc-incident-form">
            <div className="cc-form-row">
              <select
                aria-label="事件类型"
                value={incidentForm.type}
                onChange={event => setIncidentForm({ ...incidentForm, type: event.target.value })}
              >
                <option value="fire">火灾</option>
                <option value="corridor_closure">通道关闭</option>
                <option value="crowd_surge">人流激增</option>
                <option value="sensor_failure">感知设备故障</option>
                <option value="other">其他</option>
              </select>
              <select
                aria-label="影响范围"
                value={incidentForm.target}
                onChange={event => setIncidentForm({ ...incidentForm, target: event.target.value })}
              >
                {status.exits.map(exit => (
                  <option key={exit.id} value={`exit:${exit.id}`}>
                    出口 {exit.name}
                  </option>
                ))}
                {status.corridors.map(corridor => (
                  <option key={corridor.id} value={`corridor:${corridor.id}`}>
                    通道 {corridor.name}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              aria-label="事件描述"
              value={nlText || incidentForm.description}
              onChange={event => {
                setNlText(event.target.value);
                setIncidentForm({ ...incidentForm, description: event.target.value });
              }}
              rows={2}
            />
            <div className="cc-form-row">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() =>
                  void runAction(
                    'parse',
                    async () => {
                      const draft = await safetyApi.parseIncident(textOf(incidentForm, nlText));
                      setDraftSummary(
                        `草稿：${draft.type} / ${draft.severity} / 影响 ${formatAffected(draft.affected)}` +
                          (draft.needs_human_review.length > 0
                            ? ` · 需人工确认：${draft.needs_human_review.join('；')}`
                            : ''),
                      );
                    },
                    '已生成事件草稿（不会改变任何约束）',
                  )
                }
              >
                解析文本
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() =>
                  void runAction(
                    'incident',
                    () =>
                      safetyApi.createIncident({
                        type: incidentForm.type,
                        description: incidentForm.description || '大屏登记事件',
                        severity: incidentForm.severity,
                        affected: affectedOf(incidentForm.target),
                        confirm_immediately: true,
                        source: 'operator',
                      }),
                    '事件已登记并确认，系统已重新规划与校验',
                  )
                }
              >
                登记并确认事件
              </button>
            </div>
            {draftSummary ? <p className="cc-muted cc-small">{draftSummary}</p> : null}
          </div>

          <h4 className="cc-subtitle">演示场景</h4>
          <div className="cc-form-row">
            <select
              aria-label="演示场景"
              value={selectedDemo}
              onChange={event => setSelectedDemo(event.target.value)}
            >
              {(scenario?.demo_scenarios ?? []).map(demo => (
                <option key={demo.id} value={demo.id}>
                  {demo.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy !== null || !selectedDemo}
              onClick={() =>
                void runAction(
                  'demo',
                  async () => {
                    const result = await safetyApi.runDemo(selectedDemo);
                    setDemoResult(result);
                  },
                  '演示已执行',
                )
              }
            >
              运行演示
            </button>
          </div>
          {demoResult ? (
            <p className={`cc-small ${demoResult.matched ? 'cc-ok' : 'cc-bad'}`}>
              期望 {demoResult.expected_state} / 实际 {demoResult.actual_state} ·{' '}
              {demoResult.matched ? '一致' : '不一致'}
            </p>
          ) : null}

          <h4 className="cc-subtitle">事件时间线（审计）</h4>
          <ul className="cc-timeline">
            {audit.slice(0, 12).map(entry => (
              <li key={entry.id} className={`audit-${entry.result}`}>
                <span className="cc-time">{formatTime(entry.ts)}</span>
                <span className="cc-actor">{entry.actor}</span>
                <span>{entry.summary}</span>
              </li>
            ))}
            {audit.length === 0 ? <li className="cc-muted">暂无审计记录</li> : null}
          </ul>
        </section>
      </div>
    </div>
  );
}

function textOf(form: { description: string }, text: string): string {
  return (text || form.description || '').trim();
}

function formatAffected(affected: { region_ids: string[]; corridor_ids: string[]; exit_ids: string[] }): string {
  const parts = [
    ...affected.region_ids.map(id => `区域 ${id}`),
    ...affected.corridor_ids.map(id => `通道 ${id}`),
    ...affected.exit_ids.map(id => `出口 ${id}`),
  ];
  return parts.length > 0 ? parts.join('、') : '未识别';
}

function affectedOf(target: string): { region_ids: string[]; corridor_ids: string[]; exit_ids: string[] } {
  const [kind, id] = target.split(':');
  if (kind === 'exit') return { region_ids: [], corridor_ids: [], exit_ids: [id] };
  if (kind === 'corridor') return { region_ids: [], corridor_ids: [id], exit_ids: [] };
  return { region_ids: [id], corridor_ids: [], exit_ids: [] };
}

function PanelTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="cc-panel-title">
      <h3>{title}</h3>
      <span>{subtitle}</span>
    </div>
  );
}

function StateBadge({ state, headline }: { state: SafetyStateName; headline: string }) {
  return (
    <div className={`cc-state-badge state-${state}`} role="status">
      <strong>{state}</strong>
      <span>{STATE_LABEL[state]}</span>
      <em>{headline}</em>
    </div>
  );
}

function ProviderList({ providers }: { providers: ProviderStatus[] }) {
  if (providers.length === 0) return <p className="cc-muted">正在探测感知 provider…</p>;
  return (
    <ul className="cc-providers">
      {providers.map(provider => (
        <li key={provider.id} className={provider.available ? 'cc-ok' : 'cc-bad'}>
          <div>
            <strong>{provider.kind}</strong> · {provider.model_version}
          </div>
          <div className="cc-small">
            {provider.available ? '可用' : '不可用'} · 本机验证：
            {provider.verified_on_this_host ? '是' : '否'}
          </div>
          {provider.checks
            .filter(check => !check.ok)
            .map(check => (
              <div key={check.name} className="cc-small cc-muted">
                ✕ {check.name}：{check.detail}
              </div>
            ))}
        </li>
      ))}
    </ul>
  );
}

function ValidationPanel({
  validation,
  candidateShown,
}: {
  validation: SafetyValidationResult | null;
  candidateShown: boolean;
}) {
  if (!validation) {
    return <p className="cc-muted">尚无校验记录。</p>;
  }
  return (
    <div className="cc-validation">
      <div className={validation.valid ? 'cc-badge cc-badge-ok' : 'cc-badge cc-badge-bad'}>
        {validation.valid ? '通过独立校验' : '未通过独立校验'}
      </div>
      <div className="cc-small cc-muted">
        校验于 {formatTime(validation.checked_at)} · {validation.checks_run.length} 项检查
      </div>
      {validation.violations.length > 0 ? (
        <ul className="cc-violations">
          {validation.violations.map((violation, index) => (
            <li key={`${violation.code}-${index}`} className={`severity-${violation.severity}`}>
              <code>{violation.code}</code> {violation.message}
            </li>
          ))}
        </ul>
      ) : null}
      {candidateShown && !validation.valid ? (
        <p className="cc-small cc-bad">当前展示的是候选方案，仅供人工研判，未经安全验证。</p>
      ) : null}
    </div>
  );
}

function ExitAllocation({ status, plan }: { status: SafetyStatus; plan: EvacuationPlan | null }) {
  return (
    <table className="cc-table">
      <thead>
        <tr>
          <th>出口</th>
          <th>有效状态</th>
          <th>容量（人/分）</th>
          <th>分配</th>
        </tr>
      </thead>
      <tbody>
        {status.exits.map(exit => {
          const allocated = plan?.exit_totals.find(item => item.exit_id === exit.id)?.persons ?? 0;
          const closed = exit.effective_status !== 'open' || !exit.usable;
          return (
            <tr key={exit.id} className={closed ? 'cc-closed' : undefined}>
              <td>
                {exit.name}
                <span className="cc-muted"> {exit.id}</span>
              </td>
              <td>
                {exit.effective_status}
                {exit.blocked_by_incident_id ? <span className="cc-muted"> (事件)</span> : null}
              </td>
              <td>{exit.capacity_per_min ?? '未知'}</td>
              <td>{allocated}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function IncidentPanel({
  incidents,
  busy,
  onConfirm,
  onResolve,
}: {
  incidents: SafetyIncident[];
  busy: string | null;
  onConfirm: (id: string) => void;
  onResolve: (id: string) => void;
}) {
  if (incidents.length === 0) return <p className="cc-muted">当前无事件。</p>;
  return (
    <ul className="cc-incidents">
      {incidents.map(incident => (
        <li key={incident.id} className={`incident-${incident.status}`}>
          <div>
            <strong>{incident.type}</strong> · {incident.description}
          </div>
          <div className="cc-small cc-muted">
            状态 {incident.status} · 影响 {formatAffected(incident.affected)} · 上报 {formatTime(incident.reported_at)}
          </div>
          <div className="cc-form-row">
            {incident.status === 'reported' ? (
              <button type="button" disabled={busy !== null} onClick={() => onConfirm(incident.id)}>
                确认事件
              </button>
            ) : null}
            {incident.status === 'confirmed' ? (
              <button type="button" disabled={busy !== null} onClick={() => onResolve(incident.id)}>
                解除事件
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Legend({ isCandidate, hasPlan }: { isCandidate: boolean; hasPlan: boolean }) {
  return (
    <div className="cc-legend">
      <span className="legend-swatch validated" /> 已验证路线{hasPlan && !isCandidate ? '（当前显示）' : ''}
      <span className="legend-swatch candidate" /> 候选路线（未校验）
      <span className="legend-swatch closed" /> 已关闭通道/出口
      <span className="legend-swatch unknown" /> 状态未知
    </div>
  );
}

// ---------------------------------------------------------------------------
// 态势图
// ---------------------------------------------------------------------------

interface RouteGroup {
  key: string;
  fromRegionId: string;
  exitId: string;
  persons: number;
  points: Array<{ x: number; y: number }>;
  earliestMinute: number;
  latestMinute: number;
}

function centreOf(region: SafetyRegion): { x: number; y: number } {
  return { x: region.geometry.x + region.geometry.width / 2, y: region.geometry.y + region.geometry.height / 2 };
}

function groupRoutes(
  plan: EvacuationPlan | null,
  regions: SafetyRegion[],
  exits: SafetyStatus['exits'],
): RouteGroup[] {
  if (!plan) return [];
  const regionById = new Map(regions.map(region => [region.id, region]));
  const exitById = new Map(exits.map(exit => [exit.id, exit]));
  const groups = new Map<string, RouteGroup>();

  for (const route of plan.routes as EvacuationRoute[]) {
    const key = `${route.from_region_id}->${route.exit_id}`;
    const existing = groups.get(key);
    const points = buildRoutePoints(route, regionById, exitById);
    if (existing) {
      existing.persons += route.persons;
      existing.earliestMinute = Math.min(existing.earliestMinute, route.depart_minute);
      existing.latestMinute = Math.max(existing.latestMinute, route.arrive_minute);
      continue;
    }
    groups.set(key, {
      key,
      fromRegionId: route.from_region_id,
      exitId: route.exit_id,
      persons: route.persons,
      points,
      earliestMinute: route.depart_minute,
      latestMinute: route.arrive_minute,
    });
  }
  return [...groups.values()];
}

function buildRoutePoints(
  route: EvacuationRoute,
  regionById: Map<string, SafetyRegion>,
  exitById: Map<string, SafetyStatus['exits'][number]>,
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  const origin = regionById.get(route.from_region_id);
  if (origin) points.push(centreOf(origin));
  for (const step of route.steps) {
    const region = regionById.get(step.to_region_id);
    if (region) points.push(centreOf(region));
  }
  const exit = exitById.get(route.exit_id);
  if (exit) {
    const region = regionById.get(exit.region_id);
    if (region) {
      points.push({
        x: region.geometry.x + region.geometry.width,
        y: region.geometry.y + region.geometry.height / 2,
      });
    }
  }
  return points;
}

function NetworkMap({ status }: { status: SafetyStatus }) {
  const plan = status.plan;
  const candidate = status.candidate_plan;
  const showValidated = Boolean(plan) && status.state.validated_route_display_allowed;
  const showCandidate = !showValidated && Boolean(candidate) && status.state.candidate_route_display_allowed;
  const activePlan = showValidated ? plan : showCandidate ? candidate : null;

  const bounds = useMemo(() => {
    let maxX = 0;
    let maxY = 0;
    for (const region of status.regions) {
      maxX = Math.max(maxX, region.geometry.x + region.geometry.width);
      maxY = Math.max(maxY, region.geometry.y + region.geometry.height);
    }
    return { width: maxX + 40, height: maxY + 40 };
  }, [status.regions]);

  const routes = useMemo(
    () => groupRoutes(activePlan, status.regions, status.exits),
    [activePlan, status.regions, status.exits],
  );

  const regionById = new Map(status.regions.map(region => [region.id, region]));

  // 把路线经过的通道高亮出来
  const highlighted = new Set<string>();
  for (const route of activePlan?.routes ?? []) {
    for (const step of route.steps) highlighted.add(step.corridor_id);
  }

  return (
    <svg
      className="cc-map"
      viewBox={`0 0 ${bounds.width} ${bounds.height}`}
      role="img"
      aria-label="区域态势与疏散路线示意图"
    >
      <rect x={0} y={0} width={bounds.width} height={bounds.height} className="map-bg" />

      {status.corridors.map(corridor => {
        const from = regionById.get(corridor.from_region_id);
        const to = regionById.get(corridor.to_region_id);
        if (!from || !to) return null;
        const start = centreOf(from);
        const end = centreOf(to);
        const className =
          corridor.effective_status === 'closed' || !corridor.usable
            ? 'map-corridor map-corridor-closed'
            : corridor.effective_status === 'unknown'
              ? 'map-corridor map-corridor-unknown'
              : highlighted.has(corridor.id)
                ? 'map-corridor map-corridor-active'
                : 'map-corridor';
        return (
          <g key={corridor.id}>
            <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} className={className} />
            <title>
              {corridor.name} · 状态 {corridor.effective_status} · 容量 {corridor.capacity_per_min ?? '未知'} 人/分 ·{' '}
              {corridor.status_reason}
            </title>
            <text x={(start.x + end.x) / 2} y={(start.y + end.y) / 2 - 4} className="map-label">
              {corridor.id}
            </text>
          </g>
        );
      })}

      {status.regions.map(region => {
        const risk = status.risks.find(item => item.regionId === region.id);
        const geometry = region.geometry;
        return (
          <g key={region.id}>
            <rect
              x={geometry.x}
              y={geometry.y}
              width={geometry.width}
              height={geometry.height}
              rx={10}
              className={`map-region risk-${risk?.level ?? 'unknown'}`}
            />
            <text x={geometry.x + 12} y={geometry.y + 26} className="map-region-name">
              {region.name}
            </text>
            <text x={geometry.x + 12} y={geometry.y + 48} className="map-region-info">
              {risk?.count ?? '—'} 人 · {risk?.density?.toFixed(2) ?? '—'} 人/m²
            </text>
            <text x={geometry.x + 12} y={geometry.y + 68} className="map-region-info">
              风险 {RISK_LABEL[risk?.level ?? 'unknown']}
              {risk && !risk.trusted ? '（数据不可信）' : ''}
            </text>
            <title>
              {region.name} · 面积 {region.area_m2} m² ({region.area_provenance}) · 摄像机标定{' '}
              {region.camera.calibration_status}
            </title>
          </g>
        );
      })}

      {status.exits.map((exit, index) => {
        const region = regionById.get(exit.region_id);
        if (!region) return null;
        const y = region.geometry.y + region.geometry.height / 2 + index * 14 - 20;
        const x = region.geometry.x + region.geometry.width;
        return (
          <g key={exit.id}>
            <rect
              x={x - 6}
              y={y - 6}
              width={12}
              height={12}
              className={`map-exit ${exit.effective_status === 'open' && exit.usable ? 'map-exit-open' : 'map-exit-closed'}`}
            />
            <text x={x + 10} y={y + 4} className="map-exit-label">
              {exit.id}
            </text>
            <title>
              出口 {exit.name} · {exit.effective_status} · 容量 {exit.capacity_per_min ?? '未知'} 人/分
            </title>
          </g>
        );
      })}

      {routes.map(route => (
        <g key={route.key}>
          <polyline
            points={route.points.map(point => `${point.x},${point.y}`).join(' ')}
            className={showValidated ? 'map-route map-route-validated' : 'map-route map-route-candidate'}
            fill="none"
          />
          <title>
            {route.fromRegionId} → {route.exitId} · {route.persons} 人 · t{route.earliestMinute}–{route.latestMinute} 分钟 ·{' '}
            {showValidated ? '已通过独立校验' : '候选方案，未通过校验'}
          </title>
        </g>
      ))}

      {routes.length > 0
        ? routes.map(route => {
            const last = route.points[route.points.length - 1];
            return (
              <text key={`${route.key}-label`} x={last.x - 46} y={last.y - 8} className="map-route-label">
                {route.persons}人
              </text>
            );
          })
        : null}
    </svg>
  );
}
