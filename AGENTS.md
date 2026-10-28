# AGENTS.md — 灵小禅项目 AI Agent 开发与迭代工作准则

## 华为 ICT 分支增量约定（2026-10-28）

本分支 `codex/huawei-ict-agentarts` 执行用户明确提供的第十一届华为 ICT 创新赛赛题二方案。分支新增部分以 `docs/competition/huawei-ict/README.md`、`integration.md` 和实际工具契约为依据；下文 AIC 材料作为既有版本历史依据保留。

- 当前代码路网实数为 23 节点、30 条边，全部边标记 estimated，尚无坡度字段。下文的 31 道路及坡度描述不能用作本分支新成果声明。
- AgentArts 工具服务、本地参考编排与平台真实工作流是三个不同状态；没有平台原生导出和真实调用记录时，不得声称平台集成完成。
- 新工具入口为 `/api/v1/agentarts/tools/*`，必须使用 Header API Key；后台调试走管理员 JWT。保留独立校验、完整时间守恒、演出场次与入场缓冲，不增加生产关闭校验开关。
- 80 条案例当前为开发候选集，不是独立盲测。离线模型未调用的结果不能代替 Full-RAG 或平台成绩。
- 资格、队伍、学校截止、真实成本/QPS、现场测绘及平台性能以真实核验为准；不得沿用历史材料推定已完成。
- 新答辩材料继续保持 P1—P14。原 AIC 材料和 96.0%/98.0% 历史成绩保持原来源与版本边界。

> 📌 **项目唯一权威 Agent 指南（强制遵循 · 任何改动的基础依据）**：
> 欢迎来到 **灵小禅（Lingshan AI Guide）** 智能体工程仓库。
> 本文档是所有 AI Agent（包括代码编写、测试运行、文档撰写、PPT 生成与算法优化 Agent）介入本项目时的**最高指导规范与行动依据**。
> 在对本仓库进行任何代码改动、文档调整或评测分析前，**必须首先阅读并无条件遵守本文档中的架构约定、评审红线与验证要求**。

---

## 1. 项目定位与核心使命 (Mission & Identity)

* **项目定位**：**灵小禅 · 灵山胜境可信文旅决策智能体**（面向真实景区的可信文旅决策智能体：从单点事实问答到物理时空多约束规划）。
* **参赛赛道**：**第八届全球校园人工智能算法精英大赛（AIC）· 算法创新赛 · AI+场景创新赛道**。
* **核心范式升维**：
  * **传统 AI（回答事实）**：查百科/查票价 $\to$ 概率生成，数字错漏只是口误，游客体验割裂；
  * **灵小禅（辅助决策）**：算路线/算时间 $\to$ 物理刚性约束，算错一步即造成游客体力透支与安全事故。
* **核心技术哲学**：**软硬解耦、各司其职**。
  * **大模型做语义软理解**：负责游客口语意图理解、13 维状态画像提取与文化温度互动；
  * **运筹引擎做时空硬规划**：负责物理拓扑路网计算、无障碍坡道过滤、演出时间窗对齐与 14 项形式化守恒仲裁。

---

## 2. 大赛评审标准与四项绝对红线 (Competition Rubric & Redlines)

所有 Agent 对本项目提出的改动与产出，必须以大赛官方 100 分标准为考核目标（冲刺 95+ 特等奖/金牌区间）：
* **创新性 (20分)**：范式升维（问答 $\to$ 决策）、双引擎软硬解耦架构、代码级防越权门禁；
* **需求分析 (15分)**：文旅三大现实翻车痛点（物理常识盲区、时效错配、事实口误）、关爱弱势群体、倒排时空推演；
* **解决方案可行性 (20分)**：`Promise.all` 三路并行检索 + RRF 融合 + 官方指南置顶；物理路网 + Dijkstra + 24宽 Beam Search；
* **项目实施 (15分)**：五层架构解耦、Live2D 情绪驱动、双屏前端分流（QAPage / RecommendPage）、4核边缘节点；
* **测试与验证 (10分)**：50 题 Fact Contract 权威基线（96.0%）、7 组受控消融（98.0% 观察值）、全链路 Trace 审计；
* **应用效果 (15分)**：英雄案例实测物理动线还原、20分钟不可达诚实拒绝与优雅降级；
* **总结与展望 (5分)**：三阶轻量落地（1/2/4周）、商业变现闭环与极低算力成本（年综合成本 < 1.5 万元，3~6 个月收回 ROI）。

### ⚠️ 四项绝对不可触碰的技术红线：
1. **红线一 · 证据绝对可复现（拒绝数据造假）**：
   - 严禁为了“图表好看”人为编造平滑阶梯数据。消融实验必须严格采用 `docs/ablation_report.md` 中的 7 组真实测量值；
   - 事实问答权威基线必须明确为 50 题 **96.0%**（48/50），消融实验完整方案明确为受控运行观察值 **98.0%**，场景槽位测试 **100% (40/40)**，边界路线测试 **100% (60/60，0次物理硬违规)**。
