# AgentArts 接入与复现

## 部署和认证

复用现有 Node 后端与 Python 向量服务。后端部署到已授权的 HTTPS 域名；反向代理将 `/api/v1/agentarts/` 转发至 Node 服务。配置 `AGENTARTS_TOOL_API_KEY`，为运行数据目录提供写权限，备份 `data/agentarts-traces/`。正式使用原有模型和向量服务配置；`agentarts-local.ts` 仅用于离线验证。

调用 Header：`Content-Type: application/json`、`X-API-Key: <密钥>`；下游传递同一 UUID 格式的 `X-Trace-Id`。API Key 必须通过 Header 传入。未配置密钥返回 503，错误密钥返回 401，8 个未结束请求占满时返回 429。上游请求超时设为 40 秒，HTTP 节点文档限额为 50 秒。

后端的超时机制会阻止晚到结果继续发布或执行后续工具；已发出的现有模型/检索请求不支持统一取消，直到其真实结束仍占用并发槽位。不要假定 504 意味着上游已经取消。

## 工具契约

统一返回：`contract_version`、`trace_id`、`call_id`、`tool`、`execution_origin`、`latency_ms`、`status`、`data`。业务状态可能是 `success`、`needs_clarification`、`infeasible`、`no_evidence`。这些状态使用 HTTP 200，必须进一步判断 `status`；400/401/404/429/502/503/504 进入错误分支。详细输入结构以 [openapi.json](openapi.json) 为准。

未通过认证、未知工具或无效 Trace 等尚未开始执行的拒绝请求可能只有 `error`，没有执行编号；不要为这些响应假设已存在审计文件。

| Tool | POST 路径 | JSON 请求 | 关键输出 |
|---|---|---|---|
| extract_scene_state | `/tools/extract_scene_state` | `{"query":"游客原话"}` | `data.scene_state`、`missing_fields`、`confidence`、`conflicts`、`extraction_trace` |
| search_knowledge | `/tools/search_knowledge` | `{"query":"查询文本"}` | `data.answer`、`evidence`、`retrieval_trace`；无证据时不返回有依据的答案 |
| plan_route | `/tools/plan_route` | `{"scene_state":{...}}` | 候选 `route`、`scene_state`、`evidence`、`validation` |
| validate_route | `/tools/validate_route` | `{"scene_state":{...},"route":{...}}` | `data.valid`、`violations`、`preference_warnings` |
| suggest_alternative | `/tools/suggest_alternative` | `{"scene_state":{...},"failure_reasons":["原因码"]}` | 保留硬约束的新候选、`relaxed_fields`；必须重新调用 validate_route |

`scene_state` 必需决策条件：`currentLocation`（登记 ID）、`currentTime`（HH:mm）、`remainingMinutes`（正整数）。其他字段包括 `mobility`、`mustVisitSpotIds`、兴趣、演出偏好等。模型不得提供 `steps`、`feasible` 或路线耗时。输入出现未知字段会报 400。

原始计划硬约束必须原样传递给 validate_route，不能让总结模型重写时间或必去景点。缺失字段与关键冲突不允许被默认值掩盖。演出独立检查明确场次、地点、完整时长和提前入场缓冲（普通游客 15 分钟，行动不便/轮椅 20 分钟）。

替代方案仅自动移除兴趣和演出软偏好，保留时长、出发时刻、位置、行动能力及必去景点。若需缩减必去景点或增加预算，应先征得游客明确调整。返回替代方案时须说明与原偏好的差异。

审计查询：`GET /traces/{trace_id}`，沿用 API Key。后台审计查询使用管理员 JWT，经 `/api/v1/admin/agentarts/traces/{trace_id}`。每个工具有开始和完成/失败记录；本地编排还记录内部每次工具调用。审计保存失败返回 503，不声称执行已完整留证。

## AgentArts 画布配置清单

