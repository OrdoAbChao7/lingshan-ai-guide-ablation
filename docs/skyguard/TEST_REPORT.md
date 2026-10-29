# SkyGuard 测试报告

> 执行日期：2026-10-29
> 环境：Windows 11 / Node v24.19.0 / Python 3.13.7 / OpenCV 4.13.0
> 说明：所有数字来自本机实际执行输出，未经平滑或人工调整。

## 1. 汇总

| 套件 | 用例数 | 通过 | 失败 | 跳过的假通过 |
| --- | --- | --- | --- | --- |
| 后端全量（`tests/**` + `src/**`） | 116 | 116 | 0 | 0 |
| 　其中 SkyGuard 安全域 | 42 | 42 | 0 | 0 |
| 　其中灵小禅既有 | 74 | 74 | 0 | 0 |
| 前端全量 | 23 | 23 | 0 | 0 |
| 　其中 SkyGuard 指挥大屏 | 4 | 4 | 0 | 0 |
| 　其中灵小禅既有 | 19 | 19 | 0 | 0 |
| Python（`backend/python/tools`） | 70 | 70 | 0 | 0 |

> "跳过的假通过"列用于说明：`safety-providers.test.ts` 中若本机缺少 OpenCV 会显式
> `console.warn` 并跳过断言。本次本机 OpenCV 可用，5 个 provider 用例全部真实执行。

## 2. 执行命令与原始结果

### 2.1 后端

```powershell
cd backend
npx tsx --test "tests/**/*.test.ts" "src/**/*.test.ts"
```
```text
ℹ tests 116
ℹ pass 116
ℹ fail 0
```

```powershell
cd backend
npx tsx --test "tests/safety/*.test.ts"
```
```text
ℹ tests 42
ℹ pass 42
ℹ fail 0
```

类型检查与构建：

```powershell
cd backend
npx tsc --noEmit      # 无输出 = 通过
npm run build         # tsc 成功产出 dist/
```

### 2.2 前端

```powershell
cd frontend
npx vitest run
```
```text
 Test Files  6 passed (6)
      Tests  23 passed (23)
```

```powershell
cd frontend
npx tsc -b --noEmit   # 通过
npx eslint .          # 通过（无输出）
npx vite build        # 成功
```

### 2.3 Python

```powershell
python -m unittest discover -s backend/python/tools -p "test_*.py"
```
```text
Ran 70 tests in 0.018s
OK
```

## 3. 安全场景测试（T01–T15）

文件：`backend/tests/safety/safety-acceptance.test.ts`（14）与 `safety-api.test.ts`（8）。

| 编号 | 场景 | 断言要点 | 结果 |
| --- | --- | --- | --- |
| T01 | 正常场景 | 状态 `NORMAL`；方案 `feasible`；1000/1000 人；校验 0 违规；已发布 | ✅ |
| T02 | 密度快速上升 | 记录 `density_rising_fast`；等级由 `watch` 升至 `high`；密度 1.5 人/m² | ✅ |
| T03 | B 出口关闭 | 状态 `REROUTE`；校验通过；方案不再使用 `E_B`；`plan_id` 变化 | ✅ |
| T04 | B 关闭 + 容量不足 | 状态 `REJECT`；`plan` 为空；候选方案 `partial`；违规 `unresolved_demand` | ✅ |
| T05 | 使用已关闭通道 | 校验器报 `closed_corridor_used`；`valid=false` | ✅ |
| T06 | 通道容量未知 | 规划器排除 `C11`；校验报 `corridor_capacity_unknown` + `unknown_corridor_used` | ✅ |
| T07 | 观测过期 | 状态 `DEGRADED`；不发布方案；原因 `untrusted_observation` | ✅ |
| T08 | 置信度不足 | 状态 `DEGRADED`；原因含 `low_confidence` | ✅ |
| T09 | 路网断开 | 状态 `REJECT`；方案 `partial`；`R_EAST` 220 人未解决，原因"无可达且可用的出口" | ✅ |
| T10 | 出口超容 | 校验器报 `exit_capacity_exceeded` | ✅ |
| T11 | 规划期间版本漂移 | 状态 `REROUTE`；方案未发布；违规 `version_changed_during_planning` | ✅ |
| T12 | 违规候选方案（模拟 LLM 输出） | 校验报 `path_does_not_reach_exit`；已发布方案不被替换 | ✅ |
| T13 | 推理服务异常 | 状态 `DEGRADED`；审计记录 `inference.health` / `failure` | ✅ |
| T14 | 无权限操作 | 无 token → 401；`viewer` 角色 → 403；事件仍为 `reported` | ✅ |
| T15 | 事件解除 | 解除后立即 `REROUTE` 且 `publishable=false`；重算后 `NORMAL` 且 `plan_id` 变化 | ✅ |

### 3.1 规划器单元测试（8）