2. **红线二 · 架构表述与代码严格一致（拒绝表述冲突）**：
   - 检索机制必须严格表述为代码实测的：基于 `Promise.all` 的三路并行检索（向量 + 结构化 + 关键词）+ RRF 融合（$k=60$）+ Cross-Encoder 重排 + 官方指南权威兜底；
   - 严禁将 2026-09-16 的历史串行回退链当成当前系统表述；
   - 任何涉及检索的修改必须保证 `backend/src/services/rag-service.ts`、`hybrid-retriever.ts` 与技术文档完全一致。
3. **红线三 · 拒绝虚假承诺，坚守物理真实（拒绝路线盲猜）**：
   - 路线推荐必须基于 23 景点与 31 道路数字孪生路网的真实物理米数、坡度阻抗与演出时间窗；
   - 必须保留“诚实拒绝与优雅降级”特性：当时间不足时，系统必须明确拒绝并给出备选微游览，绝不能为了“讨好游客”而生成不可行的超时路线。
4. **红线四 · 突出工程交付与低成本高 ROI（拒绝纯云端玩具）**：
   - 避免讲成纯云端调用或纯算法公式，必须强化端到端交付实力（双屏 UI 原型、证据追溯抽屉、高德实景导航调起）；
   - 商业化强调“4 核边缘节点支撑 200 QPS 拓扑求解、年综合成本 < 1.5 万、3~6 个月收回成本”的轻量落地优势。

---

## 3. 系统技术架构与核心代码图谱 (Codebase Map)

系统由五层架构解耦构成，Agent 介入时需按层定位文件：

```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│  5. 表现层 (Presentation)                                                        │
│     - QAPage.tsx: 事实问答与文化互动，含【证据追溯抽屉】(出处、相似度、时延)             │
│     - RecommendPage.tsx: 多约束规划动线看板，含【调起高德/百度实景导航】与交互追问弹窗    │
│     - Live2D / PixiJS: 汉服数字人多模态交互，emotion-service 情绪驱动 (倾听/欢喜/致歉)   │
├──────────────────────────────────────────────────────────────────────────────────┤
│  4. 规划层 (Planning Engine)                                                     │
│     - backend/src/services/route-planner.ts: 物理拓扑运筹规划引擎                 │
│     - Dijkstra: 空间无障碍过滤 (剔除台阶与大坡度边)                                │
│     - 24 宽 Beam Search: 时空多目标组合打分 + 前置 15~20 分钟排队缓冲             │
│     - 动态纠偏: 超时 > 10min 自动增量重规划；不可行时优雅降级为纯游览备选          │
├──────────────────────────────────────────────────────────────────────────────────┤
│  3. 知识层 (Knowledge & Hybrid RAG)                                              │
│     - backend/src/services/rag-service.ts: RAG 核心调度，Promise.all 三路并行检索   │
│     - backend/src/services/retrieval/hybrid-retriever.ts: RRF 倒数排名融合 (k=60)  │
│     - backend/src/services/structured-knowledge.ts: 23 景点 × 8 核心属性二级索引   │
│     - backend/python/vector_service.py: ChromaDB + BAAI/bge-large-zh-v1.5        │
│     - data/raw/knowledge_guide.txt: 官方权威指南，信源冲突时最高优先级置顶裁决     │
├──────────────────────────────────────────────────────────────────────────────────┤
│  2. 状态层 (Scene State Understanding)                                           │
│     - backend/src/services/scene/scene-extractor.ts: 13 维状态画像双轨抽取        │
│     - 倒排时空约束推演 (Backward Scheduling): 以离园死线与演出缓冲逆推当前出发时刻  │
│     - FORBIDDEN_LLM_FIELDS 门禁: 剥夺 LLM 生成 steps/feasible 权力，防止越权编造  │
│     - 置信度门禁: >= 0.75，低置信度或必选缺失触发交互追问                         │
├──────────────────────────────────────────────────────────────────────────────────┤
│  1. 底座层 (Data Contracts & Formal Verification)                                │
│     - backend/src/services/route-validator.ts: 14 项形式化守恒仲裁器               │
│     - 数据契约 (Zod): 23 核心景点设施 + 31 道路数字孪生路网 (坡度、米数、耗时)     │
│     - 全链路 Trace 审计: 记录 rewrite, vector, structured, keyword, rrf, rerank 状态 │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 评测基准与复现协议 (Evaluation & Reproduction)

任何对检索（RAG）、状态抽取（Scene Extractor）或路线规划（Planner）的改动，**必须运行对应的自动化评估套件，且不得破坏现有测试基准**：

### 4.1 核心评测命令 (PowerShell)
```powershell
# 1. 运行 Full-RAG 权威基线测试 (50 题 Fact Contract)
python backend/python/tools/run_ablation.py `
  --profiles full_retrieval `
  --output-dir evaluation/results/baseline_check `
  --run-id baseline_check `
  --base-url http://127.0.0.1:8010 `
  --report-path evaluation/results/baseline_check/report.md

