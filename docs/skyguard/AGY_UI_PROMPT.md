# 给 AGY 的提示词：优化 SkyGuard 指挥大屏前端

> 用法：整段复制（含代码块内容）发给 AGY。它按「先截图自检 → 一次一版 → 量化验收」的流程做。

---

## 角色与目标

你是资深前端 + 数据可视化设计师。仓库是灵小禅（Lingshan AI Guide）文旅智能体，
我要你优化 **SkyGuard 指挥大屏**（`/command-center`）的视觉与信息设计。

这不是"把颜色调好看"的活。大屏的读者是值班人员：要在 3 秒内回答"现在能不能放行、
哪里不安全、要我做什么"。所以你的目标是**决策可读性**，不是装饰。

前置要求：**先自己截图看，再动手**。不要凭想象改样式。

## 一、绝对红线（违反即失败）

1. **不得编造数据**：页面一切数值来自 `/api/v1/safety/*`，不得写死假数字、假状态、假成就。
2. **不得在页面里做安全判定**：状态（NORMAL/REROUTE/DEGRADED/REJECT）只由后端给出，
   前端只负责呈现与发起操作。
3. **DEGRADED 下不得显示任何路线**（含候选）；**REJECT 下不得出现绿色/已验证路线**，
   只能显示"候选方案 + 违规原因"。这是产品红线，测试会校验。
4. **不得美化不确定**：`estimated`、`uncalibrated`、`unverified`、昇腾不可用，必须原样呈现，
   不许用"正常"配色、不许折叠隐藏。
5. **不得改动后端**（`backend/**` 只读），不得改 API 契约。
6. **不得为了好看牺牲可访问性**：不靠颜色单独传达状态，不靠动效传达信息。
7. **不许把测试改绿了事**：`CommandCenterPage.test.tsx` 的断言代表业务约束，不是样式细节。

## 二、色板：必须与主项目统一

大屏是深色域，但色相必须和主项目（灵山朱 / 描金 / 宣纸）同源，**禁止冷蓝黑 + 电光蓝**。

| 用途 | 令牌 | 值 |
| --- | --- | --- |
| 页面底 | `--sg-bg-0` | `#14100E`（暖墨） |
| 面板 | `--sg-bg-1` / `--sg-bg-2` | `#1B1512` / `#221A16` |
| 抬升面 | `--sg-bg-3` / `--sg-bg-4` | `#2A211B` / `#342A22` |
| 发丝线 | `--sg-line-1/2/3` | `rgba(217,179,106,.12/.22/.38)` 描金 |
| 主文本 | `--sg-text-1` | `#F5EFE9`（15.8:1） |
| 次文本 | `--sg-text-2` | `#C4B5AA`（9.1:1） |
| 元数据 | `--sg-text-3` | `#9C8C82`（5.6:1） |
| 品牌强调 | `--sg-brand` / `--sg-brand-deep` | `#F06292` / `#C41D7F` |
| 描金强调 | `--sg-gold` | `#D9B36A` |

四态语义色是唯一允许的非品牌色（安全状态必须靠色相区分，且必须同时给文字）：
`--sg-ok #4FBF8B`（常态）/ `--sg-info #7BA7C9`（重规划）/ `--sg-warn #E0A33C`（降级）/ `--sg-danger #E85B50`（拒绝）。

任何新增色值先算对比度：正文与元数据 ≥ 4.5:1，大字号 ≥ 3:1。描金 `#D4A853` 对浅底只有 2.2:1，只能做装饰。

## 三、字号/间距/圆角（当前基线，可微调不可倒退）

- 字号阶梯：`12 / 13 / 14 / 15 / 17 / 22 / 28`（**下限 12px**，之前 10–11px 铺满导致观感廉价，已修，不许退回）。
- 间距：4/8/12/16/20/24 的 8px 节奏。
- 圆角：6 / 10 / 14 / 18；胶囊 999。
- 数字、编号、ID 一律等宽 + `tabular-nums`。

## 四、当前页面结构（改造对象）

文件（**只改这些**）：

```
frontend/src/pages/command-center/CommandCenterPage.tsx    1291 行  页面
frontend/src/pages/command-center/CommandCenterPage.css    1693 行  深色域令牌 + 样式（作用域 .cc-root）
frontend/src/pages/command-center/icons.tsx                 161 行  自绘 SVG 图标（24×24 / 1.6 描边）
frontend/src/services/safetyApi.ts                          286 行  API 客户端（只读，勿改契约）
```

现有版式：顶栏（品牌 + 状态徽标 + 实时/返回）→ 元信息条 → 提示条 → KPI 概要条（可信人数/分配进度/未解决/可用出口/风险分布）
→ 主栅格 `01 感知输入 | 02 态势图 | 03 决策状态` → 底部 `04 事件与操作 | 05 审计时间线`。

设计规范文档：`docs/UI_DESIGN_SYSTEM.md`（先读，尤其 §7 无障碍与 §8 大屏约束）。

## 五、我怀疑的问题（需要你判断，不要照抄）

1. **卡片墙**：5 个同权重描边面板，一眼全是格子，没有主次。态势图是主角吗？不像。
2. **信息过载**：一屏 ~20 个数字块，值班员不知道该先看哪。
3. **层次雷同**：面板标题、KPI 标签、表格表头都是同一种小字 + 同一种灰色，扫读锚点少。
4. **图形表达弱**：态势图是 SVG 折线 + 矩形，缺乏"空间感"（楼层/方向/距离/人流方向）。
5. **空态与降级态无聊**：DEGRADED 时整屏只有一堆文字原因。