以下是人工配置说明，**不是声称可直接导入的 AgentArts 工作流导出文件**。实际工作空间联调后，应另存平台原生导出、版本和调用记录。

1. 开始节点：接收游客 `query` 和任务类型 `intent`。可用平台意图识别分到事实问答或路线分支；本地参考 API 为明确的 intent 枚举。
2. 路线分支 HTTP 节点 `extract_scene_state`：固定域名，POST 工具路径，API Key 设置为 Header / `X-API-Key`。JSON 模板：`{"query":{{query}}}`。字符串变量外不额外加引号。
3. 判断节点：先检查 HTTP `status_code == 200`，再解析 `body` 内 JSON 并检查 `status`。若 body 在当前工作空间表现为文本，使用代码节点解析，保留原始 body 用于调试。
4. 若 `needs_clarification`：提问器展示 `data.clarification`，接收补充后合并游客原话，重新抽取。不把预算、用餐等可选字段都视为必填。
5. 完整路线分支：按需调用 `search_knowledge` 获取文化/事实证据；调用 `plan_route`，传入抽取的 scene_state。结构化纯路线任务可以直接规划，知识检索不是物理可行性的替代。
6. 独立 HTTP 节点 `validate_route`：输入原 scene_state 和候选 route；仅 `status == success && data.valid == true` 进入发布分支。
7. 校验失败：调用 `suggest_alternative`，输入原约束和违规码；再调用 `validate_route`。限制为一次自动替代，禁止无限循环。仍失败则结束，说明原因并邀请游客调整。
8. 事实问答分支调用 `search_knowledge`：无证据或错误时返回明确的资料不足；不得让模型补写虚构来源。
9. 总结/结束节点：引用已验证的 route、证据和 trace_id。总结模型只组织语言，禁止增加站点、修改场次、预算或 feasible。
10. 所有 HTTP 节点错误支路都输出明确失败；若开启“异常忽略”，默认输出必须为 error、禁止默认为可行。只对瞬时网络错误做一次有界重试；保留同 trace_id，各次 call_id 不同。

第一阶段最小验证只需开始→plan_route→结束，确认 HTTPS、认证及参数映射；此时不得声称已完成独立校验闭环。

最小显式输入：

```json
{"scene_state":{"currentLocation":"south_gate","currentTime":"09:00","remainingMinutes":120,"mobility":"wheelchair","mustVisitSpotIds":["LS-013"]}}
```

## 平台联调验收与实验

保存工作空间 ID、工作流版本、原生导出、HTTP 节点调试输出、后端 trace_id、成功/追问/不可行/故障四类真实记录。平台公开调用 API 的认证和消息封装必须以实际工作空间和当前文档为准，此仓库没有猜测平台 API URL。

评测器支持 `original`（既有游客接口）、`local_reference`（本地参考）和 `agentarts`。真实平台可通过一个薄桥接服务将其输出归一为本项目 envelope，`execution_origin` 必须为 `agentarts`，run-config 必须含 `workflow_version`；通过 `--decision-url` 明确指定已联调的桥接端点。该桥接尚未实现，因为工作空间调用契约未知。不得将本地端点伪装成平台端点。

当前规划器自身已包含校验，关闭外层 validate_route 不能视为纯粹“关闭独立校验”的有效消融。正式消融需另外隔离原始候选生成与全部验证路径，记录实验专用实现，禁止增加生产环境可关闭校验的开关。当前不报告该消融成绩。

## 已核对的官方文档

2026-10-28 读取，页面注明更新于 2026-09-16：[HTTP 请求节点](https://support.huaweicloud.com/lowcode-agentarts/http_node.html) 支持 GET/POST、API Key、JSON、固定域名及 50 秒限额，不支持流式；[工作流介绍](https://support.huaweicloud.com/lowcode-agentarts/agentarts_05_0041.html) 列出判断、提问器、HTTP 请求与异常等节点。实际平台能力仍应在目标工作空间逐项验证。
