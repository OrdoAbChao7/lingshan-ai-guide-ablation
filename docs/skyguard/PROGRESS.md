# SkyGuard 进度记录

> 本文件记录**实际工程状态**，不是计划。最后更新：2026-10-29。

## 1. 基线审计（迁移前）

| 项目 | 实际值 |
| --- | --- |
| 工作目录 | `E:\Projects\lingshan-ai-guide-Mao123-doc` |
| 远程 `lingshan` | `https://github.com/Mao123-doc/lingshan-ai-guide.git` |
| 远程 `origin` | `https://github.com/Mao123-doc/SkyGuard-.git`（本次**未**推送、未覆盖） |
| 起始分支 | `codex/huawei-ict-agentarts` |
| 起始提交 | `3db95f536ba28ef44497529f3cf8de39dd3c4641` |
| 工作区状态 | clean（无未提交修改，无用户未保存工作） |
| 迁移分支 | `feat/skyguard-migration`（从上述提交创建） |

### 基线测试与构建（迁移前实测）

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 后端测试 | `npx tsx --test "tests/**/*.test.ts" "src/**/*.test.ts"` | 74 通过 / 0 失败 |
| 前端测试 | `npx vitest run` | 19 通过 / 0 失败 |
| 后端类型检查 | `npx tsc --noEmit` | 通过 |
| 前端类型检查 | `npx tsc -b --noEmit` | 通过 |
| 前端 Lint | `npx eslint .` | 通过 |
| 前端构建 | `npx vite build` | 成功 |
| Python 测试 | `python -m unittest discover -s backend/python/tools -p "test_*.py"` | 70 通过 |

### 环境探测

| 项 | 结果 |
| --- | --- |
| Node / npm | v24.19.0 / 11.17.0 |
| Python | 3.13.7 |
| OpenCV / NumPy | 4.13.0 / 2.4.3（可用） |
| ffmpeg | 未安装（OpenCV 可直接解码视频，无需 ffmpeg） |
| Ascend：`npu-smi` | **不存在** |
| Ascend：`ASCEND_HOME_PATH` / `CANN` 环境变量 | **未设置** |
| Ascend：`/usr/local/Ascend` | 不存在（Windows 平台） |

> 结论：本机**不具备昇腾推理条件**，昇腾路径只能交付探针与适配契约，不能声称已验证。

### 审计发现的现有代码职责

| 文件 | 实际职责 | 与 SkyGuard 的关系 |
| --- | --- | --- |
| `backend/src/services/route/route-contract.ts` | 23 景点 / 30 边的 Zod 契约与加载器 | 参考其 Zod+加载器模式；**不复用数据模型** |
| `route/pathfinding.ts` | 单人最短路径（考虑无障碍） | 不复用（见 DECISIONS ADR-002） |
| `route/route-validator.ts` | 游客路线时间窗/演出校验 | 不相关；SkyGuard 校验器独立实现 |
| `route/route-planner.ts` / `route-planning-service.ts` | Beam Search 行程规划 | 不复用 |
| `services/scene/*` | 13 维游客画像 | 不复用 |
| `services/rag-service.ts` / `retrieval/*` | 三路并行检索 + RRF | 不相关（SkyGuard 不依赖 RAG） |
| `api/v1/router.ts` | 子路由挂载点 | **新增 1 行**挂载 `/safety` |
| `api/v1/auth.ts` | JWT 签发与校验、`verifyToken` | **复用**（安全写接口的门禁依赖它） |
| `frontend/src/App.tsx` | 路由表 | **新增 1 条** `/command-center` |
| `frontend/src/services/api.ts` | 共用 axios 实例（按 `/admin` 前缀注入 JWT） | 新建独立 client（安全路径非 `/admin`） |

## 2. 已完成

### 2.1 后端安全域（18 个文件）

- `types.ts`：Region / Corridor / Exit / DensityObservation / Incident / EvacuationPlan /
  SafetyValidationResult / SafetyScenario 全套 Zod 契约。
- `scenario.ts`：场景加载 + 重复 ID / 悬空引用 / 阈值单调性校验。
- `network.ts`：由「基础状态 + 已确认事件」合成有效约束；未知不等于开放。
- `observations.ts`：观测构建（密度由人数÷面积确定性推导）、过期/低置信判定、版本计数。
- `risk.ts`：确定性风险规则（密度阈值 + 上升速率 + 事件 + 通路可达性 + 数据可信度）。
- `incidents.ts`：`reported → confirmed → resolved` 合法迁移；非法迁移抛错。
- `planning/min-cost-flow.ts`：SPFA 最小费用最大流 + 流量路径分解。
- `planning/evacuation-planner.ts`：时间扩展网络流规划 + 未解决需求归因。
- `validator.ts`：15 类独立检查（见 `IMPLEMENTATION_PLAN.md` §5）。
- `state-machine.ts`：四态纯函数状态机。
- `decision-service.ts`：完整编排、版本漂移检测、审计落盘、演示脚本执行。
- `audit.ts`：JSONL 追加审计 + 决策 Trace（分阶段耗时）。
- `nl-incident.ts`：确定性自然语言事件草稿。
- `providers/{types,simulation,video,ascend,index}.ts`：感知抽象与三实现。
- `api/v1/safety.ts`：19 个端点（读开放 / 写需 JWT + `admin`/`safety_operator` 角色）。

