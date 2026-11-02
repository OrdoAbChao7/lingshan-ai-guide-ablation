/**
 * SkyGuard 指挥大屏（/command-center）。
 *
 * 设计原则（与 docs/UI_DESIGN_SYSTEM.md 一致）：
 *  - 所有内容来自后端真实 API（/api/v1/safety/*），页面本身不做任何安全判定；
 *  - 颜色永远与文字/原因同时出现，不单独依靠颜色传达状态；
 *  - 已验证方案与候选方案在视觉上严格区分；
 *  - REJECT 下不显示任何绿色路线，DEGRADED 下不把过期数据当成实时状态；
 *  - 不使用 emoji 充当结构性图标，图标统一取自 ./icons；
 *  - 状态色只用于「一屏之内不超过 4 处」，其余一律中性色 + 层级灰度。
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
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle,
  Crosshair,
  DoorExit,
  Lock,
  Play,
  RefreshCw,
  ShieldCheck,
  ShieldMark,
  Timer,
  Users,
  WarningOctagon,
  XCircle,
} from './icons';
import LingMark from '../../components/brand/LingMark';
import BackgroundArt from './BackgroundArt';
import './CommandCenterPage.css';

const STATE_LABEL: Record<SafetyStateName, string> = {
  NORMAL: '常态运行',
  REROUTE: '重规划中',
  DEGRADED: '感知降级',
  REJECT: '安全拒绝',
};

/** 状态语义槽位：NORMAL=ok / REROUTE=info / DEGRADED=warn / REJECT=danger。 */
const STATE_TONE: Record<SafetyStateName, 'ok' | 'info' | 'warn' | 'danger'> = {
  NORMAL: 'ok',
  REROUTE: 'info',
  DEGRADED: 'warn',
  REJECT: 'danger',
};

const RISK_LABEL: Record<string, string> = {
  normal: '正常',
  watch: '关注',
  high: '高风险',
  critical: '极高风险',
  unknown: '未知',
};

