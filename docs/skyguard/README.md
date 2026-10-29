# SkyGuard — 可信安全决策系统（应急疏散辅助决策原型）

SkyGuard 构建在灵小禅（Lingshan AI Guide）仓库之上，是一个**独立的安全业务域**：
把"人群感知 → 风险评估 → 容量约束疏散规划 → 独立安全校验 → 四态状态机 → 指挥大屏"
串成一条可审计、可复现的闭环。

> ⚠️ **这是研究原型，不是应急指挥系统。**
> 场景数据为合成数据，昇腾硬件推理未经实测，不能用于真实疏散指挥。
> 上线前必须阅读 [`LIMITATIONS.md`](./LIMITATIONS.md) 全文。

---

## 1. 架构

```text
┌─────────────────────────────────────────────────────────────────────┐
│ 指挥大屏 /command-center   React + SVG 态势图 · 3s~5s 轮询             │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTP（读免鉴权 / 写需 JWT + 运维角色）
┌───────────────────────────────▼─────────────────────────────────────┐
│ API  /api/v1/safety/*        Express + Zod                          │
├─────────────────────────────────────────────────────────────────────┤
│ 决策编排 SafetyDecisionService                                        │
│   观测 → 风险评估 → 容量约束规划 → 独立校验 → 四态状态机 → 发布/拒绝    │
├──────────────┬──────────────────┬────────────────┬──────────────────┤
│ 感知 provider │ 规划器            │ 独立校验器      │ 状态机            │
│ 模拟/视频/昇腾 │ 时间扩展最小费用流 │ 15 类硬约束检查│ NORMAL/REROUTE/   │
│              │                  │                │ DEGRADED/REJECT  │
├──────────────┴──────────────────┴────────────────┴──────────────────┤
│ 数据层  场景(区域/通道/出口) · 观测 · 事件 · 方案 · 审计 JSONL          │
└─────────────────────────────────────────────────────────────────────┘
```

**责任边界（不可跨越）**：

| 角色 | 可以做 | 不可以做 |
| --- | --- | --- |
| 感知 | 提供人数、置信度、来源 | 决定路线是否安全 |
| 规划器 | 产生候选方案 | 自我认证方案安全 |
| 独立校验器 | 判定硬约束是否满足 | 参与生成方案 |
| 状态机 | 决定能发布什么 | 修改约束 |
| 大模型 | 自然语言录入辅助 | 判定约束、把失败方案改写为通过 |

## 2. 依赖环境

| 项 | 版本/要求 | 用途 |
| --- | --- | --- |
| Node.js | ≥ 20（开发用 v24.19.0） | 后端与前端 |
| Python | ≥ 3.10（开发用 3.13.7） | 视频感知 / 既有向量服务 |
| opencv-python + numpy | 可选（仅视频感知路径需要） | `pip install opencv-python numpy` |
| 昇腾 CANN + NPU | **本机不具备** | 仅在现场启用昇腾路径时需要 |
| 已有依赖 | 无新增 npm/pip 包 | 复用仓库既有依赖 |

## 3. 安装与启动

```powershell
# 安装依赖（仓库根目录）
npm run setup

# 启动后端（默认 8010）
npm run dev --prefix backend

# 端口冲突时
$env:PORT=8099; npm run dev --prefix backend

# 启动前端（开发模式，代理到 8010）
npm run dev --prefix frontend
```

访问：

- 指挥大屏：`http://localhost:5173/command-center`（开发）/ `http://localhost:8010/command-center`（构建后）
- 原有游客端：`/`、`/qa`、`/recommend`
- 原有管理后台：`/admin/login`（默认 `admin / lingshan2026`）

大屏上的**写操作**需要先登录管理后台取得 JWT（存在 `localStorage.admin_token`）。

## 4. 三个演示场景

### 4.1 自动化运行（推荐，可进 CI）

```powershell
npm run demo:safety --prefix backend
```

输出逐步决策轨迹，最后校验三个场景的最终状态；任一不符则以非零码退出。

### 4.2 大屏操作

1. 打开 `/command-center`；
2. 右栏「演示场景」下拉选择 `场景 A · 常规风险预警`，点「运行演示」；
3. 依次运行 B、C，观察状态徽标、路线颜色、校验结果、事件时间线同步变化。

### 4.3 场景说明

| 场景 | 触发 | 预期 | 大屏表现 |
| --- | --- | --- | --- |
| **A 常规风险预警** | 写入 6 个区域模拟观测 | `NORMAL` | 绿色已验证路线，1000/1000 人分配完毕 |
| **B B 出口突发火灾** | 确认火情 → 关闭 `E_B` → 重规划 | `REROUTE` | 原方案 `plan_id` 变化，`E_B` 从分配中消失，剩余出口承接 |
| **C C 出口容量不足** | 高峰人群 + `E_B` 关闭 | `REJECT` | **无绿色路线**，橙色候选方案，红色违规原因「未解决 180 人」，提示人工介入 |

