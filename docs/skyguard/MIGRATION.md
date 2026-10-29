# SkyGuard 代码迁移差异清单

基线提交：`3db95f5`（`codex/huawei-ict-agentarts`）→ 迁移分支 `feat/skyguard-migration`

## 1. 修改的文件（仅 2 个，共 +6 行）

| 文件 | 变更 | 行数 |
| --- | --- | --- |
| `backend/src/api/v1/router.ts` | 新增 import + `apiRouter.use('/safety', safetyRouter)` | +2 |
| `frontend/src/App.tsx` | 新增 import + `/command-center` 路由 | +4 |

**未修改**任何既有服务、既有数据文件、既有测试、既有页面。原灵小禅功能零回归。

## 2. 新增的文件

### 2.1 后端安全域（18 个文件 / 4211 行）

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `backend/src/services/safety/types.ts` | 356 | Zod 数据契约全集 |
| `backend/src/services/safety/scenario.ts` | 101 | 场景加载 + 引用完整性 |
| `backend/src/services/safety/network.ts` | 183 | 有效约束合成 |
| `backend/src/services/safety/observations.ts` | 158 | 观测构建/判定/版本 |
| `backend/src/services/safety/risk.ts` | 201 | 确定性风险评估 |
| `backend/src/services/safety/incidents.ts` | 137 | 事件状态迁移 |
| `backend/src/services/safety/planning/min-cost-flow.ts` | 248 | 最小费用最大流 + 分解 |
| `backend/src/services/safety/planning/evacuation-planner.ts` | 324 | 时间扩展网络流规划 |
| `backend/src/services/safety/validator.ts` | 510 | 独立安全校验器 |
| `backend/src/services/safety/state-machine.ts` | 218 | 四态状态机 |
| `backend/src/services/safety/decision-service.ts` | 925 | 决策编排 + 演示执行 |
| `backend/src/services/safety/audit.ts` | 159 | 审计日志 + Trace |
| `backend/src/services/safety/nl-incident.ts` | 101 | 自然语言事件草稿 |
| `backend/src/services/safety/providers/types.ts` | 61 | provider 接口 |
| `backend/src/services/safety/providers/simulation.ts` | 75 | 模拟感知 |
| `backend/src/services/safety/providers/video.ts` | 195 | CPU 视频感知 |
| `backend/src/services/safety/providers/ascend.ts` | 195 | 昇腾适配层（探针+契约） |
| `backend/src/services/safety/index.ts` | 64 | 惰性单例与测试重置 |

### 2.2 后端 API / Python / 脚本

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `backend/src/api/v1/safety.ts` | 503 | 19 个安全端点 |
| `backend/python/crowd_service.py` | 224 | OpenCV 视频人群检测 CLI |
| `backend/scripts/skyguard-benchmark.ts` | 326 | 性能基准 |
| `backend/scripts/skyguard-demo.ts` | 104 | 三场景验收运行器 |

### 2.3 测试（6 个文件 / 1382 行，42 个用例）

| 文件 | 行数 |
| --- | --- |
| `backend/tests/safety/fixtures.ts` | 89 |
| `backend/tests/safety/safety-acceptance.test.ts` | 501 |
| `backend/tests/safety/safety-api.test.ts` | 271 |
| `backend/tests/safety/safety-planner.test.ts` | 250 |
| `backend/tests/safety/safety-providers.test.ts` | 151 |
| `backend/tests/safety/safety-state-machine.test.ts` | 120 |
| `frontend/src/pages/command-center/__tests__/CommandCenterPage.test.tsx` | 357 |

### 2.4 前端

| 文件 | 行数 |
| --- | --- |
| `frontend/src/services/safetyApi.ts` | 286 |
| `frontend/src/pages/command-center/CommandCenterPage.tsx` | 885 |
| `frontend/src/pages/command-center/CommandCenterPage.css` | 696 |

### 2.5 数据与证据

| 文件 | 说明 |
| --- | --- |
| `data/safety/scenario-default.json` | 合成演示场景（6 区域 / 11 通道 / 4 出口 / 3 演示脚本），277 行 |
| `evaluation/skyguard/performance.json` | 本机性能实测原始数据 |
| `docs/skyguard/*.md` | 9 份交付文档 |

### 2.6 配置

| 文件 | 变更 |
| --- | --- |
| `backend/package.json` | 新增 `test:safety` / `bench:safety` / `demo:safety` 三条脚本 |
| `.gitignore` | 忽略 `data/safety/audit/`（运行时审计日志） |

## 3. 复用与新建对照

| 能力 | 来源 | 说明 |
| --- | --- | --- |
| JWT 签发/校验 | **复用** `backend/src/api/v1/auth.ts` | 安全写接口直接使用 `verifyToken` |
| Express 应用骨架 | **复用** `backend/src/app.ts` | 未改动，安全路由挂到既有 `/api/v1` |
| Zod 契约风格 | **参照** `route/route-contract.ts` | 同样采用 Schema + 加载时校验，但数据模型完全不同 |
| 测试框架 | **复用** `node:test` + `tsx`、`vitest` + `RTL` | 与既有测试同构 |
| 前端构建 | **复用** Vite / React / TypeScript | 无新依赖 |
| 数据根目录 | **复用** `config/paths.ts` 的 `resolveDataPath` | 审计与场景都走 `DATA_ROOT` |
| 最短路径算法 | **不复用** | 见 `DECISIONS.md` ADR-002 |
| 旅游路网数据 | **不复用** | 见 `DECISIONS.md` ADR-001 |
| RAG / Scene / LLM | **不使用** | 安全判定不依赖远端模型 |

