use std::fs;
use std::io::Read;

use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::State;

use crate::error::AppError;
use crate::storage::{self, AppState};

const MAX_PDF_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    pub schema_version: u32,
    pub papers: Vec<Value>,
    pub anchors: Vec<Value>,
    pub evidence_links: Vec<Value>,
    pub drafts: Vec<Value>,
    pub review_actions: Vec<Value>,
    pub verified_claims: Vec<Value>,
    pub user_notes: Vec<Value>,
    pub judgments: Vec<Value>,
    pub settings: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewDraftInput {
    pub action: Value,
    pub verified_claim: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftBundleInput {
    pub draft: Value,
    pub evidence_links: Vec<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePaperMetadataInput {
    pub paper_id: String,
    pub title: String,
    pub authors: Vec<String>,
    pub year: Option<i32>,
}

fn required_string<'a>(value: &'a Value, key: &str) -> Result<&'a str, AppError> {
    value
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| AppError::policy("SCHEMA_REQUIRED", format!("缺少字段 {key}")))
}

fn is_sha256(value: &str) -> bool {
    let normalized = value.strip_prefix("sha256:").unwrap_or(value);
    normalized.len() == 64 && normalized.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn validate_anchor_value(anchor: &Value) -> Result<(), AppError> {
    required_string(anchor, "id")?;
    required_string(anchor, "paperVersionId")?;
    let pdf_sha256 = required_string(anchor, "pdfSha256")?;
    let text_hash = required_string(anchor, "textHash")?;
    if !is_sha256(pdf_sha256) || !is_sha256(text_hash) {
        return Err(AppError::policy(
            "ANCHOR_HASH_INVALID",
            "Anchor 的 PDF 与文本指纹必须是 SHA-256",
        ));
    }
    if anchor
        .get("pageIndex")
        .and_then(Value::as_i64)
        .unwrap_or(-1)
        < 0
    {
        return Err(AppError::policy(
            "ANCHOR_PAGE_INVALID",
            "pageIndex 必须大于等于 0",
        ));
    }
    let bbox = anchor
        .get("bboxNorm")
        .and_then(Value::as_array)
        .filter(|values| values.len() == 4)
        .ok_or_else(|| AppError::policy("ANCHOR_BBOX_INVALID", "bboxNorm 必须包含四个坐标"))?;
    let coordinates: Option<Vec<f64>> = bbox.iter().map(Value::as_f64).collect();
    let coordinates = coordinates
        .ok_or_else(|| AppError::policy("ANCHOR_BBOX_INVALID", "bboxNorm 坐标必须是有限数字"))?;
    if coordinates
        .iter()
        .any(|value| !value.is_finite() || !(0.0..=1.0).contains(value))
        || coordinates[0] >= coordinates[2]
        || coordinates[1] >= coordinates[3]
    {
        return Err(AppError::policy(
            "ANCHOR_BBOX_INVALID",
            "bboxNorm 必须是非空的归一化矩形",
        ));
    }
    if anchor.get("anchorType").and_then(Value::as_str) == Some("text") {
        required_string(anchor, "selectedText")?;
    }
    Ok(())
}

fn snapshot(state: &AppState) -> Result<WorkspaceSnapshot, AppError> {
    let connection = storage::connect(state)?;
    let settings = storage::list_json(&connection, "settings")?
        .into_iter()
        .next()
        .unwrap_or_else(|| json!({"schemaVersion": 1, "cloudMetadataEnabled": false}));
    Ok(WorkspaceSnapshot {
        schema_version: 2,
        papers: storage::list_json(&connection, "paper")?,
        anchors: storage::list_json(&connection, "anchor")?,
        evidence_links: storage::list_json(&connection, "evidence_link")?,
        drafts: storage::list_json(&connection, "draft")?,
        review_actions: storage::list_json(&connection, "review_action")?,
        verified_claims: storage::list_json(&connection, "verified_claim")?,
        user_notes: storage::list_json(&connection, "user_note")?,
        judgments: storage::list_json(&connection, "judgment")?,
        settings,
    })
}

#[tauri::command]
pub fn workspace_initialize(state: State<'_, AppState>) -> Result<WorkspaceSnapshot, AppError> {
    storage::initialize(&state.db_path)?;
    snapshot(&state)
}

#[tauri::command]
pub fn workspace_snapshot(state: State<'_, AppState>) -> Result<WorkspaceSnapshot, AppError> {
    snapshot(&state)
}

#[tauri::command(rename_all = "camelCase")]
pub fn import_local_pdf(
    state: State<'_, AppState>,
    path: String,
    metadata: Option<Value>,
) -> Result<Value, AppError> {
    let canonical = fs::canonicalize(&path)?;
    if !canonical.is_file() {
        return Err(AppError::policy("PDF_NOT_FILE", "选择的路径不是普通文件"));
    }
    let file_metadata = fs::metadata(&canonical)?;
    if file_metadata.len() == 0 || file_metadata.len() > MAX_PDF_BYTES {
        return Err(AppError::policy(
            "PDF_SIZE_POLICY",
            "PDF 为空或超过 512 MiB 本地导入上限",
        ));
    }
    let mut file = fs::File::open(&canonical)?;
    let mut magic = [0_u8; 5];
    file.read_exact(&mut magic)?;
    if &magic != b"%PDF-" {
        return Err(AppError::policy(
            "PDF_MAGIC_INVALID",
            "文件扩展名或内容不是有效 PDF",
        ));
    }
    let bytes = fs::read(&canonical)?;
    let sha256 = hex::encode(Sha256::digest(&bytes));
    let connection = storage::connect(&state)?;
    let existing: Option<String> = connection
        .query_row(
            "SELECT paper_id FROM pdf_asset WHERE sha256 = ?1",
            [&sha256],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(paper_id) = existing {
        return storage::get_json(&connection, "paper", &paper_id)?
            .ok_or_else(|| AppError::policy("PAPER_RECORD_MISSING", "PDF 已入库但论文记录缺失"));
    }

    fs::create_dir_all(&state.vault_dir)?;
    let vault_path = state.vault_dir.join(format!("{sha256}.pdf"));
    let temporary_path = state.vault_dir.join(format!(".{sha256}.partial"));
    fs::write(&temporary_path, &bytes)?;
    fs::rename(&temporary_path, &vault_path)?;

    let paper_id = metadata
        .as_ref()
        .and_then(|value| value.get("paperId"))
        .and_then(Value::as_str)
        .map(str::to_owned)
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let version_id = uuid::Uuid::new_v4().to_string();
    let fallback_title = canonical
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Untitled paper");
    let title = metadata
        .as_ref()
        .and_then(|value| value.get("title"))
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(fallback_title);
    let authors = metadata
        .as_ref()
        .and_then(|value| value.get("authors"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let year = metadata
        .as_ref()
        .and_then(|value| value.get("year"))
        .cloned()
        .unwrap_or(Value::Null);
    let source_url = metadata
        .as_ref()
        .and_then(|value| value.get("sourceUrl"))
        .cloned()
        .unwrap_or(Value::Null);
    let now = chrono::Utc::now().to_rfc3339();
    let paper = json!({
        "id": paper_id,
        "currentVersionId": version_id,
        "title": title,
        "authors": authors,
        "year": year,
        "abstract": null,
        "identifiers": [],
        "versions": [{
            "id": version_id,
            "label": "unknown",
            "sourceUrl": source_url,
            "license": null,
            "pdfSha256": format!("sha256:{sha256}"),
            "isVersionOf": null
        }],
        "zoteroItemKey": null,
        "createdAt": now,
        "updatedAt": now
    });

    let transaction = connection.unchecked_transaction()?;
    storage::insert_json(&transaction, "paper", &paper_id, &paper)?;
    transaction.execute(
        r#"INSERT INTO pdf_asset(paper_id, sha256, vault_path, source_path, byte_length, imported_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)"#,
        params![
            paper_id,
            sha256,
            vault_path.to_string_lossy(),
            canonical.to_string_lossy(),
            file_metadata.len(),
            chrono::Utc::now().to_rfc3339()
        ],
    )?;
    storage::audit(
        &transaction,
        "PdfImported",
        "paper",
        &paper_id,
        &json!({"sha256": sha256, "byteLength": file_metadata.len()}),
    )?;
    transaction.commit()?;
    Ok(paper)
}

#[tauri::command(rename_all = "camelCase")]
pub fn load_pdf_bytes(state: State<'_, AppState>, paper_id: String) -> Result<Vec<u8>, AppError> {
    let connection = storage::connect(&state)?;
    let vault_path: String = connection
        .query_row(
            "SELECT vault_path FROM pdf_asset WHERE paper_id = ?1",
            [&paper_id],
            |row| row.get(0),
        )
        .map_err(|_| AppError::policy("PDF_NOT_IMPORTED", "该论文没有已入库 PDF"))?;
    let canonical_vault = fs::canonicalize(&state.vault_dir)?;
    let canonical_file = fs::canonicalize(&vault_path)?;
    if !canonical_file.starts_with(&canonical_vault) {
        return Err(AppError::policy(
            "SECURITY_PATH_ESCAPE",
            "PDF 路径不在内容寻址仓库内",
        ));
    }
    Ok(fs::read(canonical_file)?)
}

#[tauri::command(rename_all = "camelCase")]
pub fn update_paper_metadata(
    state: State<'_, AppState>,
    input: UpdatePaperMetadataInput,
) -> Result<Value, AppError> {
    update_paper_metadata_inner(&state, input)
}

fn update_paper_metadata_inner(
    state: &AppState,
    input: UpdatePaperMetadataInput,
) -> Result<Value, AppError> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err(AppError::policy("PAPER_TITLE_REQUIRED", "论文标题不能为空"));
    }
    if input.authors.iter().any(|author| author.trim().is_empty()) {
        return Err(AppError::policy(
            "PAPER_AUTHOR_INVALID",
            "作者列表不能包含空名称",
        ));
    }
    if input
        .year
        .is_some_and(|year| !(1000..=9999).contains(&year))
    {
        return Err(AppError::policy(
            "PAPER_YEAR_INVALID",
            "论文年份必须是四位整数",
        ));
    }

    let mut connection = storage::connect(state)?;
    let mut paper = storage::get_json(&connection, "paper", &input.paper_id)?.ok_or_else(|| {
        AppError::policy(
            "PAPER_NOT_FOUND",
            format!("本地工作区中不存在论文 {}", input.paper_id),
        )
    })?;
    let object = paper
        .as_object_mut()
        .ok_or_else(|| AppError::policy("PAPER_RECORD_INVALID", "论文记录格式无效"))?;
    object.insert("title".to_owned(), Value::String(title.to_owned()));
    object.insert(
        "authors".to_owned(),
        Value::Array(
            input
                .authors
                .iter()
                .map(|author| Value::String(author.trim().to_owned()))
                .collect(),
        ),
    );
    object.insert("year".to_owned(), json!(input.year));
    object.insert(
        "updatedAt".to_owned(),
        Value::String(chrono::Utc::now().to_rfc3339()),
    );

    let transaction = connection.transaction()?;
    storage::upsert_json(&transaction, "paper", &input.paper_id, &paper)?;
    storage::audit(
        &transaction,
        "PaperMetadataChanged",
        "paper",
        &input.paper_id,
        &json!({"fields": ["title", "authors", "year"]}),
    )?;
    transaction.commit()?;
    Ok(paper)
}

#[tauri::command(rename_all = "camelCase")]
pub fn save_anchor(state: State<'_, AppState>, anchor: Value) -> Result<Value, AppError> {
    validate_anchor_value(&anchor)?;
    let id = required_string(&anchor, "id")?;
    let connection = storage::connect(&state)?;
    storage::insert_json(&connection, "anchor", id, &anchor)?;
    storage::audit(&connection, "AnchorCreated", "anchor", id, &json!({}))?;
    Ok(anchor)
}

#[tauri::command(rename_all = "camelCase")]
pub fn save_draft_bundle(
    state: State<'_, AppState>,
    bundle: DraftBundleInput,
) -> Result<Value, AppError> {
    let draft = &bundle.draft;
    let id = required_string(draft, "id")?;
    required_string(draft, "paperId")?;
    required_string(draft, "paperVersionId")?;
    required_string(draft, "claimText")?;
    if draft.get("reviewStatus").and_then(Value::as_str) != Some("draft") {
        return Err(AppError::policy(
            "DRAFT_TRUST_BOUNDARY",
            "待审阅 Claim 必须以 draft 状态保存",
        ));
    }
    let creator = required_string(draft, "createdBy")?;
    if !matches!(creator, "ai" | "user") {
        return Err(AppError::policy(
            "DRAFT_CREATOR_INVALID",
            "Draft 创建者无效",
        ));
    }
    if creator == "ai" && draft.get("modelRunId").and_then(Value::as_str).is_none() {
        return Err(AppError::policy(
            "AI_MODEL_RUN_REQUIRED",
            "AI Draft 必须记录 modelRunId",
        ));
    }
    let epistemic = required_string(draft, "epistemicSource")?;
    let evidence_link_ids = draft
        .get("evidenceLinkIds")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if matches!(
        epistemic,
        "direct_quote" | "author_claim" | "reported_result"
    ) && evidence_link_ids.is_empty()
    {
        return Err(AppError::policy(
            "CLAIM_EVIDENCE_REQUIRED",
            "事实性 Draft 必须至少绑定一个 Evidence Anchor",
        ));
    }
    if epistemic == "ai_inference"
        && draft.get("needsHumanAttention").and_then(Value::as_bool) != Some(true)
    {
        return Err(AppError::policy(
            "AI_INFERENCE_REVIEW_REQUIRED",
            "AI inference 必须明确需要人工审阅",
        ));
    }
    if bundle.evidence_links.is_empty() {
        return Err(AppError::policy(
            "EVIDENCE_LINK_REQUIRED",
            "Draft 必须与 EvidenceLink 原子保存",
        ));
    }
    let mut connection = storage::connect(&state)?;
    let requested_ids: Vec<&str> = evidence_link_ids.iter().filter_map(Value::as_str).collect();
    if requested_ids.len() != evidence_link_ids.len()
        || requested_ids.len() != bundle.evidence_links.len()
    {
        return Err(AppError::policy(
            "EVIDENCE_LINK_SET_MISMATCH",
            "Draft 的 evidenceLinkIds 与 EvidenceLink 集合不一致",
        ));
    }
    for (ordinal, link) in bundle.evidence_links.iter().enumerate() {
        let link_id = required_string(link, "id")?;
        if !requested_ids.contains(&link_id)
            || required_string(link, "claimId")? != id
            || link.get("ordinal").and_then(Value::as_u64) != Some(ordinal as u64)
        {
            return Err(AppError::policy(
                "EVIDENCE_LINK_INVALID",
                "EvidenceLink 必须属于 Draft，按 ordinal 连续排列并被 Draft 引用",
            ));
        }
        let relation = required_string(link, "relation")?;
        if !matches!(relation, "support" | "counter" | "qualify" | "context") {
            return Err(AppError::policy(
                "EVIDENCE_RELATION_INVALID",
                "EvidenceLink relation 无效",
            ));
        }
        let anchor_id = required_string(link, "anchorId")?;
        if storage::get_json(&connection, "anchor", anchor_id)?.is_none() {
            return Err(AppError::policy(
                "ANCHOR_NOT_FOUND",
                format!("不存在 Anchor {anchor_id}"),
            ));
        }
    }
    let transaction = connection.transaction()?;
    for link in &bundle.evidence_links {
        let link_id = required_string(link, "id")?;
        storage::insert_json(&transaction, "evidence_link", link_id, link)?;
    }
    storage::insert_json(&transaction, "draft", id, draft)?;
    storage::audit(
        &transaction,
        "DraftClaimCreated",
        "draft",
        id,
        &json!({"evidenceLinkCount": bundle.evidence_links.len(), "createdBy": creator}),
    )?;
    transaction.commit()?;
    Ok(json!({"draft": draft, "evidenceLinks": bundle.evidence_links}))
}

#[tauri::command(rename_all = "camelCase")]
pub fn review_draft(
    state: State<'_, AppState>,
    input: ReviewDraftInput,
) -> Result<Value, AppError> {
    review_draft_inner(&state, input)
}

fn review_draft_inner(state: &AppState, input: ReviewDraftInput) -> Result<Value, AppError> {
    let action_id = required_string(&input.action, "id")?;
    let draft_id = required_string(&input.action, "claimId")?;
    let from_status = required_string(&input.action, "fromStatus")?;
    let to_status = required_string(&input.action, "toStatus")?;
    let action_kind = required_string(&input.action, "action")?;
    let expected_to_status = match action_kind {
        "accept" => "accepted",
        "edit_and_accept" => "edited",
        "reject" => "rejected",
        _ => "",
    };
    if from_status != "draft" || to_status != expected_to_status {
        return Err(AppError::policy(
            "REVIEW_ACTION_INVALID",
            "审阅动作必须从 draft 转移到 accepted、edited 或 rejected",
        ));
    }
    let mut connection = storage::connect(state)?;
    let draft = storage::get_json(&connection, "draft", draft_id)?
        .ok_or_else(|| AppError::policy("DRAFT_NOT_FOUND", "待审阅 Draft 不存在"))?;
    if storage::list_json(&connection, "review_action")?
        .iter()
        .any(|action| action.get("claimId").and_then(Value::as_str) == Some(draft_id))
    {
        return Err(AppError::policy(
            "DRAFT_ALREADY_REVIEWED",
            "该 Draft 已有 ReviewAction，不能重复审阅",
        ));
    }
    let transaction = connection.transaction()?;
    storage::insert_json(&transaction, "review_action", action_id, &input.action)?;

    if matches!(to_status, "accepted" | "edited") {
        let verified = input.verified_claim.as_ref().ok_or_else(|| {
            AppError::policy(
                "VERIFIED_OBJECT_REQUIRED",
                "接受或编辑审阅必须产生独立 Verified Claim",
            )
        })?;
        if required_string(verified, "id")? != draft_id
            || required_string(verified, "paperId")? != required_string(&draft, "paperId")?
            || required_string(verified, "paperVersionId")?
                != required_string(&draft, "paperVersionId")?
            || required_string(verified, "reviewStatus")? != to_status
            || verified.get("evidenceLinkIds") != draft.get("evidenceLinkIds")
        {
            return Err(AppError::policy(
                "VERIFIED_OBJECT_MISMATCH",
                "Verified Claim 必须保留 Draft 身份、论文版本与证据引用",
            ));
        }
        storage::insert_json(&transaction, "verified_claim", draft_id, verified)?;
        storage::audit(
            &transaction,
            "ClaimVerified",
            "verified_claim",
            draft_id,
            &json!({"reviewActionId": action_id}),
        )?;
    } else {
        if input.verified_claim.is_some() {
            return Err(AppError::policy(
                "REJECTED_CLAIM_CANNOT_VERIFY",
                "Rejected 审阅不能附带 Verified Claim",
            ));
        }
        storage::audit(
            &transaction,
            "ClaimRejected",
            "draft",
            draft_id,
            &json!({"reviewActionId": action_id}),
        )?;
    }
    transaction.commit()?;
    Ok(input.action)
}

#[tauri::command(rename_all = "camelCase")]
pub fn save_judgment(state: State<'_, AppState>, judgment: Value) -> Result<Value, AppError> {
    let id = required_string(&judgment, "id")?;
    let paper_id = required_string(&judgment, "paperId")?;
    let paper_version_id = required_string(&judgment, "paperVersionId")?;
    if judgment.get("createdBy").and_then(Value::as_str) != Some("user") {
        return Err(AppError::policy(
            "JUDGMENT_USER_ONLY",
            "“我的判断”只能由用户创建",
        ));
    }
    let sections = judgment
        .get("sections")
        .and_then(Value::as_object)
        .ok_or_else(|| AppError::policy("JUDGMENT_SECTIONS_REQUIRED", "缺少结构化判断内容"))?;
    let keys = [
        "judgment",
        "reasoning",
        "supportingEvidence",
        "counterEvidence",
        "uncertainties",
        "nextValidation",
    ];
    if keys.iter().any(|key| !sections.contains_key(*key)) {
        return Err(AppError::policy(
            "JUDGMENT_SECTIONS_REQUIRED",
            "“我的判断”必须包含六个固定部分",
        ));
    }

    let connection = storage::connect(&state)?;
    let mut referenced_claim_ids = Vec::new();
    for key in keys {
        let section = sections
            .get(key)
            .and_then(Value::as_object)
            .ok_or_else(|| AppError::policy("JUDGMENT_SECTION_INVALID", "判断分区格式无效"))?;
        let claim_ids = section
            .get("verifiedClaimIds")
            .and_then(Value::as_array)
            .ok_or_else(|| {
                AppError::policy(
                    "JUDGMENT_SECTION_INVALID",
                    "判断分区缺少 Verified Claim 引用",
                )
            })?;
        for claim_id in claim_ids.iter().filter_map(Value::as_str) {
            let verified =
                storage::get_json(&connection, "verified_claim", claim_id)?.ok_or_else(|| {
                    AppError::policy(
                        "JUDGMENT_VERIFIED_CLAIM_REQUIRED",
                        format!("Judgment 引用了不存在的 Verified Claim {claim_id}"),
                    )
                })?;
            if required_string(&verified, "paperId")? != paper_id
                || required_string(&verified, "paperVersionId")? != paper_version_id
            {
                return Err(AppError::policy(
                    "JUDGMENT_CROSS_PAPER_REFERENCE",
                    "Judgment 不能引用其他论文版本的 Verified Claim",
                ));
            }
            referenced_claim_ids.push(claim_id.to_owned());
        }
    }

    let status = required_string(&judgment, "status")?;
    if status == "complete" {
        let core_text = sections
            .get("judgment")
            .and_then(|section| section.get("text"))
            .and_then(Value::as_str)
            .unwrap_or("");
        if core_text.trim().is_empty()
            || referenced_claim_ids.is_empty()
            || judgment
                .get("completedAt")
                .and_then(Value::as_str)
                .is_none()
        {
            return Err(AppError::policy(
                "JUDGMENT_INCOMPLETE",
                "完成判断前必须写明核心判断、引用至少一条 Verified Claim 并记录完成时间",
            ));
        }
    } else if status != "draft" {
        return Err(AppError::policy(
            "JUDGMENT_STATUS_INVALID",
            "Judgment 状态只能是 draft 或 complete",
        ));
    } else if !judgment
        .get("completedAt")
        .unwrap_or(&Value::Null)
        .is_null()
    {
        return Err(AppError::policy(
            "JUDGMENT_COMPLETION_INVALID",
            "判断草稿不能带有完成时间",
        ));
    }

    storage::upsert_json(&connection, "judgment", id, &judgment)?;
    storage::audit(
        &connection,
        if status == "complete" {
            "JudgmentCompleted"
        } else {
            "JudgmentDraftSaved"
        },
        "judgment",
        id,
        &json!({"verifiedClaimCount": referenced_claim_ids.len()}),
    )?;
    Ok(judgment)
}

#[tauri::command]
pub fn open_ai_credential_status() -> Value {
    json!({"configured": false, "credentialRef": null})
}

#[tauri::command(rename_all = "camelCase")]
pub fn save_open_ai_api_key(_api_key: String) -> Result<Value, AppError> {
    Err(AppError::policy(
        "OPENAI_ADAPTER_DEFERRED",
        "当前构建尚未接入 OpenAI Keychain 适配器；不会保存或回显密钥",
    ))
}

#[tauri::command]
pub fn delete_open_ai_api_key() -> Value {
    json!({"configured": false, "credentialRef": null})
}

#[tauri::command(rename_all = "camelCase")]
pub fn generate_drafts(_input: Value) -> Result<Value, AppError> {
    Err(AppError::policy(
        "OPENAI_ADAPTER_DEFERRED",
        "当前构建未配置 OpenAI Draft 适配器；Anchor 已保留，可继续创建人工 Draft",
    ))
}

fn contains_secret(value: &Value) -> bool {
    match value {
        Value::Object(map) => map.iter().any(|(key, value)| {
            let normalized = key.to_ascii_lowercase();
            let sensitive = [
                "apikey",
                "api_key",
                "password",
                "secret",
                "token",
                "credential",
            ]
            .iter()
            .any(|needle| normalized.contains(needle));
            (sensitive && !normalized.ends_with("ref")) || contains_secret(value)
        }),
        Value::Array(values) => values.iter().any(contains_secret),
        _ => false,
    }
}

#[tauri::command(rename_all = "camelCase")]
pub fn save_settings(state: State<'_, AppState>, settings: Value) -> Result<Value, AppError> {
    if contains_secret(&settings) {
        return Err(AppError::policy(
            "SECURITY_SECRET_IN_SETTINGS",
            "设置对象不能包含密钥、令牌或密码明文；请使用系统 Keychain 引用",
        ));
    }
    let connection = storage::connect(&state)?;
    storage::upsert_json(&connection, "settings", "workspace", &settings)?;
    storage::audit(
        &connection,
        "WorkspaceSettingsChanged",
        "settings",
        "workspace",
        &json!({"redacted": true}),
    )?;
    Ok(settings)
}

trait OptionalRow<T> {
    fn optional(self) -> Result<Option<T>, rusqlite::Error>;
}

impl<T> OptionalRow<T> for Result<T, rusqlite::Error> {
    fn optional(self) -> Result<Option<T>, rusqlite::Error> {
        match self {
            Ok(value) => Ok(Some(value)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(error) => Err(error),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{
        contains_secret, required_string, review_draft_inner, update_paper_metadata_inner,
        validate_anchor_value, ReviewDraftInput, UpdatePaperMetadataInput,
    };
    use crate::storage::{self, AppState};
    use serde_json::json;

    fn test_state() -> AppState {
        let root =
            std::env::temp_dir().join(format!("paperweave-review-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let state = AppState {
            db_path: root.join("workspace.sqlite3"),
            vault_dir: root.join("vault"),
        };
        storage::initialize(&state.db_path).unwrap();
        state
    }

    fn remove_test_state(state: &AppState) {
        let root = state.db_path.parent().unwrap();
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn settings_reject_plaintext_secrets_but_allow_references() {
        assert!(contains_secret(&json!({"apiKey": "sk-secret"})));
        assert!(contains_secret(
            &json!({"nested": {"accessToken": "secret"}})
        ));
        assert!(!contains_secret(&json!({
            "credentialRef": "keychain://paperweave/profile-id",
            "cloudMetadataEnabled": false
        })));
    }

    #[test]
    fn required_string_rejects_blank_values() {
        assert!(required_string(&json!({"id": "  "}), "id").is_err());
        assert_eq!(
            required_string(&json!({"id": "anchor-1"}), "id").unwrap(),
            "anchor-1"
        );
    }

    #[test]
    fn anchor_validation_rejects_corrupt_coordinates_and_hashes() {
        let valid = json!({
            "id": "anchor-1",
            "paperVersionId": "version-1",
            "pageIndex": 0,
            "bboxNorm": [0.1, 0.2, 0.7, 0.3],
            "selectedText": "Evidence text",
            "textHash": "a".repeat(64),
            "pdfSha256": format!("sha256:{}", "b".repeat(64)),
            "anchorType": "text"
        });
        assert!(validate_anchor_value(&valid).is_ok());

        let mut corrupt = valid;
        corrupt["bboxNorm"] = json!([0.8, 0.2, 0.1, 0.3]);
        corrupt["textHash"] = json!("not-a-hash");
        assert!(validate_anchor_value(&corrupt).is_err());
    }

    #[test]
    fn paper_metadata_update_preserves_the_existing_record() {
        let state = test_state();
        let connection = storage::connect(&state).unwrap();
        storage::insert_json(
            &connection,
            "paper",
            "paper-1",
            &json!({
                "id": "paper-1",
                "currentVersionId": "version-1",
                "title": "Imported file name",
                "authors": [],
                "year": null,
                "versions": [{"id": "version-1"}],
                "updatedAt": "2026-08-05T00:00:00.000Z"
            }),
        )
        .unwrap();
        drop(connection);

        let updated = update_paper_metadata_inner(
            &state,
            UpdatePaperMetadataInput {
                paper_id: "paper-1".to_owned(),
                title: "  Evidence-led Reading  ".to_owned(),
                authors: vec!["Ada Lovelace".to_owned(), "Alan Turing".to_owned()],
                year: Some(2025),
            },
        )
        .unwrap();

        assert_eq!(updated["title"], "Evidence-led Reading");
        assert_eq!(updated["authors"], json!(["Ada Lovelace", "Alan Turing"]));
        assert_eq!(updated["year"], 2025);
        assert_eq!(updated["versions"], json!([{"id": "version-1"}]));
        remove_test_state(&state);
    }

    #[test]
    fn all_review_actions_persist_without_rewriting_the_draft() {
        for (kind, to_status, creates_verified) in [
            ("accept", "accepted", true),
            ("edit_and_accept", "edited", true),
            ("reject", "rejected", false),
        ] {
            let state = test_state();
            let draft = json!({
                "id": "draft-1",
                "paperId": "paper-1",
                "paperVersionId": "version-1",
                "claimText": "Original immutable Draft",
                "reviewStatus": "draft",
                "evidence": []
            });
            let connection = storage::connect(&state).unwrap();
            storage::insert_json(&connection, "draft", "draft-1", &draft).unwrap();
            drop(connection);

            let action = json!({
                "id": format!("action-{kind}"),
                "claimId": "draft-1",
                "fromStatus": "draft",
                "toStatus": to_status,
                "action": kind
            });
            let verified_claim = creates_verified.then(|| {
                json!({
                    "id": "draft-1",
                    "paperId": "paper-1",
                    "paperVersionId": "version-1",
                    "claimText": if kind == "edit_and_accept" { "Edited Verified Claim" } else { "Original immutable Draft" },
                    "reviewStatus": to_status,
                    "evidence": []
                })
            });
            review_draft_inner(
                &state,
                ReviewDraftInput {
                    action,
                    verified_claim,
                },
            )
            .unwrap();

            let connection = storage::connect(&state).unwrap();
            assert_eq!(
                storage::list_json(&connection, "review_action")
                    .unwrap()
                    .len(),
                1
            );
            assert_eq!(
                storage::list_json(&connection, "verified_claim")
                    .unwrap()
                    .len(),
                usize::from(creates_verified)
            );
            assert_eq!(
                storage::get_json(&connection, "draft", "draft-1")
                    .unwrap()
                    .unwrap()["claimText"],
                "Original immutable Draft"
            );
            drop(connection);
            remove_test_state(&state);
        }
    }

    #[test]
    fn duplicate_review_action_is_rejected() {
        let state = test_state();
        let connection = storage::connect(&state).unwrap();
        storage::insert_json(
            &connection,
            "draft",
            "draft-1",
            &json!({
                "id": "draft-1",
                "paperId": "paper-1",
                "paperVersionId": "version-1",
                "claimText": "Original immutable Draft",
                "reviewStatus": "draft",
                "evidence": []
            }),
        )
        .unwrap();
        drop(connection);

        let input = |id: &str| ReviewDraftInput {
            action: json!({
                "id": id,
                "claimId": "draft-1",
                "fromStatus": "draft",
                "toStatus": "rejected",
                "action": "reject"
            }),
            verified_claim: None,
        };
        assert!(review_draft_inner(
            &state,
            ReviewDraftInput {
                action: json!({
                    "id": "mismatched-action",
                    "claimId": "draft-1",
                    "fromStatus": "draft",
                    "toStatus": "edited",
                    "action": "accept"
                }),
                verified_claim: None,
            },
        )
        .is_err());
        review_draft_inner(&state, input("action-1")).unwrap();
        assert!(review_draft_inner(&state, input("action-2")).is_err());
        remove_test_state(&state);
    }
}
