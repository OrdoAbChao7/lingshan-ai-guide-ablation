# 灵小禅 · 华为 ICT 创新赛实施包

项目：**灵小禅——基于华为 AgentArts 的可信文旅决策智能体**。设计稿原文见 [design-v1.md](design-v1.md)，此次实施分支为 `codex/huawei-ict-agentarts`。

## 当前交付状态

已实现五个 HTTP 工具、工具认证、输入契约、独立校验增强、保留硬约束的替代方案、本地参考编排、持久化 Trace、后台调试面板及开发评测入口。尚未取得 AgentArts 工作空间及后端 HTTPS 地址，因此平台工作流注册、发布与真实调用尚待联调。不得把 `/decide` 的本地编排描述为已运行的 AgentArts 工作流。

| 入口 | 用途 |
|---|---|
| [integration.md](integration.md) | 部署、五工具接口、AgentArts 逐节点映射与冒烟步骤 |
| [openapi.json](openapi.json) | 从运行时 Zod 契约导出的 OpenAPI 3.0.3 |
| [audit-and-delivery.md](audit-and-delivery.md) | 原版审计、技术演进、资格咨询草稿、阶段交付台账 |
| [presentation-and-demo.md](presentation-and-demo.md) | 14 页答辩文案底稿与演示录像脚本 |
| [verification.md](verification.md) | 实际测试结果、离线对比与尚未完成的验收 |
| [../../../evaluation/agentarts/](../../../evaluation/agentarts/) | 80 条开发候选案例、独立路线评分器、原始验证证据 |

## 快速运行

正常后端使用既有 `npm run dev --prefix backend`；在仓库根目录 `.env` 中配置 `AGENTARTS_TOOL_API_KEY`，作为 AgentArts HTTP 节点的 `X-API-Key`。不要把工具密钥写入前端。

构建后访问 `/admin/login`，进入管理后台的 **AgentArts 调试** 标签。后台使用原有管理员 JWT，不需要在浏览器输入工具密钥。面板支持自然语言需求、事实问答、缺失条件补充、已校验路线、证据来源和完整执行记录。

完全离线、数据隔离的开发验证：

```powershell
npm run build --prefix frontend
npx --prefix backend tsx backend/scripts/agentarts-local.ts tmp/agentarts-runtime.json
```

该进程不读取 `.env`，禁用现有在线模型，临时目录复制知识源并保存执行记录。元数据文件含临时工具密钥，仅供本机脚本读取，不提交。另开终端：

```powershell
$runtime = Get-Content tmp/agentarts-runtime.json -Raw | ConvertFrom-Json
$env:AGENTARTS_TOOL_API_KEY = $runtime.token
python evaluation/agentarts/evaluate.py --profile local_reference `
  --base-url $runtime.base_url `
  --run-config evaluation/agentarts/local-offline-config.json `
  --output-dir evaluation/agentarts/results/my-local-run
Remove-Item Env:AGENTARTS_TOOL_API_KEY
```

输出目录必须不存在，以保留每次失败证据。运行结束在服务终端按 Ctrl+C 清理临时元数据和运行目录。

## 成绩口径

历史 50 题事实基线为 48/50（96.0%），历史一次完整检索消融观察值为 98.0%，均属于旧版本。此次离线开发验证原始结果放在 `evaluation/agentarts/results/`，不可与历史成绩直接比较，也不可用来宣称 AgentArts 性能提升。

开发集由旧事实题前 20 题和显式约束案例构成，包含复用及程序化构造，**不是独立盲测集**。正式评测前须另行审核、分离盲测、冻结哈希，并运行原版、真实平台版和有明确因果边界的消融版本。
