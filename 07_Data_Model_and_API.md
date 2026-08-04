# 07｜数据模型与内部 API

## 1. 建模原则

1. 内部 UUID 与外部 ID 分离；
2. 原始来源记录不可变，规范化实体可演进；
3. AI 生成、用户编辑和同步副作用均保留 provenance；
4. Markdown 是开放输出，不是唯一数据库；
5. PDF 版本、解析版本和笔记版本分别管理；
6. 删除采用可恢复 tombstone，外部系统删除需额外确认。

## 2. 核心实体关系

```text
Topic 1──* ReadingPack 1──* ReadingPackItem *──1 Paper
Paper 1──* PaperVersion 1──* EvidenceAnchor
Paper 1──* ReadingSession
Paper 1──* Claim *──* EvidenceAnchor
Paper 1──* NoteBlock *──* EvidenceAnchor
Claim *──* ClaimRelationship
Topic 1──* Proposition *──* Claim
ModelRun 1──* Claim/NoteBlock drafts
Paper/Topic 1──* SyncRecord
Workspace 1──* Job
```

## 3. 实体定义

### 3.1 Paper

规范化论文身份，不绑定某一个版本。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | UUID | 内部稳定 ID |
| `title` | string | 规范化标题 |
| `abstract` | string? | 带来源的当前首选摘要 |
| `year` | int? | 首选出版年 |
| `venue_id` | UUID? | 期刊/会议 |
| `publication_state` | enum | preprint/published/corrected/retracted/unknown |
| `preferred_version_id` | UUID? | 当前显示版本 |
| `metadata_quality` | float | 0–1 |
| `created_at/updated_at` | datetime | 时间戳 |
| `deleted_at` | datetime? | tombstone |

相关表：`paper_identifier`、`paper_author`、`paper_relation`、`metadata_assertion`。

### 3.2 MetadataAssertion

同一字段可能来自多个来源：

```json
{
  "entity_type": "paper",
  "entity_id": "uuid",
  "field": "publication_state",
  "value": "corrected",
  "source": "crossref",
  "source_record_id": "...",
  "retrieved_at": "...",
  "confidence": 0.98,
  "is_preferred": true
}
```

### 3.3 PaperVersion

| 字段 | 说明 |
|---|---|
| `version_type` | submitted/accepted/published/corrected/local_unknown |
| `source_url` | 来源；可能为空 |
| `license` | SPDX-like 或原始字符串 |
| `pdf_sha256` | 内容身份 |
| `local_attachment_ref` | Zotero/file vault 引用 |
| `page_count` | 页数 |
| `parse_status` | not_started/partial/complete/failed |
| `parser_version` | 解析器版本 |

### 3.4 Topic

```json
{
  "id": "uuid",
  "name": "Emergent abilities in LLMs",
  "slug": "emergent-abilities-llms",
  "description": "...",
  "intent": {},
  "tracking_enabled": true,
  "owner": "user",
  "created_from": "manual_query"
}
```

### 3.5 ReadingPack / ReadingPackItem

`ReadingPack` 是一次可复现的推荐结果，保存查询、候选快照、算法版本和用户编辑。

`ReadingPackItem`：

- `paper_id`；
- `role`：foundation/frontier/counterpoint/bridge/resource；
- `role_score`；
- `role_confidence`；
- `rank`；
- `reading_mode`；
- `rationale[]`（每条带 evidence_type）；
- `prerequisite_item_ids[]`；
- `selection_source`：algorithm/user_pinned/user_replaced；
- `user_feedback`。

### 3.6 ReadingSession

- `paper_id`；
- `started_at` / `ended_at`；
- `last_page`；
- `visited_sections`；
- `active_seconds`（仅本地时长统计）；
- `mode`；
- `completion_state`；
- `topic_context_id`。

### 3.7 EvidenceAnchor

```json
{
  "id": "uuid",
  "paper_version_id": "uuid",
  "page_index": 4,
  "bbox_norm": [0.11, 0.28, 0.87, 0.36],
  "selected_text": "...",
  "prefix": "...",
  "suffix": "...",
  "text_hash": "sha256:...",
  "section_path": ["3 Experiments", "3.2 Scaling"],
  "semantic_element_id": "p5-block-18",
  "anchor_type": "text",
  "relocation_status": "exact",
  "created_by": "user_selection"
}
```

`anchor_type`：text/figure/table/equation/page_region/reference。

