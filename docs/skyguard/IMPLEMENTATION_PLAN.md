# SkyGuard 实现计划

> 基线仓库：`https://github.com/Mao123-doc/lingshan-ai-guide`
> 基线提交：`3db95f536ba28ef44497529f3cf8de39dd3c4641`（分支 `codex/huawei-ict-agentarts`）
> 迁移分支：`feat/skyguard-migration`

## 1. 定位

SkyGuard 是构建在灵小禅仓库之上的**独立安全业务域**：面向大型活动与人员密集场所的
应急疏散辅助决策原型。它复用仓库的工程底座（Express + Zod + TypeScript + React + 测试框架），
但**不复用旅游业务模型**——游客路线的"单人最短路径 + 时间窗"与疏散的"多源多路径 + 容量约束"
是两类问题，共用数据模型会掩盖容量与流量守恒这些真正的安全约束。

核心分工（贯穿整个实现）：

| 角色 | 职责 | 明确不做 |
| --- | --- | --- |
| 感知层 | 提供人群证据，并如实标注来源/置信度/时效 | 不决定路线是否安全 |
| 规划器 | 生成满足容量与时限的候选方案 | 不自我认证方案安全 |
| 独立校验器 | 从场景+约束独立重算，判定方案是否满足硬约束 | 不参与生成方案 |
| 状态机 | 决定系统当前可以发布什么 | 不修改约束 |
| 大模型 | 仅可做自然语言录入辅助 | 不判定硬约束，不得把失败方案改写为通过 |

## 2. 分层与模块

```text
backend/src/
├── api/v1/
│   ├── safety.ts                 # 安全域 HTTP 接口（读写分离 + 角色门禁）
│   └── router.ts                 # 已挂载 /api/v1/safety（+2 行）
├── services/safety/
│   ├── types.ts                  # Zod 数据契约：Region/Corridor/Exit/Observation/Incident/Plan/Validation
│   ├── scenario.ts               # 场景加载 + 引用完整性校验
│   ├── network.ts                # 有效约束合成（事件覆盖 + 未知≠开放）
│   ├── observations.ts           # 观测构建、时效/置信度判定、版本管理
│   ├── risk.ts                   # 确定性风险评估规则
│   ├── incidents.ts              # 事件状态迁移（reported/confirmed/resolved/dismissed）
│   ├── planning/
│   │   ├── min-cost-flow.ts      # 最小费用最大流 + 路径分解
│   │   └── evacuation-planner.ts # 时间扩展网络流疏散规划
│   ├── validator.ts              # 独立安全校验器（纯函数）
│   ├── state-machine.ts          # 四态状态机（纯函数）
│   ├── decision-service.ts       # 编排：观测→风险→规划→校验→状态→发布
│   ├── audit.ts                  # 审计日志 + 决策 Trace
│   ├── nl-incident.ts            # 自然语言事件草稿解析（确定性规则，不接 LLM）
│   └── providers/                # 感知 provider 抽象与三种实现
├── python/crowd_service.py       # CPU 视频人群感知（OpenCV）
scripts/
├── skyguard-benchmark.ts         # 性能基准
└── skyguard-demo.ts              # 三场景验收运行器
data/safety/scenario-default.json # 合成演示场景（明确标注非真实测绘）
frontend/src/pages/command-center/ # /command-center 指挥大屏
```

## 3. 数据模型要点

- **来源可追溯**：`area_provenance` / `capacity_provenance` / `calibration_status` 区分
  `measured / calibrated / estimated / uncalibrated / unknown`。像素坐标与示意图坐标都是无量纲，
  与真实平方米严格分离。
- **未知不是开放**：`status: 'unknown'` 的通道/出口一律不可用；`capacity_per_min: null`
  一律不参与规划，绝不按无限容量处理。
- **观测有效性**：`valid` + `invalid_reason` + `observed_at`（用于过期判定）+ `confidence`。
  密度由人数与面积确定性推导，不接受外部传入，避免人数/密度互相矛盾。
- **版本三元组**：`scenario_version` / `constraint_version`（事件确认/解除时递增）/
  `observation_version`（每次观测写入递增）。方案携带三者，任一不匹配即视为失效。

## 4. 规划模型

采用**时间扩展最小费用最大流**：

- 节点 `(区域, 分钟)`，汇点为出口；
- 源 → 区域 容量 = 该区域需疏散人数；
- 滞留弧 `(r,t) → (r,t+1)` 容量 = `max(在留容量, 当前需求)`，表示区域内等待；
- 通道弧 `(u,t) → (v,t+τ)` 容量 = `通道能力(人/分钟)`，费用 = τ；
- 出口弧 `(region,t) → 汇点` 容量 = `出口接收能力(人/分钟)`。