请你自己截图后**列出你看到的问题清单**，再给改法。不要假设我上面列的是对的。

## 六、验收标准（必须逐条跑，交出输出）

```powershell
# 在 frontend 目录
npx tsc -b --noEmit          # 0 错误
npx eslint .                 # 0 错误
npx vitest run               # 23/23 通过（大屏 4 例）
npx vite build               # 成功
```

量化指标（用 Playwright 自查，见第八节脚本）：

| 项 | 标准 |
| --- | --- |
| 横向溢出 | 1440 / 1280 / 390 三档均为 0 |
| console 报错 | 0（仅允许 8001 TTS 的 `ERR_CONNECTION_REFUSED`） |
| 文本对比度 | 逐节点 ≥ 4.5:1（大字号 ≥ 3:1），渐变底白字需手工确认 |
| 文字截断 | 除刻意 ellipsis 的 ID/日志列外，无截断 |
| 三态回归 | 手动跑演示场景 A/B/C，分别得到 NORMAL / REROUTE / REJECT，且视觉规则正确 |

## 七、不能破坏的测试断言（血泪清单）

`CommandCenterPage.test.tsx` 会检查，改结构时逐条对照：

- `getByRole('status')` 的元素内必须含大写状态名（如 `NORMAL`），**且全文只能有一个 `role="status"`**。
- 必须存在**文本恰好等于**这些字符串的独立元素（多一个副本就会因 `getByText` 命中多个而失败）：
  `已验证方案` / `通过独立校验` / `候选方案 · 未通过校验` / `需人工介入：是` / `当前无可展示方案`（这句目前只允许一处，KPI 提示里不能重复）
- 必须存在文本恰好为 `380` 的独立节点（区域人数单元格里保留 `<span>380</span>`，不要拼成 `380 人`）。
- 正则命中：`/本场景为合成演示数据/`、`/未经安全验证/`、`/最后一次有效观测/`、`/unresolved_demand/`、`/ascend/`（**小写**）、`/cann_toolkit/`。
- SVG 类名契约：已验证路线必须带 `map-route-validated`，候选路线必须带 `map-route-candidate`；对应状态下另一类必须**完全不存在**。
- NORMAL 用 `getAllByText('380')` 校验人数出现在多处，别把人数藏进 canvas 或图片。

## 八、环境与坑（自己动手前先确认）

| 项 | 现状 |
| --- | --- |
| 前端 dev | `http://localhost:5173`（已在跑，HMR 生效） |
| 后端 | `http://localhost:8010`（已在跑） |
| 构建产物 | `frontend/dist`，后端静态托管，所以 `8010` 看的是构建版；改完要 `npx vite build` |
| Python 语音/向量服务（8001） | **未启动**，问答页语音与 RAG 会降级，与本页无关 |
| Playwright 浏览器 | **未安装**，`chromium.launch()` 会失败；用 `chromium.launch({ channel: 'msedge' })` |
| 管理后台账号 | `admin / lingshan2026`；写接口需要 JWT，读接口开放 |

取 token 并截图（PowerShell 可对应改写）：

```bash
TOKEN=$(curl -s -X POST http://localhost:8010/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"lingshan2026"}' | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
```

在 `frontend/` 下建临时脚本（跑完删掉），核心片段：

```js
import { chromium } from '@playwright/test';
const b = await chromium.launch({ channel: 'msedge' });       // 必须指定 channel
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.addInitScript(t => localStorage.setItem('admin_token', t), process.env.SG_TOKEN);
const p = await ctx.newPage();
await p.goto('http://localhost:5173/command-center', { waitUntil: 'networkidle' });
await p.waitForTimeout(2000);
await p.screenshot({ path: '../tmp/ui-preview/skyguard-<版本号>.png', fullPage: true });
```

想看 REJECT / REROUTE 长什么样，直接调演示接口（无需点按钮）：

```bash
curl -s -X POST http://localhost:8010/api/v1/safety/demo/C_capacity_shortage/run \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}'
# A_normal → NORMAL，B_exit_fire → REROUTE
```

## 九、工作方式（重要）

1. **先审后改**：截图 3 个状态（NORMAL / REROUTE / REJECT）+ 移动端 390px，写出问题清单（每条附截图位置）。
2. **一次只改一版**：不要一口气重写 1693 行 CSS。先给出 1 个方案，附前后截图对比。
3. **改完立刻自测**：`tsc / eslint / vitest / build` 四条命令 + 溢出/对比度脚本，把输出贴出来。
4. **不确定就问**：涉及"要不要砍某块信息"这类产品取舍，先问我，不要自己删功能。
5. **保持诚实**：任何"已完成/已优化"的结论必须有命令输出或截图支撑。

## 十、交付物

1. 改动后的 `CommandCenterPage.tsx` / `CommandCenterPage.css`（必要时 `icons.tsx`）。
2. 问题清单 + 改法说明（每项对应一条视觉证据）。
3. 四条命令的原始输出。
4. 三态截图 + 390px 移动端截图，路径写在回复里。
5. 若改动了共享令牌（`frontend/src/styles/tokens.css`、`ui.css`），必须额外回归其余 8 条路由（`/`、`/qa`、`/recommend`、`/admin/*`），确认没有溢出与对比度退化。