### 3.8 Claim

关键字段：

- `claim_text`；
- `claim_type`；
- `epistemic_source`；
- `review_status`；
- `evidence_anchor_ids`；
- `assumptions[]`；
- `scope_conditions[]`；
- `limitations[]`；
- `confidence` 和 `confidence_basis[]`；
- `created_by` / `last_edited_by`；
- `model_run_id`；
- `supersedes_claim_id`；
- `version`。

状态：

```text
draft → accepted → edited → stale
   └→ rejected
accepted/edited → archived
```

`edited` 表示用户对 AI 草稿做过实质修改，也是 Verified 状态。`stale` 表示 PDF/解析/依赖证据变化，需要复核。

### 3.9 NoteBlock

类型：

- summary；
- method；
- limitation；
- question；
- user_insight；
- action_item；
- reproduction；
- definition；
- reading_log。

NoteBlock 可无事实性 Anchor，例如用户问题；但 UI 必须显示“无原文证据”。

### 3.10 Proposition / ClaimRelationship

`Proposition` 是跨论文比较的规范化命题。Claim 通过 `stance` 关联：support/counter/qualify/incomparable/unclear。

`ClaimRelationship` 还支持：

- `depends_on`；
- `replicates`；
- `extends`；
- `uses_different_definition`；
- `uses_incomparable_setup`；
- `supersedes`。

关系本身也必须保存 evidence、创建者、置信度和审阅状态。

### 3.11 ModelProfile / ModelRun

`ModelProfile` 不保存明文密钥，只保存 `credential_ref`。

`ModelRun`：

- task type；
- provider/profile/model；
- prompt_template_id/version；
- input_manifest；
- input/output hash；
- token usage/cost；
- start/end/latency；
- finish reason；
- validation result；
- retained raw response（按策略）；
- error。

### 3.12 SyncRecord

```json
{
  "entity_type": "paper_note",
  "entity_id": "uuid",
  "target": "zotero",
  "external_id": "ABCD1234",
  "local_version": 12,
  "remote_version": 38,
  "last_synced_hash": "...",
  "state": "synced",
  "last_synced_at": "..."
}
```

状态：not_configured/pending/syncing/synced/conflict/error/paused。

## 4. 数据库建议表

```text
workspace, app_setting, migration
paper, paper_identifier, paper_author, author, venue
paper_version, attachment, metadata_assertion, paper_relation
citation_edge, external_record
collection_ref, tag_ref
 topic, reading_pack, reading_pack_item, recommendation_feature
reading_session, reading_event
parse_document, parse_element, evidence_anchor
claim, claim_anchor, note_block, note_anchor
proposition, proposition_claim, claim_relationship
model_profile, model_run, prompt_template
job, job_log, outbox_event
sync_record, sync_conflict
audit_event
```

大文本和解析 JSON 可放压缩 blob 或内容寻址文件，数据库保存 hash/path，避免单库膨胀。

## 5. 版本与事件规则

### 5.1 乐观并发

所有可编辑对象有 `version`。更新命令必须携带 `expected_version`；不一致返回 `CONFLICT_VERSION`，UI 展示差异。

### 5.2 审计事件

重要动作写 append-only audit：

- AI draft created；
- user accepted/edited/rejected；
- anchor relocated；
- paper version changed；
- Zotero/Git write；
- destructive delete/export；
- provider/profile changed。

### 5.3 Schema migration

- 每个对象含 `schema_version`；
- SQLite migration 不得依赖在线服务；
- Git JSON/Markdown renderer 支持至少前两个大版本读取；
- 降级前自动备份；
- 不可逆迁移必须明确提示。

## 6. 内部命令 API

UI 通过 typed IPC 调用 Application 层。以下为概念接口，不等同于公开网络 API。

### Workspace

```ts
initializeWorkspace(input): Workspace
getWorkspaceStatus(): WorkspaceStatus
exportWorkspace(options): JobRef
restoreWorkspace(path, strategy): JobRef
```

### Discovery

```ts
suggestTopics(context): TopicSuggestion[]
resolveTopicIntent(input): TopicIntent
createReadingPack(input): JobRef
getReadingPack(packId): ReadingPackView
replacePackItem(packId, itemId, constraints): JobRef
submitRecommendationFeedback(input): void
```

### Catalog / PDF

