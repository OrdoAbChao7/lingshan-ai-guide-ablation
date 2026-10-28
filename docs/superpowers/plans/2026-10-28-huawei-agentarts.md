# 华为 ICT AgentArts 实施计划

**Goal:** 执行用户提供的 V1.0 方案，交付可联调的工具后端、本地闭环、评测入口及参赛材料底稿。

**Architecture:** 保留现有 React、Express、三路混合检索、场景抽取与确定性规划。新增隔离的 AgentArts HTTP 工具适配层，平台编排调用五个工具；本地编排仅用于开发验证，明确标记来源。

**Tech Stack:** TypeScript、Express、Zod、Node test、Python 标准库。

**Spec:** 用户附件，归档于 `docs/competition/huawei-ict/design-v1.md`。

## Global Constraints

- 历史基线 96.0%、历史完整检索观察值 98.0%，不得作为改造版成绩。
- 不改写 AIC 材料，不假称已注册或发布 AgentArts 工作流。
- API Key 放 Header；HTTP 节点官方最长 50 秒，适配层超时 40 秒；非流式 JSON。
- 不放松时间、行动能力、必去景点等硬约束；替代方案只放松软偏好。
- 资格咨询、成员信息、平台发布与现场核验必须有真实记录。

## Review Focus

1. 伪造 feasible、空路线、篡改时间轴必须被独立工具拦截。
2. API Key 缺失、错误、未配置不得访问工具或审计文件。
3. 追问不得默认补入当前位置、时刻或剩余时间。
4. 工具失败与超时不得变成可行路线，审计失败必须显式报错。
5. 测试桩、离线规则验证与真实平台成绩分别记录。

## Task 1：审计和工具契约

- [x] 归档原始设计，保存起点 commit、路网计数/哈希和实际实现差异。
- [x] 新增 `backend/src/services/agentarts/contracts.ts` 和 `tools.ts`，复用现有服务实现五个逻辑工具。
- [x] 先在 `backend/tests/agentarts/tools.test.ts` 写越权字段、独立校验、硬约束保留、缺失输入测试，运行观察失败，再实现并验证。

## Task 2：HTTP、审计与闭环

- [x] 新增 `backend/src/api/v1/agentarts.ts`，API Key、JSON 契约、40 秒超时、追踪 ID、持久化审计。
- [x] 在 API Router 挂载 `/agentarts`；新增本地闭环 `/decide`，标记 `local_reference`。
- [x] 测试认证、超时、故障、共享 Trace 和返回结果边界。
- [x] 提供 OpenAPI、逐节点映射和冒烟脚本；不伪造平台导出格式。

## Task 3：评测与交付

- [x] 建立 80 条开发候选案例（20/20/15/15/10），正式盲测冻结前不称独立测试集。
- [x] 评测脚本保存 commit、dirty、数据哈希、配置、原始输入输出及延迟；未运行系统标记待测。
- [x] 完成资格咨询草稿、阶段台账、部署复现说明、14 页答辩底稿和演示脚本。
- [x] 运行后端构建、适配层测试、现有 TypeScript/Python 回归，记录实际结果。
- [x] 复核差异、清理本次临时文件，列出平台与人工依赖。

## 执行记录

2026-10-28：用户明确要求执行已给出的设计，当前会话连续实施。平台工作空间与 HTTPS 地址已询问，不阻止本地实现。当前分支 `codex/huawei-ict-agentarts`，起点 `14709b23e6096cd276ed8f51b32308903c9611c8`。

2026-10-28 实施结果：本地工具、后台面板、契约导出、离线评分器及材料底稿已完成。AgentArts真实联调、独立盲测、最终PPT/录像、参赛资格与提交仍为外部依赖，不能视为整份六阶段方案已完成。独立审查两轮发现的问题均已加复现用例并修复。