const RISK_ORDER = ['normal', 'watch', 'high', 'critical', 'unknown'] as const;

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
      <div className="cc-root">
        <BackgroundArt />
        <div className="cc-boot">
          <ShieldMark size={34} className="cc-boot-mark" />
          <p className="cc-boot-text">{error ?? '正在连接安全决策服务…'}</p>
          {error ? (
            <button type="button" className="cc-btn cc-btn-secondary" onClick={() => void refresh()}>
              <RefreshCw size={14} />
              重试
            </button>
          ) : (
            <span className="cc-boot-bar" aria-hidden="true" />
          )}
        </div>
      </div>
    );
  }

  const plan = status.plan;
  const candidate = status.candidate_plan;
  const displayPlan = plan ?? candidate;
  const isCandidate = !plan && Boolean(candidate);
  const tone = STATE_TONE[status.state.state];
  const openExits = status.exits.filter(exit => exit.effective_status === 'open' && exit.usable).length;
  const trustedRegions = status.risks.filter(risk => risk.trusted).length;
  const observedPersons = status.risks.reduce((sum, risk) => (risk.trusted ? sum + (risk.count ?? 0) : sum), 0);
  const riskCounts = status.risk_summary.counts ?? {};
  const riskTotal = RISK_ORDER.reduce((sum, level) => sum + (riskCounts[level] ?? 0), 0) || 1;

  return (
    <div className="cc-root">
      <BackgroundArt />
      <div className="cc-shell">
        <header className="cc-topbar">
          <div className="cc-brand">
            <span className="cc-brand-mark" title="灵山胜境 · 空间时空可信安全指挥枢纽">
              <ShieldMark size={24} />
              <span className="cc-brand-lingmark">
                <LingMark size={14} strokeWidth={1.8} />
              </span>
            </span>
            <span className="cc-brand-text">
              <span className="cc-brand-title-row">
                <strong>SkyGuard</strong>
                <span className="cc-brand-badge">可信安全指挥大屏</span>
                <span className="cc-brand-seal">时空仲裁</span>
              </span>
              <em>灵山胜境 · 空间时空多约束规划与安全仲裁中心</em>
            </span>
          </div>

          <StateBadge state={status.state.state} headline={status.state.headline} tone={tone} />

          <div className="cc-topbar-side">
            <span className="cc-live">
              <span className="cc-live-dot" aria-hidden="true" />
              实时 · {POLL_INTERVAL_MS / 1000}s 轮询
            </span>
            <a className="cc-link" href="/">
              返回游客端
              <ArrowUpRight size={13} />
            </a>
          </div>
        </header>

        <div className="cc-metabar">
          <MetaItem label="空间基准" value="无锡 · 太湖之滨" />
          <MetaItem label="天元坐标" value="E 120°09′ N 31°25′" mono />
          <MetaItem label="场景" value={status.scenario.name} title={status.scenario.notice} />
          <MetaItem label="场景版本" value={`v${status.versions.scenario}`} mono />
          <MetaItem label="约束版本" value={String(status.versions.constraint)} mono />
          <MetaItem label="观测版本" value={String(status.versions.observation)} mono />
          <MetaItem
            label="推理链路"
            value={status.inference_health.healthy ? '正常' : `异常（${status.inference_health.reason ?? '未知'}）`}
            state={status.inference_health.healthy ? 'ok' : 'danger'}
          />
          <MetaItem label="最近决策" value={formatTime(status.state.decided_at)} mono />
        </div>

        {status.scenario.notice ? (
          <div className="cc-notice">
            <AlertTriangle size={15} />
            <span>{status.scenario.notice}</span>
          </div>
        ) : null}
        {error ? (
          <div className="cc-notice cc-notice-danger">
            <XCircle size={15} />
            <span>{error}</span>
          </div>
        ) : null}
        {notice ? (
          <div className="cc-notice cc-notice-info">
            <CheckCircle size={15} />
            <span>{notice}</span>
          </div>
        ) : null}

        {/* ---------------- KPI 概要条 ---------------- */}
        <section className="cc-kpi-rail" aria-label="关键指标">
          <KpiTile
            icon={<Users size={15} />}
            label="可信区域在场人数"
            value={observedPersons.toLocaleString('zh-CN')}
            hint={`可信区域 ${trustedRegions}/${status.regions.length} · 未可信区域不计入`}
            tone={trustedRegions === 0 ? 'warn' : 'neutral'}
          />
          <KpiTile
            icon={<ShieldCheck size={15} />}
            label="方案疏散分配"
            value={displayPlan ? `${displayPlan.evacuated_persons}/${displayPlan.total_persons}` : '—'}
            hint={displayPlan ? (isCandidate ? '校验未通过，仅供研判' : '独立校验通过') : '暂无方案'}
            tone={displayPlan ? (isCandidate ? 'warn' : 'ok') : 'neutral'}
            progress={displayPlan ? displayPlan.evacuated_persons / Math.max(1, displayPlan.total_persons) : 0}
          />
          <KpiTile
            icon={<WarningOctagon size={15} />}
            label="未解决需求"
            value={displayPlan ? String(displayPlan.unresolved_persons) : '—'}
            hint={
              displayPlan && displayPlan.unresolved_persons > 0
                ? '需人工介入，禁止自动放行'
                : '无未分配人员'
            }
            tone={displayPlan && displayPlan.unresolved_persons > 0 ? 'danger' : 'ok'}
          />
          <KpiTile
            icon={<DoorExit size={15} />}
            label="可用出口"
            value={`${openExits}/${status.exits.length}`}
            hint={`时限 ${status.scenario.horizon_minutes} 分钟`}
            tone={openExits === 0 ? 'danger' : 'neutral'}
          />
          <div className="cc-kpi-risk">
            <div className="cc-kpi-risk-head">
              <span>区域风险分布</span>
              <span className="cc-kpi-risk-total">{RISK_ORDER.reduce((sum, level) => sum + (riskCounts[level] ?? 0), 0)} 区域</span>
            </div>
            <div className="cc-risk-bar" role="img" aria-label="各风险等级的区域数量分布">
              {RISK_ORDER.map(level => {
                const count = riskCounts[level] ?? 0;
                if (count === 0) return null;
                return (
                  <span
                    key={level}
                    className={`cc-risk-seg risk-${level}`}
                    style={{ flexGrow: count / riskTotal }}
                    title={`${RISK_LABEL[level]}：${count} 个区域`}
                  />
                );
              })}
            </div>
            <div className="cc-risk-legend">
              {RISK_ORDER.map(level => (
                <span key={level} className="cc-risk-legend-item">
                  <i className={`cc-dot risk-${level}`} aria-hidden="true" />
                  {RISK_LABEL[level]}
                  <b>{riskCounts[level] ?? 0}</b>
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- 3秒值班决策指示条 ---------------- */}
        <DutyDecisionStrip status={status} tone={tone} />

        <div className="cc-grid">
          {/* ---------------- 左列：感知输入 ---------------- */}
          <section className="cc-panel cc-panel-perception" aria-label="感知输入">
            <PanelHead index="01" title="感知输入" subtitle="观测与 provider 状态" />

            <div className="cc-btn-row">
              <button
                type="button"
                className="cc-btn cc-btn-primary"
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
                <Activity size={14} />
                写入模拟观测
              </button>
              <button
                type="button"
                className="cc-btn cc-btn-ghost"
                disabled={busy !== null}
                onClick={() => void refresh()}
                aria-label="刷新当前状态"
              >
                <RefreshCw size={14} />
                刷新
              </button>
            </div>

            <SubHead>感知 provider</SubHead>
            <ProviderList providers={providers} />

            <SubHead>各区域观测</SubHead>
            <div className="cc-table-wrap">
              <table className="cc-table">
                <thead>
                  <tr>
                    <th scope="col">区域</th>
                    <th scope="col" className="num">
                      人数
                    </th>
                    <th scope="col" className="num">
                      密度
                    </th>
                    <th scope="col" className="num">
                      置信
                    </th>
                    <th scope="col">时效</th>
                    <th scope="col">来源</th>
                  </tr>
                </thead>
                <tbody>
                  {status.regions.map(region => {
                    const observation = status.observations.find(item => item.region_id === region.id);
                    const risk = status.risks.find(item => item.regionId === region.id);
                    return (
                      <tr key={region.id} className={`risk-${risk?.level ?? 'unknown'}`}>
                        <td>
                          <span className="cc-region-cell">
                            <i className={`cc-dot risk-${risk?.level ?? 'unknown'}`} aria-hidden="true" />
                            <span>
                              {region.name}
                              <span className="cc-code">{region.id}</span>
                            </span>
                          </span>
                        </td>
                        <td className="num">
                          {observation ? (
                            <span className="cc-num">{observation.estimated_count}</span>
                          ) : (
                            <span className="cc-num cc-num-empty">—</span>
                          )}
                        </td>
                        <td className="num">
                          {observation ? (
                            <span className="cc-num">{observation.estimated_density.toFixed(2)}</span>
                          ) : (
                            <span className="cc-num cc-num-empty">—</span>
                          )}
                        </td>
                        <td className="num">
                          {observation ? (
                            <span className="cc-num">{observation.confidence.toFixed(2)}</span>
                          ) : (
                            <span className="cc-num cc-num-empty">—</span>
                          )}
                        </td>
                        <td className="cc-cell-muted">{formatSince(observation?.observed_at)}</td>
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
            </div>
            <p className="cc-footnote">
              面积来源：
              {status.regions
                .map(region => region.area_provenance)
                .filter((value, index, array) => array.indexOf(value) === index)
                .join(' / ')}
              ；摄像机标定：
              {status.regions
                .map(region => region.camera.calibration_status)
                .filter((value, index, array) => array.indexOf(value) === index)
                .join(' / ')}
            </p>
          </section>

          {/* ---------------- 中列：态势图 ---------------- */}
          <section className="cc-panel cc-panel-map" aria-label="区域态势与疏散路线">
            <PanelHead
              index="02"
              title="区域态势与疏散路线"
              subtitle={
                displayPlan
                  ? `${displayPlan.plan_id} · 时限 ${status.scenario.horizon_minutes} 分钟`
                  : `时限 ${status.scenario.horizon_minutes} 分钟 · 暂无方案`
              }
            />
            <div className="cc-map-frame">
              <NetworkMap status={status} />
            </div>
            <Legend isCandidate={isCandidate} hasPlan={Boolean(displayPlan)} />
            <div className="cc-route-summary">
              {displayPlan ? (
                <>
                  <span className={`cc-chip tone-${isCandidate ? 'warn' : 'ok'}`}>
                    {isCandidate ? <AlertTriangle size={12} /> : <ShieldCheck size={12} />}
                    <span>{isCandidate ? '候选方案 · 未通过校验' : '已验证方案'}</span>
                  </span>
                  <span className="cc-metric">
                    已分配
                    <b>{displayPlan.evacuated_persons}</b>/{displayPlan.total_persons} 人
                  </span>
                  <span className={`cc-metric ${displayPlan.unresolved_persons > 0 ? 'is-danger' : 'is-ok'}`}>
                    未解决
                    <b>{displayPlan.unresolved_persons}</b> 人
                  </span>
                  <span className="cc-metric-muted">
                    <Timer size={12} />
                    时间扩展最大流 · 含容量与时限约束
                  </span>
                </>
              ) : (
                <span className="cc-empty-line">
                  <XCircle size={14} />
                  当前无可展示方案（{status.state.headline}）
                </span>
              )}
            </div>
            {displayPlan && displayPlan.unresolved.length > 0 ? (
              <ul className="cc-unresolved">
                {displayPlan.unresolved.map(item => (
                  <li key={item.region_id}>
                    <WarningOctagon size={13} />
                    <span>
                      未解决：{item.region_id} 尚有 {item.persons} 人 —— {item.reason}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          {/* ---------------- 右列：决策与校验 ---------------- */}
          <section className="cc-panel cc-panel-decision" aria-label="决策状态">
            <PanelHead index="03" title="决策状态" subtitle={`进入于 ${formatTime(status.state_entered_at)}`} />

            <div className={`cc-state-block tone-${tone}`}>
              <div className="cc-state-name">
                {status.state.state} · {STATE_LABEL[status.state.state]}
              </div>
              <div className="cc-state-headline">{status.state.headline}</div>
              <ul className="cc-reasons">
                {status.state.reasons.map((reason, index) => (
                  <li key={`${reason.code}-${index}`} className={`severity-${reason.severity}`}>
                    <span className={`cc-dot severity-${reason.severity}`} aria-hidden="true" />
                    <code>{reason.code}</code>
                    <span>{reason.message}</span>
                  </li>
                ))}
              </ul>
              <div className="cc-state-flags">
                <span className={`cc-flag ${status.state.publishable ? 'is-ok' : 'is-danger'}`}>
                  可发布：{status.state.publishable ? '是' : '否'}
                </span>
                <span className={`cc-flag ${status.state.requires_operator_action ? 'is-warn' : 'is-ok'}`}>
                  需人工介入：{status.state.requires_operator_action ? '是' : '否'}
                </span>
                <span className="cc-flag">
                  最后一次有效观测：{formatSince(status.state.last_valid_observation_at)}
                </span>
              </div>
            </div>

            <SubHead>独立校验结果</SubHead>
            <ValidationPanel validation={status.validation} candidateShown={isCandidate} />

            <SubHead>出口分配</SubHead>
            <div className="cc-table-wrap">
              <table className="cc-table">
                <thead>
                  <tr>
                    <th scope="col">出口</th>
                    <th scope="col">状态</th>
                    <th scope="col" className="num">
                      容量
                    </th>
                    <th scope="col" className="num">
                      分配
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {status.exits.map(exit => {
                    const allocated = displayPlan?.exit_totals.find(item => item.exit_id === exit.id)?.persons ?? 0;
                    const closed = exit.effective_status !== 'open' || !exit.usable;
                    return (
                      <tr key={exit.id} className={closed ? 'cc-closed' : undefined}>
                        <td>
                          <span className="cc-region-cell">
                            <i className={closed ? 'cc-dot is-off' : 'cc-dot is-on'} aria-hidden="true" />
                            <span>
                              {exit.name}
                              <span className="cc-code">{exit.id}</span>
                            </span>
                          </span>
                        </td>
                        <td>
                          <span className={`cc-tag ${closed ? 'source-none' : 'source-open'}`}>
                            {exit.effective_status}
                          </span>
                          {exit.blocked_by_incident_id ? <span className="cc-code">事件</span> : null}
                        </td>
                        <td className="num">
                          <span className="cc-num">{exit.capacity_per_min ?? '未知'}</span>
                        </td>
                        <td className="num">
                          <span className="cc-num">{allocated}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="cc-footnote">容量单位：人/分 · 分配为当前展示方案的出口合计</p>
          </section>
        </div>

        {/* ---------------- 底部：操作与审计 ---------------- */}
        <div className="cc-bottom">
          <section className="cc-panel" aria-label="事件与操作">
            <PanelHead index="04" title="事件与操作" subtitle="写入需管理员身份" />

            <SubHead>当前事件</SubHead>
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

            <SubHead>登记事件</SubHead>
            <div className="cc-form">
              <div className="cc-form-grid">
                <label className="cc-field">
                  <span>事件类型</span>
                  <select
                    value={incidentForm.type}
                    onChange={event => setIncidentForm({ ...incidentForm, type: event.target.value })}
                  >
                    <option value="fire">火灾</option>
                    <option value="corridor_closure">通道关闭</option>
                    <option value="crowd_surge">人流激增</option>
                    <option value="sensor_failure">感知设备故障</option>
                    <option value="other">其他</option>
                  </select>
                </label>
                <label className="cc-field">
                  <span>影响范围</span>
                  <select
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
                </label>
                <label className="cc-field cc-field-wide">
                  <span>事件描述</span>
                  <textarea
                    value={nlText || incidentForm.description}
                    onChange={event => {
                      setNlText(event.target.value);
                      setIncidentForm({ ...incidentForm, description: event.target.value });
                    }}
                    rows={2}
                  />
                </label>
              </div>
              <div className="cc-btn-row">
                <button
                  type="button"
                  className="cc-btn cc-btn-ghost"
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
                  className="cc-btn cc-btn-danger"
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
                  <AlertTriangle size={14} />
                  登记并确认事件
                </button>
              </div>
              {draftSummary ? <p className="cc-footnote">{draftSummary}</p> : null}
            </div>

            <SubHead>演示场景</SubHead>
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
                className="cc-btn cc-btn-primary"
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
                <Play size={14} />
                运行演示
              </button>
            </div>
            {demoResult ? (
              <p className={`cc-demo-result ${demoResult.matched ? 'is-ok' : 'is-danger'}`}>
                {demoResult.matched ? <CheckCircle size={13} /> : <XCircle size={13} />}
                <span>
                  期望 {demoResult.expected_state} / 实际 {demoResult.actual_state} ·{' '}
                  {demoResult.matched ? '一致' : '不一致'}
                </span>
              </p>
            ) : null}

            <p className="cc-hint">
              <Lock size={12} />
              写操作需在
              <a className="cc-link" href="/admin/login">
                管理后台
              </a>
              登录后取得 JWT；只读接口开放。
            </p>
          </section>

          <section className="cc-panel" aria-label="审计时间线">
            <PanelHead index="05" title="审计时间线" subtitle="append-only · 最近 12 条" />
            <div className="cc-audit">
              <div className="cc-audit-head" aria-hidden="true">
                <span>时间</span>
                <span>操作人</span>
                <span>动作</span>
                <span>摘要</span>
              </div>
              <ul className="cc-audit-list">
                {audit.slice(0, 12).map(entry => (
                  <li key={entry.id} className={`audit-${entry.result}`}>
                    <span className="cc-audit-time">{formatTime(entry.ts)}</span>
                    <span className="cc-audit-actor">{entry.actor}</span>
                    <span
                      className={`cc-audit-action tone-${entry.result === 'success' ? 'ok' : 'danger'}`}
                      title={entry.action}
                    >
                      {entry.action}
                    </span>
                    <span className="cc-audit-summary" title={entry.summary}>
                      {entry.summary}
                    </span>
                  </li>
                ))}
                {audit.length === 0 ? <li className="cc-audit-empty">暂无审计记录</li> : null}
              </ul>
            </div>
            <p className="cc-footnote">审计日志由后端追加写入 JSONL，前端只读且不可改写历史记录。</p>
          </section>
        </div>
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

// ---------------------------------------------------------------------------
// 通用呈现组件
// ---------------------------------------------------------------------------

function PanelHead({ index, title, subtitle }: { index: string; title: string; subtitle: string }) {
  return (
    <div className="cc-panel-head">
      <span className="cc-panel-index">
        <span className="cc-index-dot" aria-hidden="true" />
        {index}
      </span>
      <div className="cc-panel-heading">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

function SubHead({ children }: { children: React.ReactNode }) {
  return <h3 className="cc-subhead">{children}</h3>;
}

function MetaItem({
  label,
  value,
  mono,
  state,
  title,
}: {
  label: string;
  value: string;
  mono?: boolean;
  state?: 'ok' | 'danger';
  title?: string;
}) {
  return (
    <span className="cc-metabar-item" title={title}>
      <span className="cc-metabar-label">{label}</span>
      <span className={`cc-metabar-value ${mono ? 'is-mono' : ''} ${state ? `is-${state}` : ''}`}>{value}</span>
    </span>
  );
}

function KpiTile({
  icon,
  label,
  value,
  hint,
  tone,
  progress,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: 'ok' | 'warn' | 'danger' | 'neutral';
  progress?: number;
}) {
  return (
    <div className={`cc-kpi tone-${tone}`}>
      <div className="cc-kpi-head">
        <span className="cc-kpi-icon">{icon}</span>
        <span className="cc-kpi-label">{label}</span>
      </div>
      <div className="cc-kpi-value">{value}</div>
      {typeof progress === 'number' ? (
        <div className="cc-kpi-progress" aria-hidden="true">
          <span style={{ width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%` }} />
        </div>
      ) : null}
      <div className="cc-kpi-hint">{hint}</div>
    </div>
  );
}

function StateBadge({
  state,
  headline,
  tone,
}: {
  state: SafetyStateName;
  headline: string;
  tone: 'ok' | 'info' | 'warn' | 'danger';
}) {
  return (
    <div className={`cc-state-badge tone-${tone}`} role="status">
      <span className="cc-state-glyph">{state === 'NORMAL' ? <ShieldCheck size={18} /> : state === 'REJECT' ? <XCircle size={18} /> : <AlertTriangle size={18} />}</span>
      <span className="cc-state-badge-text">
        <strong>{state}</strong>
        <span>{STATE_LABEL[state]}</span>
      </span>
      <em>{headline}</em>
    </div>
  );
}

function DutyDecisionStrip({
  status,
  tone,
}: {
  status: SafetyStatus;
  tone: 'ok' | 'info' | 'warn' | 'danger';
}) {
  const state = status.state.state;
  const isPublishable = status.state.publishable;
  const requiresAction = status.state.requires_operator_action;
  const displayPlan = status.plan ?? status.candidate_plan;

  let gateHeadline = '准予放行 · 方案通过形式化独立校验';
  if (state === 'REJECT') {
    gateHeadline = '禁止自动放行 · 存在未分配人员或硬约束违规';
  } else if (state === 'DEGRADED') {
    gateHeadline = '暂停放行 · 感知退化转人工核查';
  } else if (state === 'REROUTE') {
    gateHeadline = '限制放行 · 执行重规划应急动线';
  }

  const activeIncidents = status.incidents.filter(i => i.status === 'confirmed' || i.status === 'reported');
  const untrustedRisks = status.risks.filter(r => !r.trusted);
  const unresolved = displayPlan?.unresolved ?? [];

  let hotspotText = '全域受控 · 通道与出口畅通';
  if (activeIncidents.length > 0) {
    const inc = activeIncidents[0];
    hotspotText = `事件告警：${inc.type} · 影响 ${formatAffected(inc.affected)}`;
  } else if (unresolved.length > 0) {
    hotspotText = `容量瓶颈：${unresolved.map(u => `${u.region_id} (${u.persons}人未分配)`).join('；')}`;
  } else if (untrustedRisks.length > 0) {
    hotspotText = `观测异常：${untrustedRisks.map(r => r.regionId).join('、')} 传感器未标定或超时`;
  }

  let actionText = '系统自洽 · 保持 5s 周期巡检';
  if (requiresAction) {
    if (activeIncidents.length > 0) {
      actionText = '处置事件 · 调度备用出口并解除险情';
    } else if (state === 'REJECT') {
      actionText = '研判候选方案 · 调配运力或限制入园';
    } else if (state === 'DEGRADED') {
      actionText = '检查视频流标定与网络链路';
    } else {
      actionText = '研判现场态势并进行调度确认';
    }
  }

  return (
    <section className={`cc-decision-strip tone-${tone}`} aria-label="3秒值班决策指示">
      <div className="cc-strip-card cc-strip-gate">
        <div className="cc-strip-header">
          <span className="cc-strip-tag">
            <ShieldMark size={12} />
            3秒放行决断
          </span>
          <span className={`cc-strip-badge ${isPublishable ? 'is-ok' : 'is-danger'}`}>
            {isPublishable ? '准予放行' : '禁止放行'}
          </span>
        </div>
        <div className="cc-strip-body">
          <strong>{gateHeadline}</strong>
        </div>
      </div>

      <div className="cc-strip-divider" aria-hidden="true">
        →
      </div>

      <div className="cc-strip-card cc-strip-hotspot">
        <div className="cc-strip-header">
          <span className="cc-strip-tag">
            <Crosshair size={12} />
            态势焦点 / 风险区
          </span>
          <span className={`cc-strip-badge ${hotspotText.startsWith('全域') ? 'is-ok' : 'is-warn'}`}>
            {hotspotText.startsWith('全域') ? '受控' : '重点关注'}
          </span>
        </div>
        <div className="cc-strip-body">
          <span>{hotspotText}</span>
        </div>
      </div>

      <div className="cc-strip-divider" aria-hidden="true">
        →
      </div>

      <div className="cc-strip-card cc-strip-action">
        <div className="cc-strip-header">
          <span className="cc-strip-tag">
            <Activity size={12} />
            值班处置指令
          </span>
          <span className={`cc-strip-badge ${requiresAction ? 'is-warn' : 'is-ok'}`}>
            {requiresAction ? '需值班介入' : '巡检监控'}
          </span>
        </div>
        <div className="cc-strip-body">
          <span>{actionText}</span>
        </div>
      </div>
    </section>
  );
}

function ProviderList({ providers }: { providers: ProviderStatus[] }) {
  if (providers.length === 0) return <p className="cc-footnote">正在探测感知 provider…</p>;
  return (
    <ul className="cc-providers">
      {providers.map(provider => {
        const failedChecks = provider.checks.filter(check => !check.ok);
        return (
          <li key={provider.id} className={provider.available ? 'is-available' : 'is-unavailable'}>
            <div className="cc-provider-head">
              <i className={provider.available ? 'cc-dot is-on' : 'cc-dot is-off'} aria-hidden="true" />
              <strong>{provider.kind}</strong>
              <span className="cc-code">{provider.model_version}</span>
              <span className={`cc-tag ${provider.available ? 'source-open' : 'source-none'}`}>
                {provider.available ? '可用' : '不可用'}
              </span>
            </div>
            <div className="cc-provider-meta">
              本机验证：{provider.verified_on_this_host ? '是' : '否'}
              {failedChecks.length > 0 ? (
                <span className="cc-provider-fail-count">· {failedChecks.length} 项未就绪</span>
              ) : null}
            </div>
            {failedChecks.length > 0 ? (
              <div className="cc-provider-checks-grid">
                {failedChecks.map(check => (
                  <div key={check.name} className="cc-provider-check-chip" title={`${check.name}: ${check.detail}`}>
                    <XCircle size={12} />
                    <span className="cc-code">{check.name}</span>
                    <span className="cc-check-detail">{check.detail}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </li>
        );
      })}
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
    return <p className="cc-footnote">尚无校验记录。</p>;
  }
  return (
    <div className="cc-validation">
      <div className={`cc-validation-head tone-${validation.valid ? 'ok' : 'danger'}`}>
        {validation.valid ? <ShieldCheck size={15} /> : <WarningOctagon size={15} />}
        <span>{validation.valid ? '通过独立校验' : '未通过独立校验'}</span>
        <span className="cc-code">
          {validation.checks_run.length} 项检查 · {formatTime(validation.checked_at)}
        </span>
      </div>
      {validation.violations.length > 0 ? (
        <ul className="cc-violations">
          {validation.violations.map((violation, index) => (
            <li key={`${violation.code}-${index}`} className={`severity-${violation.severity}`}>
              <span className={`cc-dot severity-${violation.severity}`} aria-hidden="true" />
              <code>{violation.code}</code>
              <span>{violation.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {candidateShown && !validation.valid ? (
        <p className="cc-candidate-warning">
          <AlertTriangle size={13} />
          当前展示的是候选方案，仅供人工研判，未经安全验证。
        </p>
      ) : null}
    </div>
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
  if (incidents.length === 0) return <p className="cc-footnote">当前无事件。</p>;
  return (
    <ul className="cc-incidents">
      {incidents.map(incident => (
        <li key={incident.id} className={`incident-${incident.status}`}>
          <div className="cc-incident-main">
            <strong>{incident.type}</strong>
            <span>{incident.description}</span>
          </div>
          <div className="cc-incident-meta">
            <span className={`cc-tag incident-tag-${incident.status}`}>{incident.status}</span>
            <span>影响 {formatAffected(incident.affected)}</span>
            <span className="cc-code">{formatTime(incident.reported_at)}</span>
          </div>
          <div className="cc-btn-row">
            {incident.status === 'reported' ? (
              <button
                type="button"
                className="cc-btn cc-btn-secondary"
                disabled={busy !== null}
                onClick={() => onConfirm(incident.id)}
              >
                确认事件
              </button>
            ) : null}
            {incident.status === 'confirmed' ? (
              <button
                type="button"
                className="cc-btn cc-btn-secondary"
                disabled={busy !== null}
                onClick={() => onResolve(incident.id)}
              >
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
      <span className="cc-legend-item">
        <i className="cc-legend-line is-validated" aria-hidden="true" /> 已验证路线
        {hasPlan && !isCandidate ? '（当前显示）' : ''}
      </span>
      <span className="cc-legend-item">
        <i className="cc-legend-line is-candidate" aria-hidden="true" /> 候选路线（未校验）
      </span>
      <span className="cc-legend-item">
        <i className="cc-legend-line is-closed" aria-hidden="true" /> 已关闭通道/出口
      </span>
      <span className="cc-legend-item">
        <i className="cc-legend-line is-unknown" aria-hidden="true" /> 状态未知
      </span>
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
    return { width: maxX + 48, height: maxY + 44 };
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
      <defs>
        <pattern id="cc-grid" width="28" height="28" patternUnits="userSpaceOnUse">
          <path d="M28 0H0v28" className="map-grid-line" fill="none" />
          <circle cx="28" cy="28" r="0.8" fill="rgba(217, 179, 106, 0.22)" />
        </pattern>
      </defs>

      <rect x={0} y={0} width={bounds.width} height={bounds.height} className="map-bg" />
      <rect x={0} y={0} width={bounds.width} height={bounds.height} fill="url(#cc-grid)" aria-hidden="true" />

      {/* 赛博国风太极八卦/天元浑仪同心水纹底印 */}
      <g className="map-zen-rings" aria-hidden="true" opacity="0.12" transform={`translate(${bounds.width / 2}, ${bounds.height / 2})`}>
        <circle cx="0" cy="0" r={Math.min(bounds.width, bounds.height) * 0.38} stroke="var(--sg-gold)" strokeWidth="0.8" strokeDasharray="4 8" fill="none" />
        <circle cx="0" cy="0" r={Math.min(bounds.width, bounds.height) * 0.24} stroke="var(--sg-gold)" strokeWidth="0.6" strokeDasharray="1 6" fill="none" />
        <line x1={-bounds.width * 0.45} y1="0" x2={bounds.width * 0.45} y2="0" stroke="var(--sg-gold)" strokeWidth="0.6" strokeDasharray="3 9" />
        <line x1="0" y1={-bounds.height * 0.45} x2="0" y2={bounds.height * 0.45} stroke="var(--sg-gold)" strokeWidth="0.6" strokeDasharray="3 9" />
      </g>

      {/* 顶部 HUD 标牌 */}
      <g className="map-hud-plate" aria-hidden="true">
        <rect x="12" y="10" width="186" height="22" rx="4" className="map-hud-box" />
        <circle cx="21" cy="21" r="3" fill="var(--sg-gold)" />
        <text x="30" y="25" className="map-hud-title">空间拓扑路网 · 数字孪生底座</text>
      </g>

      {/* 罗盘方位指示 */}
      <g className="map-compass" aria-hidden="true" transform={`translate(${bounds.width - 32}, 22)`}>
        <circle cx="0" cy="0" r="12" className="map-compass-ring" />
        <path d="M0 -9 L2.5 0 L0 2.5 L-2.5 0 Z" fill="var(--sg-gold)" />
        <path d="M0 9 L2.5 0 L0 -2.5 L-2.5 0 Z" fill="rgba(217, 179, 106, 0.28)" />
        <text x="0" y="-12" className="map-compass-text">N</text>
      </g>

      {status.corridors.map(corridor => {
        const from = regionById.get(corridor.from_region_id);
        const to = regionById.get(corridor.to_region_id);
        if (!from || !to) return null;
        const start = centreOf(from);
        const end = centreOf(to);
        const isClosed = corridor.effective_status === 'closed' || !corridor.usable;
        const isUnknown = !isClosed && corridor.effective_status === 'unknown';
        const className =
          isClosed
            ? 'map-corridor map-corridor-closed'
            : isUnknown
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
            <text x={(start.x + end.x) / 2} y={(start.y + end.y) / 2 - 5} className="map-label">
              {corridor.id}
            </text>
          </g>
        );
      })}

      {status.regions.map(region => {
        const risk = status.risks.find(item => item.regionId === region.id);
        const geometry = region.geometry;
        const capacity = region.holding_capacity_persons || 1;
        const count = risk?.count ?? 0;
        const capacityRatio = Math.max(0, Math.min(1, count / capacity));
        return (
          <g key={region.id} className="map-region-group">
            <rect
              x={geometry.x}
              y={geometry.y}
              width={geometry.width}
              height={geometry.height}
              rx={6}
              className={`map-region risk-${risk?.level ?? 'unknown'}`}
            />
            <rect
              x={geometry.x}
              y={geometry.y}
              width={geometry.width}
              height={26}
              rx={6}
              className={`map-region-head risk-${risk?.level ?? 'unknown'}`}
            />
            {/* 国风拐子金角标（微四角装饰） */}
            <path
              d={`M${geometry.x} ${geometry.y + 6} L${geometry.x} ${geometry.y} L${geometry.x + 6} ${geometry.y} M${geometry.x + geometry.width - 6} ${geometry.y} L${geometry.x + geometry.width} ${geometry.y} L${geometry.x + geometry.width} ${geometry.y + 6}`}
              stroke="rgba(217, 179, 106, 0.45)"
              strokeWidth="1"
              fill="none"
              aria-hidden="true"
            />
            <text x={geometry.x + 12} y={geometry.y + 18} className="map-region-name">
              {region.name}
            </text>
            <text x={geometry.x + 12} y={geometry.y + 48} className="map-region-count">
              {risk?.count ?? '—'}
            </text>
            <text x={geometry.x + 12} y={geometry.y + 66} className="map-region-info">
              人 · {risk?.density?.toFixed(2) ?? '—'} 人/m²
            </text>
            <text x={geometry.x + 12} y={geometry.y + 86} className="map-region-info">
              风险 {RISK_LABEL[risk?.level ?? 'unknown']}
              {risk && !risk.trusted ? '（数据不可信）' : ''}
            </text>
            {/* 容纳容量指示条 */}
            <g className="map-capacity-track" aria-hidden="true">
              <rect
                x={geometry.x + 12}
                y={geometry.y + geometry.height - 10}
                width={geometry.width - 24}
                height={3}
                rx={1.5}
                className="map-capacity-bg"
              />
              <rect
                x={geometry.x + 12}
                y={geometry.y + geometry.height - 10}
                width={(geometry.width - 24) * capacityRatio}
                height={3}
                rx={1.5}
                className={`map-capacity-fill risk-${risk?.level ?? 'unknown'}`}
              />
            </g>
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
        const y = region.geometry.y + region.geometry.height / 2 + index * 16 - 16;
        const x = region.geometry.x + region.geometry.width;
        const open = exit.effective_status === 'open' && exit.usable;
        return (
          <g key={exit.id}>
            <rect x={x - 5} y={y - 5} width={10} height={10} rx={2} className={open ? 'map-exit map-exit-open' : 'map-exit map-exit-closed'} />
            <text x={x + 12} y={y + 4} className="map-exit-label">
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
              <g key={`${route.key}-label`} className="map-route-badge" transform={`translate(${last.x - 42}, ${last.y - 12})`}>
                <rect x="-4" y="-10" width="38" height="15" rx="3" className="map-route-badge-bg" />
                <text x="15" y="1" textAnchor="middle" className="map-route-label">
                  {route.persons}人
                </text>
              </g>
            );
          })
        : null}
    </svg>
  );
}