```ts
resolvePaper(input): PaperResolution
resolvePdf(paperId, policy): JobRef
importLocalPdf(path, metadataHint): JobRef
openPaper(paperId, versionId?): ReaderDocument
attachToZotero(paperId, options): JobRef
```

### Reader / Anchor

```ts
startReadingSession(input): ReadingSession
createAnchor(selection): EvidenceAnchor
relocateAnchor(anchorId, targetVersionId): RelocationResult
searchWithinPaper(paperId, query): SearchHit[]
updateReadingPosition(sessionId, position): void
```

高频位置更新应节流并批量持久化。

### Notes

```ts
generatePreReadBrief(paperId, topicId): JobRef
analyzeSelection(anchorIds, mode): JobRef
listReviewQueue(scope): ReviewItem[]
acceptDraft(id, expectedVersion): VerifiedObject
editDraft(id, patch, expectedVersion): VerifiedObject
rejectDraft(id, reason): void
createUserNote(input): NoteBlock
synthesizeTopic(topicId, options): JobRef
```

### Sync

```ts
probeZotero(): ZoteroCapabilityReport
requestZoteroWriteAuthorization(): AuthorizationResult
configureGitRepository(path, options): GitRepoStatus
previewSync(target, scope): SyncPlan
executeSync(planId): JobRef
resolveSyncConflict(conflictId, resolution): JobRef
```

### Models

```ts
saveModelProfile(input): ModelProfile
setCredential(profileId, secret): void
getCredential(profileId): never       // 明文不可回传 UI
probeModel(profileId): CapabilityReport
estimateTaskCost(task): CostEstimate
```

## 7. 领域事件

```text
PaperResolved
PdfAvailable
PdfParsed
AnchorCreated
AnchorOrphaned
DraftClaimCreated
ClaimVerified
ClaimRejected
PaperReadingCompleted
ReadingPackGenerated
ReadingPackEdited
TopicSynthesisVerified
ZoteroItemLinked
GitNoteCommitted
SyncConflictDetected
```

事件用于刷新 UI、触发 Outbox 和构建本地时间线，但不能把 UI 状态当作领域事实。

## 8. 错误模型

统一错误：

```json
{
  "code": "ZOTERO_NOT_RUNNING",
  "message": "Zotero 未运行，任务已进入等待队列。",
  "retryable": true,
  "action": "OPEN_ZOTERO",
  "details_ref": "job-log://...",
  "correlation_id": "uuid"
}
```

错误码分区：

- `WORKSPACE_*`；
- `PAPER_*`；
- `PDF_*`；
- `PARSE_*`；
- `MODEL_*`；
- `ZOTERO_*`；
- `GIT_*`；
- `SYNC_*`；
- `SECURITY_*`。

用户消息应可行动；开发细节留在诊断包，密钥和论文正文不得进入普通日志。

## 9. JSON Schema

- `schemas/note.schema.json`：Claim、Anchor、审阅与 provenance；
- `schemas/topic-pack.schema.json`：主题意图、阅读包与角色解释；
- `schemas/model-profile.schema.json`：Provider 能力与任务路由。

模型输出先做 JSON Schema 校验，再做领域校验：

- Anchor 是否存在；
- 引文是否与 Anchor 文本一致；
- 枚举是否合法；
- Claim 是否混合多个命题；
- `reported_result` 是否至少绑定表/图/实验文本；
- Draft 不得直接写为 Verified。

## 10. Git 渲染契约

领域对象 → renderer → Markdown/JSON。渲染器：

- 使用稳定排序；
- 不写运行时临时字段；
- 时间统一 ISO 8601；
- 保留用户手写区块；
- PaperWeave 管理区块带 marker；
- 输入 hash 相同则不产生文件变更；
- renderer 版本进入 `.paperweave/config.json`。

建议管理区块：

```markdown
<!-- paperweave:begin verified-claims -->
... generated deterministic content ...
<!-- paperweave:end verified-claims -->

## My interpretation
<!-- paperweave:user-content -->
用户自由编辑内容
```

## 11. 数据保留与删除

- 用户可分别删除：模型原始响应、解析缓存、向量索引、云同步副本；
- 删除 Paper 时默认不删除 Zotero Item/PDF/Git 文件，只解除关联；
- 跨系统删除必须展示影响清单；
- 工作区销毁前支持导出；
- 云端账户删除应包括可验证的异步删除状态，但本地数据不被远程清除，除非用户明确操作。