### 2.2 Python 感知

- `backend/python/crowd_service.py`：OpenCV 视频运动前景检测（`diff` / `mog2` / `hybrid`），
  输出逐帧计数、帧间稳定性、置信度与局限声明。

### 2.3 前端

- `frontend/src/services/safetyApi.ts`：独立 axios 实例（自动附带 admin_token）。
- `frontend/src/pages/command-center/CommandCenterPage.tsx` + `.css`：三列指挥大屏
  （感知输入 / SVG 态势图 / 决策与操作），路由 `/command-center`。

### 2.4 数据与脚本

- `data/safety/scenario-default.json`：6 区域 / 11 通道 / 4 出口 + 3 个演示脚本。
- `backend/scripts/skyguard-benchmark.ts`：性能基准（写入 `evaluation/skyguard/performance.json`）。
- `backend/scripts/skyguard-demo.ts`：三场景验收运行器（`npm run demo:safety`）。

## 3. 测试结果（迁移后）

| 套件 | 结果 |
| --- | --- |
| 后端全量（`tests/**` + `src/**`） | **116 通过 / 0 失败**（基线 74 + 新增 42） |
| 安全域专项（`tests/safety/*`） | **42 通过 / 0 失败** |
| 前端全量 | **23 通过 / 0 失败**（基线 19 + 新增 4） |
| Python | **70 通过** |
| 后端 `tsc --noEmit` | 通过 |
| 后端 `npm run build` | 通过 |
| 前端 `tsc -b --noEmit` | 通过 |
| 前端 `eslint .` | 通过 |
| 前端 `vite build` | 通过 |

明细见 `TEST_REPORT.md`。

## 4. 现场验证（真实进程）

| 验证项 | 结果 |
| --- | --- |
| `GET /health` | 200 |
| `GET /api/v1/safety/status`（无观测） | 200，`DEGRADED`（`no_observations`） |
| `POST /api/v1/safety/demo/A_normal/run` | `NORMAL`，1000/1000 人，校验通过 |
| `POST /api/v1/safety/demo/B_exit_fire/run` | `REROUTE`，1000/1000 人，E_B 已从分配中移除 |
| `POST /api/v1/safety/demo/C_capacity_shortage/run` | `REJECT`，1620/1800 人，`unresolved_demand` |
| `POST /api/v1/safety/observations/video`（真实合成视频） | 检出 4 人，置信度 0.35（未标定上限），状态 `DEGRADED`（按设计拒绝采信） |
| `GET /command-center` | 200，返回 SPA 入口，产物中含大屏代码 |

## 5. 未完成 / 待外部条件

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 昇腾硬件推理 | **未验证** | 本机无 NPU / CANN / `.om` 模型；已交付探针与外部推理契约 |
| 专用人群计数模型（CSRNet 等） | **未接入** | 当前为 OpenCV 运动前景近似，稠密人群会低估 |
| 摄像机现场标定 | **未做** | 默认场景全部 `uncalibrated`，视频观测因此可信度受限 |
| 真实场馆路网测绘 | **未做** | 场景为合成数据，非真实测绘成果 |
| 大屏读接口鉴权 | **未做** | 原型阶段读接口开放，生产需补齐 |
| 审计日志轮转 | **未做** | JSONL 持续追加 |
| 多实例一致性 | **未做** | 状态为进程内内存，多副本部署需外置存储 |

## 6. 复现命令

```powershell
# 1. 全量后端测试
npm test --prefix backend

# 2. 仅安全域测试
npm run test:safety --prefix backend

# 3. 三场景验收（进程内，无需起服务）
npm run demo:safety --prefix backend

# 4. 性能基准
npm run bench:safety --prefix backend

# 5. 前端测试 / 构建
npm run test:unit --prefix frontend
npm run build --prefix frontend

# 6. 启动后端（8099 避免与既有服务冲突时）
$env:PORT=8099; npm run dev --prefix backend
```

## 7. 下一步建议

1. 在具备昇腾 310/910 的环境按 `docs/skyguard/LIMITATIONS.md` §4 完成 `.om` 模型接入与实测。
2. 用真实固定机位视频标定 2–3 个区域，验证 `measured` 标定下的视频观测能否稳定进入 `NORMAL`。
3. 对容量参数做现场实测（通道宽度×人流密度公式），替换 `capacity_provenance: estimated`。
4. 引入专用人群计数模型，替换 `crowd_service.py` 的近似计数。
5. 生产化：读接口鉴权、审计日志轮转、状态外置存储、多实例一致性与限流。