> 新增依赖：**0 个**。后端用既有 `zod`/`jsonwebtoken`/`express`，前端用既有 `axios`/`react`，
> Python 用本机已有的 `opencv-python`/`numpy`。

## 4. 新增 API 一览

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/safety/status` | 否 | 状态快照（含方案、风险、事件、观测、路网） |
| GET | `/api/v1/safety/scenario` | 否 | 场景配置 |
| GET | `/api/v1/safety/plan` | 否 | 当前方案 / 候选方案 / 校验结果 |
| GET | `/api/v1/safety/observations` | 否 | 各区域最新观测 |
| GET | `/api/v1/safety/incidents` | 否 | 事件列表 |
| GET | `/api/v1/safety/audit` | 否 | 审计日志 |
| GET | `/api/v1/safety/traces` / `/trace/:id` | 否 | 决策 Trace |
| GET | `/api/v1/safety/providers` | 否 | 感知 provider 状态（含昇腾探针） |
| POST | `/api/v1/safety/observations` | JWT + 运维 | 写入观测 |
| POST | `/api/v1/safety/observations/simulate` | JWT + 运维 | 写入模拟观测 |
| POST | `/api/v1/safety/observations/video` | JWT + 运维 | 跑视频推理并写入观测 |
| POST | `/api/v1/safety/incidents` | JWT + 运维 | 登记事件（可选立即确认） |
| POST | `/api/v1/safety/incidents/parse` | JWT + 运维 | 自然语言 → 事件草稿 |
| POST | `/api/v1/safety/incidents/:id/confirm` | JWT + 运维 | 确认事件并重规划 |
| POST | `/api/v1/safety/incidents/:id/resolve` | JWT + 运维 | 解除事件并重规划 |
| POST | `/api/v1/safety/incidents/:id/dismiss` | JWT + 运维 | 驳回误报 |
| POST | `/api/v1/safety/plan/recompute` | JWT + 运维 | 强制重规划 |
| POST | `/api/v1/safety/plan/validate` | JWT + 运维 | 独立校验任意候选方案 |
| POST | `/api/v1/safety/demo/:id/run` | JWT + 运维 | 运行演示脚本 |
| POST | `/api/v1/safety/reset` | JWT + 运维 | 重置状态 |
| POST | `/api/v1/safety/admin/reload-scenario` | JWT + 运维 | 重新加载场景文件 |

## 5. 已实现 / 未实现清单

### 5.1 已实现（有代码 + 有测试 + 实测通过）

- [x] 独立安全领域数据模型与场景加载校验
- [x] 区域/通道/出口/观测/事件完整 Zod 契约
- [x] 有效约束合成（已确认事件覆盖基础状态）
- [x] 观测时效、置信度、有效性判定与版本管理
- [x] 确定性风险评估（密度阈值 + 上升速率 + 事件 + 可达性 + 数据可信度）
- [x] 容量约束疏散规划（时间扩展最小费用最大流 + 路径分解）
- [x] 未解决需求归因（无可达出口 vs 容量不足）
- [x] 独立安全校验器（15 类检查，纯函数）
- [x] 四态状态机（NORMAL / REROUTE / DEGRADED / REJECT）
- [x] 事件管理（登记 / 确认 / 解除 / 驳回 + 状态迁移校验）
- [x] 规划期间版本漂移检测
- [x] 决策编排与自动重规划
- [x] 审计日志（JSONL）+ 决策 Trace
- [x] 自然语言事件草稿解析（确定性规则）
- [x] 安全 API（读写分离 + JWT + 角色门禁）
- [x] 三种感知 provider（模拟 / CPU 视频 / 昇腾探针）
- [x] 真实视频推理链路（本机已验证可运行）
- [x] 指挥大屏 `/command-center`（真实 API 驱动）
- [x] 三场景演示脚本与验收运行器
- [x] 性能基准与实测数据
- [x] T01–T15 安全场景测试

### 5.2 未实现 / 未验证

- [ ] 昇腾硬件真实推理（无设备）
- [ ] `.om` 模型导出与算子兼容性验证
- [ ] 端侧推理延迟 / 吞吐 / 功耗实测
- [ ] 专用人群计数模型接入（CSRNet 等）
- [ ] 人群计数准确率评估（无标注数据集）
- [ ] 摄像机现场标定
- [ ] 真实场馆测绘与容量实测
- [ ] 读接口鉴权
- [ ] 审计日志轮转与完整性校验
- [ ] 状态外置存储与多实例一致性
- [ ] 并发压测与限流
- [ ] Playwright 端到端用例
- [ ] 微信小程序 / 移动端指挥界面
- [ ] 与真实视频网关（RTSP/GB28181）对接