结果同时满足：通道/出口容量、中间区域流量守恒、时间可行性（不晚于 horizon）、
人群完整分配或明确未解决需求。达标人数 = 最大流；未解决 = 需求 − 最大流。

**这不是人群动力学仿真**，不建模拥挤减速、恐慌、逆行、队伍演化；结果是
"给定容量与行程时间假设下的可疏散吞吐上界与分配方案"，不是精确疏散时间预测。

## 5. 独立校验器（15 类检查）

| 代码 | 含义 | 级别 |
| --- | --- | --- |
| `stale_scenario` / `stale_constraints` / `stale_observations` | 方案版本落后 | 硬 |
| `version_changed_during_planning` | 规划期间输入变化 | 硬 |
| `unknown_region` / `unknown_corridor` / `unknown_exit` | 引用不存在 | 硬 |
| `corridor_direction_violation` / `path_broken_chain` / `path_does_not_reach_exit` | 连通性与方向 | 硬 |
| `step_time_inconsistent` / `step_duration_mismatch` / `route_arrival_mismatch` | 时间自洽 | 硬 |
| `closed_corridor_used` / `unknown_corridor_used` / `corridor_capacity_unknown` | 通道状态/容量 | 硬 |
| `corridor_capacity_exceeded` | 通道超容 | 硬 |
| `closed_exit_used` / `unknown_exit_used` / `exit_capacity_unknown` | 出口状态/容量 | 硬 |
| `exit_capacity_exceeded` / `exit_total_capacity_exceeded` | 出口超容 | 硬 |
| `flow_conservation_violation` | 区域流量守恒 | 硬 |
| `unresolved_demand` | 未完整分配 | 硬 |
| `demand_mismatch` | 与当前观测不符 | 硬 |
| `observation_missing` / `observation_invalid` / `observation_stale` / `observation_low_confidence` | 观测可信度 | 硬 |
| `totals_inconsistent` / `invalid_persons` / `invalid_time_order` / `horizon_exceeded` | 结构与自洽 | 硬 |

校验器是纯函数，不读取 `plan.status` 之类自报字段。

## 6. 四态状态机

优先级：**DEGRADED > REJECT > REROUTE > NORMAL**

| 状态 | 进入条件 | 允许展示 |
| --- | --- | --- |
| `NORMAL` | 观测可信 + 方案通过校验 + 无已确认事件 | 绿色已验证路线 |
| `REROUTE` | 同上但有已确认事件；或方案版本失效待重算 | 绿色替代方案（已确认事件情况下）/ 橙色候选 |
| `DEGRADED` | 观测过期/无效/低置信/缺失，或推理服务异常 | 不展示新路线，只显示最后有效观测时间与原因 |
| `REJECT` | 校验存在硬违规（容量不足、无可行解等） | 红色违规原因 + 橙色"候选方案（未校验）" |

不论处于哪个状态，解除事件都不会让旧方案自动恢复为可发布——必须重新规划并通过校验。

## 7. 阶段计划与完成度

| 阶段 | 内容 | 状态 | 证据 |
| --- | --- | --- | --- |
| 1 | 仓库审计与基线 | 完成 | `PROGRESS.md` 基线章节 |
| 2 | 独立安全领域模型 | 完成 | `types.ts` / `scenario.ts` |
| 3 | 安全决策闭环（规划+校验+状态） | 完成 | `planning/*` / `validator.ts` / `state-machine.ts` |
| 4 | 四态状态机 | 完成 | `state-machine.ts` + 7 个单测 |
| 5 | 事件管理与 API | 完成 | `api/v1/safety.ts` + 8 个集成测试 |
| 6 | 指挥大屏 | 完成 | `/command-center` + 4 个前端测试 |
| 7 | 昇腾边云适配 | **部分完成**：探针与契约完成，硬件推理未验证 | `providers/ascend.ts` / `LIMITATIONS.md` |
| 8 | 测试与验收 | 完成（T01–T15） | `TEST_REPORT.md` |
| 9 | 交付文档 | 完成 | `docs/skyguard/*` |
| 10 | 持续自主执行 | 按需循环 | `PROGRESS.md` |

## 8. 与原灵小禅的关系

- 路由文件仅新增一行挂载；`frontend/src/App.tsx` 仅新增一条 `/command-center` 路由；
- 未修改任何旅游业务代码、数据文件或测试；
- 原有 74 个后端测试与 19 个前端测试全部保持通过（见 `TEST_REPORT.md` 回归章节）。