`backend/tests/safety/safety-planner.test.ts`：

- 串联瓶颈网络最大流 = 3
- 通道容量与时间窗约束（100 人 → 15 人可疏散，85 人未解决）
- 关闭通道流量为 0 且被排除
- 容量未知通道不被当作无限
- 反向通道只允许指定方向
- 中间区域守恒与缓冲等待
- `traversalMinutes` 向上取整
- 需求可满足时 `feasible` 且未解决为 0

### 3.2 状态机单元测试（7）

`backend/tests/safety/safety-state-machine.test.ts`：NORMAL / DEGRADED / REJECT / REROUTE
各进入条件，以及 DEGRADED 优先于 REJECT、仅版本失效 → REROUTE、推理异常 → DEGRADED。

### 3.3 感知 provider 测试（5）

`backend/tests/safety/safety-providers.test.ts`：

- **真实生成并解码一段 60 帧合成视频**，走完整 OpenCV 链路，检出人数 > 0 且 ≤ 6
- 已标定摄像机 → 置信度不被压低（> 0.6）；未标定 → ≤ 0.35 且带 `uncalibrated_camera` 警告
- 不可读视频 → `ProviderUnavailableError`
- 昇腾 provider → `available=false`，四项检查齐全，`infer` 抛不可用错误
- 模拟 provider → 输出确定、`simulated: true`

### 3.4 API 集成测试（8）

`backend/tests/safety/safety-api.test.ts`：

- 读接口免鉴权、写接口 401/403
- 模拟观测 → 规划 → 校验 → `NORMAL`，前端读到的 `plan_id` 与状态一致
- 三个演示场景各跑两遍，结果稳定
- 场景 C 大屏数据包含拒绝原因、`candidate_plan`、`E_B` 关闭并带 `blocked_by_incident_id`
- provider 状态真实反映本机（昇腾 `available=false`）
- 自然语言解析只产出草稿，不改变 `constraint_version`
- 审计与 Trace 记录完整

## 4. 三场景验收（进程内运行器）

```powershell
npm run demo:safety --prefix backend
```
```text
✓ 三个场景全部符合预期
```
| 场景 | 期望 | 实测 | 已分配 | 校验 |
| --- | --- | --- | --- | --- |
| A 常规 | NORMAL | NORMAL | 1000/1000 | 通过 |
| B B 出口火灾 | REROUTE | REROUTE | 1000/1000（E_B 移出分配） | 通过 |
| C 容量不足 | REJECT | REJECT | 1620/1800 | 不通过（`unresolved_demand`） |

## 5. 真实进程验证

```powershell
$env:PORT=8099; npm run dev --prefix backend
```

| 请求 | 结果 |
| --- | --- |
| `GET /health` | 200，`llm: deepseek-chat`，`structured_spots: 22` |
| `GET /api/v1/safety/status` | 200，`DEGRADED`，原因 `no_observations` + 6 个 `untrusted_observation` |
| `POST /api/v1/safety/demo/A_normal/run` | `matched: true`，`NORMAL` |
| `POST /api/v1/safety/demo/B_exit_fire/run` | `matched: true`，`REROUTE` |
| `POST /api/v1/safety/demo/C_capacity_shortage/run` | `matched: true`，`REJECT` |
| `POST /api/v1/safety/observations/video`（合成 AVI） | 检出 4 人，`confidence=0.35`，`source=recorded_video`，`evidence.simulated=false`，状态 `DEGRADED` |
| `GET /command-center` | 200（SPA 入口），构建产物包含大屏代码 |

> 视频用例最终进入 `DEGRADED` 是**设计预期**：演示场景摄像机为 `uncalibrated`，
> 置信度被强制压到 0.35 < 0.6，系统按规则拒绝用未标定的视频观测发布路线。

## 6. 原灵小禅功能回归

| 项 | 结果 |
| --- | --- |
| 既有后端测试（74） | 全部通过 |
| 既有前端测试（19） | 全部通过 |
| 既有 Python 测试（70） | 全部通过 |
| 游客/管理路由 | 未改动（`router.ts` 仅新增 1 行挂载） |
| RAG / Scene / Route 服务 | 未改动 |
| 前端原有页面与路由 | 未改动（`App.tsx` 仅新增 1 条路由） |

未删除、未弱化任何既有断言。

## 7. 已知未覆盖

- 昇腾硬件推理路径：无设备，无法执行（`providers/ascend.ts` 的 infer 分支未被真实执行）。
- 真实人群视频：仅有合成视频，无带标注的真实人群数据集，因此未给出计数准确率指标。
- 浏览器端的真实交互（点击按钮走通全链路）：由 4 个组件测试 + 手工 `curl` 覆盖，
  未编写 Playwright 端到端用例。
- 长时间稳定性 / 内存增长 / 并发压力：未做。