> 三个场景都由 `data/safety/scenario-default.json` 的 `demo_scenarios` 驱动，
> 新增场景只需加一段 JSON 脚本，不需要改代码。

## 5. 测试

```powershell
# 后端全量（116 用例，含 SkyGuard 42 个）
npm test --prefix backend

# 仅 SkyGuard
npm run test:safety --prefix backend

# 前端（23 用例）
npm run test:unit --prefix frontend

# 类型检查 / Lint / 构建
npx tsc --noEmit --project backend
npm run lint --prefix frontend
npm run build --prefix frontend
```

详见 [`TEST_REPORT.md`](./TEST_REPORT.md)。

## 6. 接入实际视频

### 6.1 前置条件

```powershell
pip install opencv-python numpy
```

确认链路可用：

```powershell
python -I backend/python/crowd_service.py --video <你的视频> --max-frames 90 --sample-every 15
```

若返回 `{"ok": true, ...}`，说明 CPU 感知链路可用。

### 6.2 通过 API 接入

```powershell
$token = (Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8010/api/v1/auth/login `
  -ContentType application/json -Body '{"username":"admin","password":"lingshan2026"}').access_token

Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8010/api/v1/safety/observations/video `
  -Headers @{ Authorization = "Bearer $token" } -ContentType application/json `
  -Body '{"region_id":"R_MAIN","video_path":"C:/path/to/venue.mp4","max_frames":90,"sample_every":15}'
```

### 6.3 真实局限（务必阅读）

- 方法为「运动前景连通域计数」，**不是**专用人群计数模型；
- 固定机位才能用，镜头移动 / 光照剧变会失效；
- 人群粘连时低估，高密度下只能视为下界；
- **未标定摄像机**（默认场景即是）会把置信度压到 ≤0.35，系统因此进入 `DEGRADED`
  并拒绝发布路线——这是设计行为，不是 bug；
- 要启用可信视频观测：在 `data/safety/scenario-default.json` 中把对应区域的
  `camera.calibration_status` 改为 `measured` 并更新 `calibration_version`。

## 7. 昇腾适配条件

当前状态：**仅完成环境探针与外部推理契约，硬件推理未验证。**

启用步骤：

1. 安装对应型号的 CANN 与昇腾推理运行时（310 系列各型号兼容性不同，须按官方列表选型）；
2. 将人群计数模型导出为 `.om`，用 `atc` 验证算子兼容；
3. 编写符合契约的推理程序（stdin JSON → stdout JSON，见 `LIMITATIONS.md` §4.3）；
4. 配置环境变量：

```powershell
$env:SKYGUARD_ASCEND_CMD   = "C:\ascend\crowd_infer.exe"
$env:SKYGUARD_ASCEND_MODEL = "C:\ascend\models\crowd.om"
$env:ASCEND_HOME_PATH      = "C:\CANN\latest"
```

5. `GET /api/v1/safety/providers` 确认 `ascend.available === true`；
6. 跑通后更新 `TEST_REPORT.md` 与 `LIMITATIONS.md`，把"未验证"改为实测结论。

未配置时，`AscendCrowdProvider.infer()` 抛 `ProviderUnavailableError`，**绝不返回伪造数据**。

## 8. 目录导航

| 路径 | 内容 |
| --- | --- |
| `backend/src/services/safety/` | 安全域全部实现 |
| `backend/src/api/v1/safety.ts` | 安全 API |
| `backend/python/crowd_service.py` | CPU 视频感知 |
| `data/safety/scenario-default.json` | 演示场景与演示脚本 |
| `frontend/src/pages/command-center/` | 指挥大屏 |
| `backend/tests/safety/` | 42 个安全域测试 |
| `evaluation/skyguard/performance.json` | 性能实测原始数据 |

## 9. 文档索引

- [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) — 架构、模型、校验规则、阶段计划
- [`DECISIONS.md`](./DECISIONS.md) — 14 条关键设计决策与代价
- [`PROGRESS.md`](./PROGRESS.md) — 基线审计、完成状态、环境探测、待办
- [`TEST_REPORT.md`](./TEST_REPORT.md) — 全部测试命令与结果、T01–T15、回归
- [`LIMITATIONS.md`](./LIMITATIONS.md) — **局限与禁止表述，引用前必读**
- [`PERFORMANCE.md`](./PERFORMANCE.md) — 性能实测
- [`MIGRATION.md`](./MIGRATION.md) — 迁移差异清单、API 一览、已实现/未实现

## 10. 不适用范围

本原型**不得**用于真实疏散指挥、不得宣称已获安全认证、不得宣称已完成昇腾部署、
不得给出人群计数准确率或疏散时间预测。详见 [`LIMITATIONS.md`](./LIMITATIONS.md) §9。