# 2. 运行 7 组完整组件消融实验
python backend/python/tools/run_ablation.py `
  --profiles vector_only,structured_only,keyword_only,full_retrieval,vector_rerank,full_without_rerank,full_without_rewrite `
  --output-dir evaluation/results/ablation_check `
  --run-id ablation_check `
  --base-url http://127.0.0.1:8010 `
  --report-path evaluation/results/ablation_check/report.md

# 3. 运行 Python 单元与回归测试
python -m unittest discover -s backend/python/tools -p "test_*.py"

# 4. 运行 TypeScript 单元测试
npm test --prefix backend
```

### 4.2 权威数据基准（对比参照系）：
* **50 题 Fact Contract Baseline**：通过率 **96.0%** (48/50)，平均时延 3027.64ms（证据：`evaluation/results/baseline_20260917_020000/`）。
* **7 组消融实验（Ablation）**：
  * Vector only: 94.0% 准确率，0.960 召回率，2336.08 ms
  * Structured only: 66.0% 准确率，0.694 召回率，2172.20 ms
  * Keyword only: 96.0% 准确率，0.977 召回率，2221.56 ms
  * Full retrieval: 98.0% 准确率，0.980 召回率，2882.68 ms
  * Vector + Rerank: 94.0% 准确率，0.950 召回率，2873.62 ms
  * Full without Rerank: 90.0% 准确率，0.933 召回率，2358.02 ms
  * Full without Rewrite: 98.0% 准确率，0.993 召回率，2414.48 ms
* **40 组场景槽位测试**：100% (40/40) 槽位准确率，关键缺失识别率 100%（证据：`evaluation/results/scene/scene_benchmark_v1.json`）。
* **60 组边界路线测试**：100% (60/60) 形式化合规，物理硬违规恒为 0（证据：`evaluation/results/route/route_validator_v1.json`）。

---

## 5. 竞赛材料包与 PPT 规范 (Presentation Packages)

所有涉及答辩 PPT、设计素材、演示文稿或交接文档的改动，**必须统一采用 14 页金牌标准版**：

* **唯一权威 PPT 结构**：**14 页金牌标准版（P1~P14）**
  * `P1 封面` $\to$ `P2 痛点` $\to$ `P3 破局` $\to$ `P4 全景` $\to$ `P5 检索机制` $\to$ `P6 检索对比` $\to$ `P7 消融实证` $\to$ `P8 状态理解` $\to$ `P9 路线运筹` $\to$ `P10 专项看板` $\to$ `P11 英雄案例` $\to$ `P12 产品工程` $\to$ `P13 推广价值` $\to$ `P14 总结收官`。
  * 严禁再次倒退或拆分出 13 页版本，保持全库页码与引用严格对齐。
* **交付目录分工**：
  * `交付给PPT设计师的资料包/`: 专为外部 PPT 制作者准备（02_文案分镜、03_图表数据、04_高清插图素材）；
  * `竞赛汇报与文档材料包/`: 内部全套交付归档（00_交接指南、00_官方评分标准、01_汇报PPT、03_申报报告与论文、04_评测报告、05_现场演示）；
  * `docs/competition/`: 官方赛题规则对标、基准报告与申报底稿。

---

## 6. Agent 行动自检清单 (Checklist Before PR/Completion)

在完成任何任务并向用户交付前，Agent 必须在内心核对以下 5 个问题：
1. [ ] **数字是否真实统一？** 是否存在编造的平滑阶梯数据或冲突口径？（基线 96.0%、消融 98.0%、状态 100%、路线 0 违规）。
2. [ ] **检索表述是否真实？** 是否写成了 `Promise.all` 三路并行 + RRF 融合？是否澄清了历史回退链仅为早期快照？
3. [ ] **路线是否真实可走？** P11 案例是否给出了分钟级、米数、坡度、无障碍判定与排队缓冲？是否保留了诚实拒绝？
4. [ ] **工程感是否突出？** P12 是否展示了双屏 UI（证据追溯抽屉 + 实景导航）和 4 核边缘节点参数？
5. [ ] **是否对标大赛 100 分标准？** 产出是否能支撑创新性(20)、需求分析(15)、方案可行性(20)、项目实施(15)、测试验证(10)、应用效果(15)、总结展望(5) 的最高档得分？
