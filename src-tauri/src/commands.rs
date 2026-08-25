use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Read;

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::State;

use crate::error::AppError;
use crate::openai::{self, CredentialStore};
use crate::storage::{self, AppState};

const MAX_PDF_BYTES: u64 = 512 * 1024 * 1024;
const MAX_OPENAI_DRAFTS: usize = 3;
const PAPER_MAP_PARSER_VERSION: &str = "paperweave-blocks-v1-pdfjs-5.6.205";
const MAX_PAPER_MAP_PAGES: u32 = 300;
const MAX_PAPER_MAP_BLOCKS: usize = 5_000;
const MAX_PAPER_MAP_TEXT_CHARS: usize = 200_000;
const MAX_PAPER_MAP_BLOCK_CHARS: usize = 8_000;
const LOCAL_CREDENTIAL_ENTITY_TYPE: &str = "local_credential";
const OPENAI_CREDENTIAL_ID: &str = "openai-compatible";

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
    pub paper_maps: Vec<Value>,
    pub settings: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewDraftInput {
    pub action: Value,
    pub verified_claim: Option<Value>,
}

#[derive(Debug, Deserialize, Serialize)]
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListOpenAiModelsInput {
    pub base_url: String,
    pub api_key: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateDraftsInput {
    pub paper_id: String,
    pub anchor_ids: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentBlockInput {
    pub id: String,
    pub page: u32,
    pub bbox: [f64; 4],
    pub kind: String,
    pub section_path: Vec<String>,
    pub text: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDocumentIndexInput {
    pub pdf_sha256: String,
    pub parser_version: String,
    pub page_count: u32,
    pub blocks: Vec<DocumentBlockInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratePaperMapInput {
    pub paper_id: String,
    pub paper_version_id: String,
    pub confirmed_full_text_upload: bool,
    pub document_index: LocalDocumentIndexInput,
}

struct LocalCredentialStore<'a> {
    state: &'a AppState,
}

impl<'a> LocalCredentialStore<'a> {
    fn new(state: &'a AppState) -> Self {
        Self { state }
    }
}

impl CredentialStore for LocalCredentialStore<'_> {
    fn load(&self) -> Result<Option<String>, AppError> {
        let connection = storage::connect(self.state)?;
        let Some(value) = storage::get_json(
            &connection,
            LOCAL_CREDENTIAL_ENTITY_TYPE,
            OPENAI_CREDENTIAL_ID,
        )?
        else {
            return Ok(None);
        };
        let api_key = value
            .get("apiKey")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| {
                AppError::policy(
                    "OPENAI_CREDENTIAL_INVALID",
                    "PaperWeave 本机保存的 API Key 无效，请在设置中重新保存",
                )
            })?;
        Ok(Some(api_key.trim().to_owned()))
    }

    fn save(&self, api_key: &str) -> Result<(), AppError> {
        let normalized = api_key.trim();
        if normalized.is_empty() {
            return Err(AppError::policy(
                "OPENAI_API_KEY_REQUIRED",
                "API Key 不能为空",
            ));
        }
        let connection = storage::connect(self.state)?;
        storage::upsert_json(
            &connection,
            LOCAL_CREDENTIAL_ENTITY_TYPE,
            OPENAI_CREDENTIAL_ID,
            &json!({"apiKey": normalized}),
        )
    }

    fn delete(&self) -> Result<(), AppError> {
        let connection = storage::connect(self.state)?;
        storage::delete_json(
            &connection,
            LOCAL_CREDENTIAL_ENTITY_TYPE,
            OPENAI_CREDENTIAL_ID,
        )
    }
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

fn validate_normalized_bbox(value: &Value, field: &str) -> Result<(), AppError> {
    let bbox = value
        .as_array()
        .filter(|values| values.len() == 4)
        .ok_or_else(|| {
            AppError::policy("ANCHOR_BBOX_INVALID", format!("{field} 必须包含四个坐标"))
        })?;
    let coordinates: Option<Vec<f64>> = bbox.iter().map(Value::as_f64).collect();
    let coordinates = coordinates.ok_or_else(|| {
        AppError::policy("ANCHOR_BBOX_INVALID", format!("{field} 坐标必须是有限数字"))
    })?;
    if coordinates
        .iter()
        .any(|coordinate| !coordinate.is_finite() || !(0.0..=1.0).contains(coordinate))
        || coordinates[0] >= coordinates[2]
        || coordinates[1] >= coordinates[3]
    {
        return Err(AppError::policy(
            "ANCHOR_BBOX_INVALID",
            format!("{field} 必须是非空的归一化矩形"),
        ));
    }
    Ok(())
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
    validate_normalized_bbox(anchor.get("bboxNorm").unwrap_or(&Value::Null), "bboxNorm")?;
    if anchor.get("createdBy").and_then(Value::as_str) == Some("user_selection")
        && anchor.get("rectsNorm").is_none()
    {
        return Err(AppError::policy(
            "ANCHOR_RECTS_REQUIRED",
            "手工文字选区必须包含逐行矩形，请重新选择原文",
        ));
    }
    if let Some(rects_value) = anchor.get("rectsNorm") {
        let rects = rects_value
            .as_array()
            .filter(|rects| !rects.is_empty())
            .ok_or_else(|| {
                AppError::policy(
                    "ANCHOR_RECTS_INVALID",
                    "rectsNorm 必须包含至少一个逐行选区矩形",
                )
            })?;
        for (index, rect) in rects.iter().enumerate() {
            validate_normalized_bbox(rect, &format!("rectsNorm[{index}]"))?;
        }
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
        schema_version: 3,
        papers: storage::list_json(&connection, "paper")?,
        anchors: storage::list_json(&connection, "anchor")?,
        evidence_links: storage::list_json(&connection, "evidence_link")?,
        drafts: storage::list_json(&connection, "draft")?,
        review_actions: storage::list_json(&connection, "review_action")?,
        verified_claims: storage::list_json(&connection, "verified_claim")?,
        user_notes: storage::list_json(&connection, "user_note")?,
        judgments: storage::list_json(&connection, "judgment")?,
        paper_maps: storage::list_json(&connection, "paper_map")?,
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
    save_draft_bundle_inner(&state, bundle)
}

fn save_draft_bundle_inner(state: &AppState, bundle: DraftBundleInput) -> Result<Value, AppError> {
    let mut saved = save_draft_bundles_inner(state, vec![bundle])?;
    Ok(saved.remove(0))
}

fn validate_draft_bundle(
    connection: &Connection,
    bundle: &DraftBundleInput,
) -> Result<(), AppError> {
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
        if storage::get_json(connection, "anchor", anchor_id)?.is_none() {
            return Err(AppError::policy(
                "ANCHOR_NOT_FOUND",
                format!("不存在 Anchor {anchor_id}"),
            ));
        }
    }
    Ok(())
}

fn insert_draft_bundle(
    connection: &Connection,
    bundle: &DraftBundleInput,
) -> Result<Value, AppError> {
    let draft = &bundle.draft;
    let id = required_string(draft, "id")?;
    let creator = required_string(draft, "createdBy")?;
    for link in &bundle.evidence_links {
        let link_id = required_string(link, "id")?;
        storage::insert_json(connection, "evidence_link", link_id, link)?;
    }
    storage::insert_json(connection, "draft", id, draft)?;
    storage::audit(
        connection,
        "DraftClaimCreated",
        "draft",
        id,
        &json!({"evidenceLinkCount": bundle.evidence_links.len(), "createdBy": creator}),
    )?;
    Ok(json!({"draft": draft, "evidenceLinks": bundle.evidence_links}))
}

fn save_draft_bundles_inner(
    state: &AppState,
    bundles: Vec<DraftBundleInput>,
) -> Result<Vec<Value>, AppError> {
    let mut connection = storage::connect(state)?;
    for bundle in &bundles {
        validate_draft_bundle(&connection, bundle)?;
    }

    let transaction = connection.transaction()?;
    let saved = bundles
        .iter()
        .map(|bundle| insert_draft_bundle(&transaction, bundle))
        .collect::<Result<Vec<_>, _>>()?;
    transaction.commit()?;
    Ok(saved)
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

fn credential_status_with(store: &dyn CredentialStore) -> Result<Value, AppError> {
    let configured = store.load()?.is_some();
    Ok(json!({
        "configured": configured,
        "credentialRef": if configured { Some(openai::CREDENTIAL_REF) } else { None }
    }))
}

fn save_api_key_with(store: &dyn CredentialStore, api_key: &str) -> Result<Value, AppError> {
    store.save(api_key)?;
    credential_status_with(store)
}

fn delete_api_key_with(store: &dyn CredentialStore) -> Result<Value, AppError> {
    store.delete()?;
    credential_status_with(store)
}

fn request_api_key(
    provided: Option<String>,
    store: &dyn CredentialStore,
) -> Result<String, AppError> {
    match provided {
        Some(value) if !value.trim().is_empty() => Ok(value.trim().to_owned()),
        Some(_) => Err(AppError::policy(
            "OPENAI_API_KEY_REQUIRED",
            "API Key 不能为空",
        )),
        None => store.load()?.ok_or_else(|| {
            AppError::policy(
                "OPENAI_API_KEY_REQUIRED",
                "尚未在 PaperWeave 中保存 API Key",
            )
        }),
    }
}

#[tauri::command]
pub fn open_ai_credential_status(state: State<'_, AppState>) -> Result<Value, AppError> {
    credential_status_with(&LocalCredentialStore::new(&state))
}

#[tauri::command(rename_all = "camelCase")]
pub fn save_open_ai_api_key(
    state: State<'_, AppState>,
    api_key: String,
) -> Result<Value, AppError> {
    save_api_key_with(&LocalCredentialStore::new(&state), &api_key)
}

#[tauri::command]
pub fn delete_open_ai_api_key(state: State<'_, AppState>) -> Result<Value, AppError> {
    delete_api_key_with(&LocalCredentialStore::new(&state))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn list_open_ai_models(
    state: State<'_, AppState>,
    input: ListOpenAiModelsInput,
) -> Result<Vec<openai::OpenAiModel>, AppError> {
    let api_key = request_api_key(input.api_key, &LocalCredentialStore::new(&state))?;
    openai::list_models(&input.base_url, &api_key).await
}

fn normalized_text_list(values: Vec<String>) -> Vec<String> {
    values
        .into_iter()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .collect()
}

fn generated_bundle(
    generated: openai::GeneratedDraft,
    paper_id: &str,
    paper_version_id: &str,
    model_run_id: &str,
    anchors: &HashMap<String, Value>,
) -> Result<DraftBundleInput, AppError> {
    let claim_text = generated.claim_text.trim();
    if claim_text.chars().count() < 5 || claim_text.chars().count() > 1_500 {
        return Err(AppError::policy(
            "OPENAI_DRAFT_CLAIM_INVALID",
            "模型返回的 claimText 必须包含 5 到 1500 个字符",
        ));
    }
    if ![
        "theoretical",
        "empirical",
        "methodological",
        "descriptive",
        "interpretive",
        "normative",
    ]
    .contains(&generated.claim_type.as_str())
    {
        return Err(AppError::policy(
            "OPENAI_DRAFT_CLAIM_TYPE_INVALID",
            "模型返回了不支持的 claimType",
        ));
    }
    if ![
        "direct_quote",
        "author_claim",
        "reported_result",
        "ai_inference",
    ]
    .contains(&generated.epistemic_source.as_str())
    {
        return Err(AppError::policy(
            "OPENAI_DRAFT_EPISTEMIC_SOURCE_INVALID",
            "模型返回了不支持的 epistemicSource，AI 不能创建用户判断",
        ));
    }
    if !["support", "counter", "qualify", "context"].contains(&generated.relation.as_str()) {
        return Err(AppError::policy(
            "OPENAI_DRAFT_RELATION_INVALID",
            "模型返回了不支持的 EvidenceLink relation",
        ));
    }
    if ![
        "direct_statement",
        "reported_result",
        "definition",
        "method_description",
        "limitation_statement",
        "figure",
        "table",
        "equation",
        "context",
    ]
    .contains(&generated.support_type.as_str())
    {
        return Err(AppError::policy(
            "OPENAI_DRAFT_SUPPORT_TYPE_INVALID",
            "模型返回了不支持的 EvidenceLink supportType",
        ));
    }
    if generated.epistemic_source == "reported_result"
        && !["reported_result", "figure", "table", "equation"]
            .contains(&generated.support_type.as_str())
    {
        return Err(AppError::policy(
            "OPENAI_REPORTED_RESULT_SUPPORT_INVALID",
            "reported_result Draft 必须引用结果、图、表或公式证据",
        ));
    }
    if !generated.confidence.is_finite() || !(0.0..=1.0).contains(&generated.confidence) {
        return Err(AppError::policy(
            "OPENAI_DRAFT_CONFIDENCE_INVALID",
            "模型返回的 confidence 必须在 0 到 1 之间",
        ));
    }
    if generated.epistemic_source == "ai_inference" && !generated.needs_human_attention {
        return Err(AppError::policy(
            "OPENAI_INFERENCE_REVIEW_REQUIRED",
            "AI inference 必须明确标记 needsHumanAttention",
        ));
    }
    if generated.anchor_ids.is_empty() {
        return Err(AppError::policy(
            "OPENAI_DRAFT_ANCHOR_REQUIRED",
            "模型返回的每条 Draft 必须引用至少一个已选择 Anchor",
        ));
    }
    let unique_anchor_ids: HashSet<&String> = generated.anchor_ids.iter().collect();
    if unique_anchor_ids.len() != generated.anchor_ids.len()
        || generated
            .anchor_ids
            .iter()
            .any(|anchor_id| !anchors.contains_key(anchor_id))
    {
        return Err(AppError::policy(
            "OPENAI_DRAFT_ANCHOR_INVALID",
            "模型引用了重复、未知或未选择的 Anchor",
        ));
    }

    let draft_id = uuid::Uuid::new_v4().to_string();
    let mut evidence_link_ids = Vec::with_capacity(generated.anchor_ids.len());
    let mut evidence_links = Vec::with_capacity(generated.anchor_ids.len());
    for (ordinal, anchor_id) in generated.anchor_ids.iter().enumerate() {
        let anchor = anchors.get(anchor_id).expect("validated Anchor lookup");
        let link_id = uuid::Uuid::new_v4().to_string();
        evidence_link_ids.push(link_id.clone());
        evidence_links.push(json!({
            "id": link_id,
            "claimId": draft_id,
            "anchorId": anchor_id,
            "relation": generated.relation,
            "supportType": generated.support_type,
            "quotedFragment": required_string(anchor, "selectedText")?,
            "note": null,
            "ordinal": ordinal,
        }));
    }
    let now = chrono::Utc::now().to_rfc3339();
    let draft = json!({
        "id": draft_id,
        "paperId": paper_id,
        "paperVersionId": paper_version_id,
        "claimText": claim_text,
        "claimType": generated.claim_type,
        "epistemicSource": generated.epistemic_source,
        "evidenceLinkIds": evidence_link_ids,
        "assumptions": normalized_text_list(generated.assumptions),
        "scopeConditions": normalized_text_list(generated.scope_conditions),
        "limitations": normalized_text_list(generated.limitations),
        "confidence": generated.confidence,
        "confidenceBasis": normalized_text_list(generated.confidence_basis),
        "reviewStatus": "draft",
        "createdBy": "ai",
        "needsHumanAttention": generated.needs_human_attention,
        "modelRunId": model_run_id,
        "userComment": null,
        "version": 1,
        "createdAt": now,
        "updatedAt": now,
        "reviewedBy": null,
        "reviewedAt": null,
        "originalAiDraft": null,
    });
    Ok(DraftBundleInput {
        draft,
        evidence_links,
    })
}

#[tauri::command(rename_all = "camelCase")]
pub async fn generate_drafts(
    state: State<'_, AppState>,
    input: GenerateDraftsInput,
) -> Result<Value, AppError> {
    if input.anchor_ids.is_empty() {
        return Err(AppError::policy(
            "OPENAI_ANCHOR_REQUIRED",
            "生成 AI Draft 前必须选择至少一个 Evidence Anchor",
        ));
    }
    if input.anchor_ids.len() > openai::MAX_GENERATION_ANCHORS {
        return Err(AppError::policy(
            "OPENAI_ANCHOR_LIMIT",
            format!(
                "每次最多选择 {} 个 Evidence Anchor",
                openai::MAX_GENERATION_ANCHORS
            ),
        ));
    }
    let requested_anchor_ids: HashSet<&String> = input.anchor_ids.iter().collect();
    if requested_anchor_ids.len() != input.anchor_ids.len() {
        return Err(AppError::policy(
            "OPENAI_ANCHOR_DUPLICATE",
            "生成请求不能包含重复 Anchor",
        ));
    }

    let (base_url, model, paper_version_id, anchors, context) = {
        let connection = storage::connect(&state)?;
        let settings =
            storage::get_json(&connection, "settings", "workspace")?.ok_or_else(|| {
                AppError::policy(
                    "OPENAI_CONFIGURATION_REQUIRED",
                    "请先在“设置 → 模型与 API”中保存 Base URL 与模型 ID",
                )
            })?;
        let base_url = required_string(&settings, "openAiBaseUrl")?.to_owned();
        let model = required_string(&settings, "openAiModel")?.to_owned();
        let paper = storage::get_json(&connection, "paper", &input.paper_id)?.ok_or_else(|| {
            AppError::policy(
                "PAPER_NOT_FOUND",
                format!("本地工作区中不存在论文 {}", input.paper_id),
            )
        })?;
        let paper_version_id = required_string(&paper, "currentVersionId")?.to_owned();
        let mut anchors = HashMap::new();
        let mut generation_anchors = Vec::with_capacity(input.anchor_ids.len());
        for anchor_id in &input.anchor_ids {
            let anchor = storage::get_json(&connection, "anchor", anchor_id)?.ok_or_else(|| {
                AppError::policy("ANCHOR_NOT_FOUND", format!("不存在 Anchor {anchor_id}"))
            })?;
            if required_string(&anchor, "paperVersionId")? != paper_version_id {
                return Err(AppError::policy(
                    "ANCHOR_PAPER_VERSION_MISMATCH",
                    "AI Draft 只能引用当前论文版本的 Anchor",
                ));
            }
            generation_anchors.push(openai::GenerationAnchor {
                id: anchor_id.clone(),
                page_index: anchor
                    .get("pageIndex")
                    .and_then(Value::as_i64)
                    .ok_or_else(|| AppError::policy("ANCHOR_PAGE_INVALID", "Anchor 页码无效"))?,
                selected_text: required_string(&anchor, "selectedText")?.to_owned(),
            });
            anchors.insert(anchor_id.clone(), anchor);
        }
        let context = openai::GenerationContext {
            paper_title: required_string(&paper, "title")?.to_owned(),
            anchors: generation_anchors,
        };
        (base_url, model, paper_version_id, anchors, context)
    };

    openai::validate_generation_context(&context)?;
    let api_key = request_api_key(None, &LocalCredentialStore::new(&state))?;
    let generated = openai::generate_drafts(&base_url, &model, &api_key, &context).await?;
    persist_generated_drafts(
        &state,
        &input.paper_id,
        &paper_version_id,
        &anchors,
        generated,
    )
}

fn persist_generated_drafts(
    state: &AppState,
    paper_id: &str,
    paper_version_id: &str,
    anchors: &HashMap<String, Value>,
    generated: openai::GeneratedDrafts,
) -> Result<Value, AppError> {
    if generated.drafts.is_empty() {
        return Err(AppError::policy(
            "OPENAI_DRAFTS_EMPTY",
            "模型没有返回任何 Draft；未写入本地工作区",
        ));
    }
    if generated.drafts.len() > MAX_OPENAI_DRAFTS {
        return Err(AppError::policy(
            "OPENAI_DRAFT_LIMIT",
            format!("模型最多可返回 {MAX_OPENAI_DRAFTS} 条 Draft；未写入本地工作区"),
        ));
    }
    let model_run_id = uuid::Uuid::new_v4().to_string();
    let bundles = generated
        .drafts
        .into_iter()
        .map(|draft| generated_bundle(draft, paper_id, paper_version_id, &model_run_id, anchors))
        .collect::<Result<Vec<_>, _>>()?;
    let saved = save_draft_bundles_inner(state, bundles)?;
    Ok(json!({"modelRunId": model_run_id, "bundles": saved}))
}

fn paper_map_kind_allowed(kind: &str) -> bool {
    matches!(
        kind,
        "front_matter"
            | "title"
            | "author"
            | "email"
            | "abstract"
            | "section_heading"
            | "paragraph"
            | "list"
            | "figure_caption"
            | "table_caption"
            | "equation"
            | "reference"
    )
}

fn paper_map_evidence_kind(kind: &str) -> bool {
    matches!(
        kind,
        "abstract" | "paragraph" | "list" | "figure_caption" | "table_caption" | "equation"
    )
}

fn paper_map_context_blocks(index: &LocalDocumentIndexInput) -> Vec<openai::PaperMapContextBlock> {
    index
        .blocks
        .iter()
        .filter(|block| paper_map_evidence_kind(&block.kind))
        .map(|block| openai::PaperMapContextBlock {
            id: block.id.clone(),
            page: block.page,
            kind: block.kind.clone(),
            section_path: block.section_path.clone(),
            text: block.text.clone(),
        })
        .collect()
}

fn validate_document_index(index: &LocalDocumentIndexInput) -> Result<(), AppError> {
    if index.parser_version != PAPER_MAP_PARSER_VERSION {
        return Err(AppError::policy(
            "PAPER_MAP_PARSER_VERSION_INVALID",
            format!("全文索引必须由 {PAPER_MAP_PARSER_VERSION} 生成"),
        ));
    }
    if !is_sha256(&index.pdf_sha256) {
        return Err(AppError::policy(
            "PAPER_MAP_PDF_HASH_INVALID",
            "全文索引缺少有效的 PDF SHA-256",
        ));
    }
    if index.page_count == 0 || index.page_count > MAX_PAPER_MAP_PAGES {
        return Err(AppError::policy(
            "PAPER_MAP_PAGE_LIMIT",
            format!("论证地图支持 1–{MAX_PAPER_MAP_PAGES} 页的 PDF"),
        ));
    }
    if index.blocks.is_empty() || index.blocks.len() > MAX_PAPER_MAP_BLOCKS {
        return Err(AppError::policy(
            "PAPER_MAP_BLOCK_LIMIT",
            format!("全文索引必须包含 1–{MAX_PAPER_MAP_BLOCKS} 个 Block"),
        ));
    }
    let mut ids = HashSet::with_capacity(index.blocks.len());
    let mut total_chars = 0_usize;
    let mut evidence_blocks = 0_usize;
    for block in &index.blocks {
        if block.id.trim().is_empty() || !ids.insert(block.id.as_str()) {
            return Err(AppError::policy(
                "PAPER_MAP_BLOCK_ID_INVALID",
                "全文 Block id 不能为空或重复",
            ));
        }
        if block.page == 0 || block.page > index.page_count {
            return Err(AppError::policy(
                "PAPER_MAP_BLOCK_PAGE_INVALID",
                format!("Block {} 的页码不在 PDF 范围内", block.id),
            ));
        }
        if !paper_map_kind_allowed(&block.kind) {
            return Err(AppError::policy(
                "PAPER_MAP_BLOCK_KIND_INVALID",
                format!("Block {} 的 kind 无效", block.id),
            ));
        }
        if block
            .bbox
            .iter()
            .any(|value| !value.is_finite() || !(0.0..=1.0).contains(value))
            || block.bbox[0] >= block.bbox[2]
            || block.bbox[1] >= block.bbox[3]
        {
            return Err(AppError::policy(
                "PAPER_MAP_BLOCK_BBOX_INVALID",
                format!("Block {} 的 bbox 无效", block.id),
            ));
        }
        let text_chars = block.text.trim().chars().count();
        if text_chars == 0 || text_chars > MAX_PAPER_MAP_BLOCK_CHARS {
            return Err(AppError::policy(
                "PAPER_MAP_BLOCK_TEXT_INVALID",
                format!("Block {} 的文本为空或超过单块上限", block.id),
            ));
        }
        if block.section_path.len() > 8
            || block
                .section_path
                .iter()
                .any(|section| section.trim().is_empty() || section.chars().count() > 200)
        {
            return Err(AppError::policy(
                "PAPER_MAP_SECTION_PATH_INVALID",
                format!("Block {} 的 sectionPath 无效", block.id),
            ));
        }
        total_chars += text_chars;
        if total_chars > MAX_PAPER_MAP_TEXT_CHARS {
            return Err(AppError::policy(
                "PAPER_MAP_TEXT_LIMIT",
                format!("全文 Block 文本超过 {MAX_PAPER_MAP_TEXT_CHARS} 字符上限"),
            ));
        }
        if paper_map_evidence_kind(&block.kind) {
            evidence_blocks += 1;
        }
    }
    if evidence_blocks == 0 {
        return Err(AppError::policy(
            "PAPER_MAP_EVIDENCE_BLOCK_REQUIRED",
            "全文索引没有可作为论证证据的正文 Block",
        ));
    }
    Ok(())
}

fn normalized_sha256(value: &str) -> &str {
    value.strip_prefix("sha256:").unwrap_or(value)
}

fn paper_version_sha256<'a>(paper: &'a Value, paper_version_id: &str) -> Result<&'a str, AppError> {
    paper
        .get("versions")
        .and_then(Value::as_array)
        .and_then(|versions| {
            versions
                .iter()
                .find(|version| version.get("id").and_then(Value::as_str) == Some(paper_version_id))
        })
        .and_then(|version| version.get("pdfSha256"))
        .and_then(Value::as_str)
        .ok_or_else(|| {
            AppError::policy("PAPER_MAP_PDF_VERSION_INVALID", "当前论文版本缺少 PDF 指纹")
        })
}

fn map_node_kind_allowed(kind: &str) -> bool {
    matches!(
        kind,
        "problem" | "background" | "method" | "result" | "limitation" | "conclusion"
    )
}

fn persist_generated_paper_map(
    state: &AppState,
    paper_id: &str,
    paper_version_id: &str,
    model: &str,
    index: &LocalDocumentIndexInput,
    generated: openai::GeneratedPaperMap,
) -> Result<Value, AppError> {
    if !(5..=8).contains(&generated.nodes.len()) {
        return Err(AppError::policy(
            "PAPER_MAP_NODE_LIMIT",
            "模型必须返回 5–8 个论证地图节点；未写入本地工作区",
        ));
    }
    let blocks = index
        .blocks
        .iter()
        .map(|block| (block.id.as_str(), block))
        .collect::<HashMap<_, _>>();
    let mut nodes = Vec::with_capacity(generated.nodes.len());
    for generated_node in generated.nodes {
        let title = generated_node.title.trim();
        let summary = generated_node.summary.trim();
        if title.is_empty()
            || title.chars().count() > 160
            || summary.is_empty()
            || summary.chars().count() > 1_200
        {
            return Err(AppError::policy(
                "PAPER_MAP_NODE_TEXT_INVALID",
                "地图节点标题或解释为空、或超过长度上限；未写入本地工作区",
            ));
        }
        if !map_node_kind_allowed(&generated_node.kind) {
            return Err(AppError::policy(
                "PAPER_MAP_NODE_KIND_INVALID",
                format!(
                    "地图节点 kind {} 无效；未写入本地工作区",
                    generated_node.kind
                ),
            ));
        }
        if !(1..=3).contains(&generated_node.evidence_groups.len()) {
            return Err(AppError::policy(
                "PAPER_MAP_EVIDENCE_GROUP_LIMIT",
                "每个地图节点必须包含 1–3 个证据组；未写入本地工作区",
            ));
        }
        let mut evidence_groups = Vec::with_capacity(generated_node.evidence_groups.len());
        for group in generated_node.evidence_groups {
            let label = group.label.trim();
            if label.is_empty() || label.chars().count() > 160 {
                return Err(AppError::policy(
                    "PAPER_MAP_EVIDENCE_LABEL_INVALID",
                    "证据组标签为空或超过长度上限；未写入本地工作区",
                ));
            }
            if !(1..=3).contains(&group.block_ids.len()) {
                return Err(AppError::policy(
                    "PAPER_MAP_EVIDENCE_BLOCK_LIMIT",
                    "每个证据组必须引用 1–3 个 Block；未写入本地工作区",
                ));
            }
            let unique_ids = group.block_ids.iter().collect::<HashSet<_>>();
            if unique_ids.len() != group.block_ids.len() {
                return Err(AppError::policy(
                    "PAPER_MAP_EVIDENCE_BLOCK_DUPLICATE",
                    "证据组不能重复引用同一 Block；未写入本地工作区",
                ));
            }
            for block_id in &group.block_ids {
                let block = blocks.get(block_id.as_str()).ok_or_else(|| {
                    AppError::policy(
                        "PAPER_MAP_BLOCK_NOT_FOUND",
                        format!("模型引用了不存在的 Block {block_id}；未写入本地工作区"),
                    )
                })?;
                if !paper_map_evidence_kind(&block.kind) {
                    return Err(AppError::policy(
                        "PAPER_MAP_BLOCK_NOT_EVIDENCE",
                        format!(
                            "Block {block_id} 属于 {}，不能作为论证证据；未写入本地工作区",
                            block.kind
                        ),
                    ));
                }
            }
            evidence_groups.push(json!({
                "id": uuid::Uuid::new_v4().to_string(),
                "label": label,
                "blockIds": group.block_ids,
            }));
        }
        nodes.push(json!({
            "id": uuid::Uuid::new_v4().to_string(),
            "title": title,
            "summary": summary,
            "kind": generated_node.kind,
            "evidenceGroups": evidence_groups,
        }));
    }

    let model_run_id = uuid::Uuid::new_v4().to_string();
    let artifact = json!({
        "id": format!("paper-map-{paper_id}"),
        "schemaVersion": "paper_map.v1",
        "paperId": paper_id,
        "paperVersionId": paper_version_id,
        "pdfSha256": index.pdf_sha256,
        "parserVersion": index.parser_version,
        "pageCount": index.page_count,
        "blockCount": index.blocks.len(),
        "modelRunId": model_run_id,
        "model": model,
        "generatedAt": chrono::Utc::now().to_rfc3339(),
        "nodes": nodes,
    });
    let mut connection = storage::connect(state)?;
    let transaction = connection.transaction()?;
    storage::upsert_json(&transaction, "paper_map", paper_id, &artifact)?;
    storage::audit(
        &transaction,
        "PaperMapGenerated",
        "paper_map",
        paper_id,
        &json!({
            "paperVersionId": paper_version_id,
            "modelRunId": model_run_id,
            "model": model,
            "nodeCount": artifact["nodes"].as_array().map_or(0, Vec::len),
            "blockCount": index.blocks.len(),
        }),
    )?;
    transaction.commit()?;
    Ok(artifact)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn generate_paper_map(
    state: State<'_, AppState>,
    input: GeneratePaperMapInput,
) -> Result<Value, AppError> {
    if !input.confirmed_full_text_upload {
        return Err(AppError::policy(
            "PAPER_MAP_UPLOAD_CONFIRMATION_REQUIRED",
            "生成论证地图前必须逐篇确认发送本地结构化全文文本",
        ));
    }
    validate_document_index(&input.document_index)?;

    let (base_url, model, context) = {
        let connection = storage::connect(&state)?;
        let settings =
            storage::get_json(&connection, "settings", "workspace")?.ok_or_else(|| {
                AppError::policy(
                    "OPENAI_CONFIGURATION_REQUIRED",
                    "请先在“设置 → 模型与 API”中保存 Base URL 与模型 ID",
                )
            })?;
        let base_url = required_string(&settings, "openAiBaseUrl")?.to_owned();
        let model = required_string(&settings, "openAiModel")?.to_owned();
        let paper = storage::get_json(&connection, "paper", &input.paper_id)?.ok_or_else(|| {
            AppError::policy(
                "PAPER_NOT_FOUND",
                format!("本地工作区中不存在论文 {}", input.paper_id),
            )
        })?;
        let current_version_id = required_string(&paper, "currentVersionId")?;
        if current_version_id != input.paper_version_id {
            return Err(AppError::policy(
                "PAPER_MAP_PAPER_VERSION_MISMATCH",
                "全文索引不属于当前论文版本；请重新建立本地索引",
            ));
        }
        let stored_pdf_sha256 = paper_version_sha256(&paper, current_version_id)?;
        if normalized_sha256(stored_pdf_sha256)
            != normalized_sha256(&input.document_index.pdf_sha256)
        {
            return Err(AppError::policy(
                "PAPER_MAP_PDF_MISMATCH",
                "全文索引的 PDF 指纹与当前论文不一致",
            ));
        }
        let context = openai::PaperMapGenerationContext {
            blocks: paper_map_context_blocks(&input.document_index),
        };
        (base_url, model, context)
    };

    let api_key = request_api_key(None, &LocalCredentialStore::new(&state))?;
    let generated = openai::generate_paper_map(
        &base_url,
        &model,
        &api_key,
        input.confirmed_full_text_upload,
        &context,
    )
    .await?;
    persist_generated_paper_map(
        &state,
        &input.paper_id,
        &input.paper_version_id,
        &model,
        &input.document_index,
        generated,
    )
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

fn validate_openai_settings(settings: &Value) -> Result<(), AppError> {
    if let Some(base_url) = settings.get("openAiBaseUrl") {
        let base_url = base_url.as_str().ok_or_else(|| {
            AppError::policy("OPENAI_BASE_URL_INVALID", "openAiBaseUrl 必须是字符串")
        })?;
        openai::normalize_base_url(base_url)?;
    }
    if settings
        .get("openAiModel")
        .is_some_and(|model| !model.is_string())
    {
        return Err(AppError::policy(
            "OPENAI_MODEL_INVALID",
            "openAiModel 必须是字符串",
        ));
    }
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub fn save_settings(state: State<'_, AppState>, settings: Value) -> Result<Value, AppError> {
    save_settings_inner(&state, settings)
}

fn save_settings_inner(state: &AppState, settings: Value) -> Result<Value, AppError> {
    if contains_secret(&settings) {
        return Err(AppError::policy(
            "SECURITY_SECRET_IN_SETTINGS",
            "工作区设置不能包含密钥、令牌或密码明文；请使用 PaperWeave 的本机 API Key 配置",
        ));
    }
    validate_openai_settings(&settings)?;
    let connection = storage::connect(state)?;
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
    use std::collections::HashMap;
    use std::fs;
    use std::sync::Mutex;

    use super::{
        contains_secret, credential_status_with, delete_api_key_with, generated_bundle,
        paper_map_context_blocks, persist_generated_drafts, persist_generated_paper_map,
        request_api_key, required_string, review_draft_inner, save_api_key_with,
        save_draft_bundles_inner, save_settings_inner, snapshot, update_paper_metadata_inner,
        validate_anchor_value, validate_document_index, validate_openai_settings,
        DocumentBlockInput, LocalCredentialStore, LocalDocumentIndexInput, ReviewDraftInput,
        UpdatePaperMetadataInput, PAPER_MAP_PARSER_VERSION,
    };
    use crate::error::AppError;
    use crate::openai::{
        CredentialStore, GeneratedDraft, GeneratedDrafts, GeneratedPaperMap,
        GeneratedPaperMapEvidenceGroup, GeneratedPaperMapNode, CREDENTIAL_REF,
    };
    use crate::storage::{self, AppState};
    use serde_json::json;

    #[derive(Default)]
    struct MemoryCredentialStore {
        value: Mutex<Option<String>>,
    }

    impl CredentialStore for MemoryCredentialStore {
        fn load(&self) -> Result<Option<String>, AppError> {
            Ok(self.value.lock().unwrap().clone())
        }

        fn save(&self, api_key: &str) -> Result<(), AppError> {
            if api_key.trim().is_empty() {
                return Err(AppError::policy(
                    "OPENAI_API_KEY_REQUIRED",
                    "API Key 不能为空",
                ));
            }
            *self.value.lock().unwrap() = Some(api_key.trim().to_owned());
            Ok(())
        }

        fn delete(&self) -> Result<(), AppError> {
            *self.value.lock().unwrap() = None;
            Ok(())
        }
    }

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

    fn generated_draft(claim_text: &str) -> GeneratedDraft {
        GeneratedDraft {
            claim_text: claim_text.to_owned(),
            claim_type: "empirical".to_owned(),
            epistemic_source: "reported_result".to_owned(),
            anchor_ids: vec!["anchor-1".to_owned()],
            relation: "support".to_owned(),
            support_type: "reported_result".to_owned(),
            assumptions: vec![],
            scope_conditions: vec![],
            limitations: vec![],
            confidence: 0.8,
            confidence_basis: vec!["Selected evidence".to_owned()],
            needs_human_attention: false,
        }
    }

    fn generation_anchor() -> serde_json::Value {
        json!({
            "id": "anchor-1",
            "paperVersionId": "version-1",
            "pageIndex": 0,
            "selectedText": "A selected reported result."
        })
    }

    fn document_block(id: &str, kind: &str) -> DocumentBlockInput {
        DocumentBlockInput {
            id: id.to_owned(),
            page: 1,
            bbox: [0.1, 0.2, 0.8, 0.24],
            kind: kind.to_owned(),
            section_path: vec!["Results".to_owned()],
            text: format!("Structured text for {id}."),
        }
    }

    fn document_index() -> LocalDocumentIndexInput {
        LocalDocumentIndexInput {
            pdf_sha256: format!("sha256:{}", "b".repeat(64)),
            parser_version: PAPER_MAP_PARSER_VERSION.to_owned(),
            page_count: 1,
            blocks: vec![document_block("p0001-b0001", "paragraph")],
        }
    }

    fn generated_paper_map(block_id: &str) -> GeneratedPaperMap {
        let kinds = ["problem", "method", "result", "limitation", "conclusion"];
        GeneratedPaperMap {
            nodes: kinds
                .iter()
                .enumerate()
                .map(|(index, kind)| GeneratedPaperMapNode {
                    title: format!("Map node {index}"),
                    summary: "An explanatory argument-map node.".to_owned(),
                    kind: (*kind).to_owned(),
                    evidence_groups: vec![GeneratedPaperMapEvidenceGroup {
                        label: "Local evidence".to_owned(),
                        block_ids: vec![block_id.to_owned()],
                    }],
                })
                .collect(),
        }
    }

    #[test]
    fn settings_reject_plaintext_secrets_but_allow_references() {
        assert!(contains_secret(&json!({"apiKey": "sk-secret"})));
        assert!(contains_secret(
            &json!({"nested": {"accessToken": "secret"}})
        ));
        assert!(!contains_secret(&json!({
            "credentialRef": "paperweave-local://openai-compatible",
            "cloudMetadataEnabled": false
        })));
        assert!(validate_openai_settings(&json!({
            "openAiBaseUrl": "https://provider.example/v1",
            "openAiModel": "model-a"
        }))
        .is_ok());
        assert!(validate_openai_settings(&json!({
            "openAiBaseUrl": "provider.example/v1",
            "openAiModel": "model-a"
        }))
        .is_err());
    }

    #[test]
    fn credential_commands_use_a_store_without_returning_the_key() {
        let store = MemoryCredentialStore::default();
        assert_eq!(
            credential_status_with(&store).unwrap(),
            json!({"configured": false, "credentialRef": null})
        );

        let status = save_api_key_with(&store, "test-secret").unwrap();
        assert_eq!(
            status,
            json!({"configured": true, "credentialRef": CREDENTIAL_REF})
        );
        assert!(!status.to_string().contains("test-secret"));
        assert_eq!(request_api_key(None, &store).unwrap(), "test-secret");

        assert_eq!(
            delete_api_key_with(&store).unwrap(),
            json!({"configured": false, "credentialRef": null})
        );
    }

    #[test]
    fn local_credential_survives_new_store_instances_until_user_deletes_it() {
        let state = test_state();
        save_api_key_with(&LocalCredentialStore::new(&state), "persistent-test-secret").unwrap();

        let reopened_store = LocalCredentialStore::new(&state);
        assert_eq!(
            credential_status_with(&reopened_store).unwrap(),
            json!({"configured": true, "credentialRef": CREDENTIAL_REF})
        );
        assert_eq!(
            request_api_key(None, &reopened_store).unwrap(),
            "persistent-test-secret"
        );
        let workspace_snapshot = serde_json::to_string(&snapshot(&state).unwrap()).unwrap();
        assert!(!workspace_snapshot.contains("persistent-test-secret"));
        assert!(!workspace_snapshot.contains("local_credential"));

        delete_api_key_with(&reopened_store).unwrap();
        assert_eq!(
            credential_status_with(&LocalCredentialStore::new(&state)).unwrap(),
            json!({"configured": false, "credentialRef": null})
        );
        remove_test_state(&state);
    }

    #[test]
    fn model_settings_persist_only_ordinary_fields_and_credential_reference() {
        let state = test_state();
        let settings = json!({
            "openAiBaseUrl": "https://provider.example/v1",
            "openAiModel": "model-a",
            "openAiCredentialRef": CREDENTIAL_REF,
            "telemetryEnabled": false
        });

        save_settings_inner(&state, settings.clone()).unwrap();

        let connection = storage::connect(&state).unwrap();
        assert_eq!(
            storage::get_json(&connection, "settings", "workspace")
                .unwrap()
                .unwrap(),
            settings
        );
        drop(connection);
        remove_test_state(&state);
    }

    #[test]
    fn generated_ai_draft_keeps_model_run_and_selected_anchor() {
        let anchor = generation_anchor();
        let anchors = HashMap::from([("anchor-1".to_owned(), anchor)]);
        let generated = generated_draft("The evidence supports a reviewable result.");

        let bundle =
            generated_bundle(generated, "paper-1", "version-1", "run-1", &anchors).unwrap();
        assert_eq!(bundle.draft["createdBy"], "ai");
        assert_eq!(bundle.draft["reviewStatus"], "draft");
        assert_eq!(bundle.draft["modelRunId"], "run-1");
        assert_eq!(bundle.evidence_links[0]["anchorId"], "anchor-1");
    }

    #[test]
    fn more_than_three_generated_drafts_write_nothing() {
        let state = test_state();
        let anchors = HashMap::from([("anchor-1".to_owned(), generation_anchor())]);
        let result = persist_generated_drafts(
            &state,
            "paper-1",
            "version-1",
            &anchors,
            GeneratedDrafts {
                drafts: (1..=4)
                    .map(|index| generated_draft(&format!("Reviewable result number {index}.")))
                    .collect(),
            },
        );

        assert!(result
            .unwrap_err()
            .to_string()
            .starts_with("OPENAI_DRAFT_LIMIT:"));
        let connection = storage::connect(&state).unwrap();
        assert!(storage::list_json(&connection, "draft").unwrap().is_empty());
        assert!(storage::list_json(&connection, "evidence_link")
            .unwrap()
            .is_empty());
        let audit_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM audit_event", [], |row| row.get(0))
            .unwrap();
        assert_eq!(audit_count, 0);
        drop(connection);
        remove_test_state(&state);
    }

    #[test]
    fn ai_bundle_batch_rolls_back_when_second_draft_conflicts() {
        let state = test_state();
        let anchor = generation_anchor();
        let connection = storage::connect(&state).unwrap();
        storage::insert_json(&connection, "anchor", "anchor-1", &anchor).unwrap();
        drop(connection);
        let anchors = HashMap::from([("anchor-1".to_owned(), anchor)]);
        let first = generated_bundle(
            generated_draft("First reviewable generated result."),
            "paper-1",
            "version-1",
            "run-1",
            &anchors,
        )
        .unwrap();
        let mut second = generated_bundle(
            generated_draft("Second reviewable generated result."),
            "paper-1",
            "version-1",
            "run-1",
            &anchors,
        )
        .unwrap();
        let conflicting_draft_id = first.draft["id"].as_str().unwrap().to_owned();
        second.draft["id"] = json!(conflicting_draft_id.clone());
        second.evidence_links[0]["claimId"] = second.draft["id"].clone();
        let evidence_link_ids = [
            first.evidence_links[0]["id"].as_str().unwrap().to_owned(),
            second.evidence_links[0]["id"].as_str().unwrap().to_owned(),
        ];

        assert!(save_draft_bundles_inner(&state, vec![first, second]).is_err());

        let connection = storage::connect(&state).unwrap();
        assert!(
            storage::get_json(&connection, "draft", &conflicting_draft_id)
                .unwrap()
                .is_none()
        );
        for link_id in evidence_link_ids {
            assert!(storage::get_json(&connection, "evidence_link", &link_id)
                .unwrap()
                .is_none());
        }
        let audit_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM audit_event", [], |row| row.get(0))
            .unwrap();
        assert_eq!(audit_count, 0);
        drop(connection);
        remove_test_state(&state);
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
            "rectsNorm": [[0.1, 0.2, 0.4, 0.23], [0.1, 0.25, 0.7, 0.3]],
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

        let invalid_rects = json!({
            "id": "anchor-2",
            "paperVersionId": "version-1",
            "pageIndex": 0,
            "bboxNorm": [0.1, 0.2, 0.7, 0.3],
            "rectsNorm": [],
            "selectedText": "Evidence text",
            "textHash": "a".repeat(64),
            "pdfSha256": format!("sha256:{}", "b".repeat(64)),
            "anchorType": "text"
        });
        assert!(validate_anchor_value(&invalid_rects).is_err());

        let missing_user_selection_rects = json!({
            "id": "anchor-3",
            "paperVersionId": "version-1",
            "pageIndex": 0,
            "bboxNorm": [0.1, 0.2, 0.7, 0.3],
            "selectedText": "Evidence text",
            "textHash": "a".repeat(64),
            "pdfSha256": format!("sha256:{}", "b".repeat(64)),
            "anchorType": "text",
            "createdBy": "user_selection"
        });
        let error = validate_anchor_value(&missing_user_selection_rects).unwrap_err();
        assert!(error.to_string().contains("ANCHOR_RECTS_REQUIRED"));
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

    #[test]
    fn document_index_rejects_invalid_limits_before_generation() {
        let mut index = document_index();
        assert!(validate_document_index(&index).is_ok());

        index.blocks[0].bbox = [0.8, 0.2, 0.1, 0.3];
        assert!(validate_document_index(&index)
            .unwrap_err()
            .to_string()
            .starts_with("PAPER_MAP_BLOCK_BBOX_INVALID:"));
    }

    #[test]
    fn unknown_paper_map_block_id_writes_nothing() {
        let state = test_state();
        let result = persist_generated_paper_map(
            &state,
            "paper-1",
            "version-1",
            "model-a",
            &document_index(),
            generated_paper_map("missing-block"),
        );

        assert!(result
            .unwrap_err()
            .to_string()
            .starts_with("PAPER_MAP_BLOCK_NOT_FOUND:"));
        let connection = storage::connect(&state).unwrap();
        assert!(storage::list_json(&connection, "paper_map")
            .unwrap()
            .is_empty());
        let audit_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM audit_event", [], |row| row.get(0))
            .unwrap();
        assert_eq!(audit_count, 0);
        drop(connection);
        remove_test_state(&state);
    }

    #[test]
    fn metadata_and_reference_blocks_cannot_become_paper_map_evidence() {
        for kind in [
            "front_matter",
            "title",
            "author",
            "email",
            "section_heading",
            "reference",
        ] {
            let state = test_state();
            let mut index = document_index();
            index.blocks.push(document_block("forbidden-block", kind));
            let result = persist_generated_paper_map(
                &state,
                "paper-1",
                "version-1",
                "model-a",
                &index,
                generated_paper_map("forbidden-block"),
            );

            assert!(result
                .unwrap_err()
                .to_string()
                .starts_with("PAPER_MAP_BLOCK_NOT_EVIDENCE:"));
            let connection = storage::connect(&state).unwrap();
            assert!(storage::list_json(&connection, "paper_map")
                .unwrap()
                .is_empty());
            drop(connection);
            remove_test_state(&state);
        }
    }

    #[test]
    fn provider_context_contains_only_evidence_blocks_with_local_section_paths() {
        let mut index = document_index();
        index
            .blocks
            .push(document_block("p0001-b0002", "section_heading"));
        index.blocks.push(document_block("p0001-b0003", "title"));

        let blocks = paper_map_context_blocks(&index);

        assert_eq!(blocks.len(), 1);
        assert_eq!(blocks[0].id, "p0001-b0001");
        assert_eq!(blocks[0].section_path, ["Results"]);
    }

    #[test]
    fn valid_paper_map_persists_one_versioned_artifact_and_audit() {
        let state = test_state();
        let artifact = persist_generated_paper_map(
            &state,
            "paper-1",
            "version-1",
            "model-a",
            &document_index(),
            generated_paper_map("p0001-b0001"),
        )
        .unwrap();

        assert_eq!(artifact["schemaVersion"], "paper_map.v1");
        assert_eq!(artifact["nodes"].as_array().unwrap().len(), 5);
        let connection = storage::connect(&state).unwrap();
        assert_eq!(
            storage::list_json(&connection, "paper_map").unwrap().len(),
            1
        );
        let audit_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM audit_event", [], |row| row.get(0))
            .unwrap();
        assert_eq!(audit_count, 1);
        drop(connection);
        remove_test_state(&state);
    }
}
