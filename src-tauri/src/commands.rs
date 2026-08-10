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
    pub drafts: Vec<Value>,
    pub review_actions: Vec<Value>,
    pub verified_claims: Vec<Value>,
    pub user_notes: Vec<Value>,
    pub settings: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewDraftInput {
    pub action: Value,
    pub verified_claim: Option<Value>,
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
        schema_version: 1,
        papers: storage::list_json(&connection, "paper")?,
        anchors: storage::list_json(&connection, "anchor")?,
        drafts: storage::list_json(&connection, "draft")?,
        review_actions: storage::list_json(&connection, "review_action")?,
        verified_claims: storage::list_json(&connection, "verified_claim")?,
        user_notes: storage::list_json(&connection, "user_note")?,
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
pub fn save_anchor(state: State<'_, AppState>, anchor: Value) -> Result<Value, AppError> {
    validate_anchor_value(&anchor)?;
    let id = required_string(&anchor, "id")?;
    let connection = storage::connect(&state)?;
    storage::insert_json(&connection, "anchor", id, &anchor)?;
    storage::audit(&connection, "AnchorCreated", "anchor", id, &json!({}))?;
    Ok(anchor)
}

#[tauri::command(rename_all = "camelCase")]
pub fn save_draft(state: State<'_, AppState>, draft: Value) -> Result<Value, AppError> {
    let id = required_string(&draft, "id")?;
    required_string(&draft, "paperId")?;
    required_string(&draft, "paperVersionId")?;
    required_string(&draft, "claimText")?;
    if draft.get("reviewStatus").and_then(Value::as_str) != Some("draft")
        || draft.get("createdBy").and_then(Value::as_str) != Some("ai")
    {
        return Err(AppError::policy(
            "DRAFT_TRUST_BOUNDARY",
            "模型提案必须以 AI draft 身份保存",
        ));
    }
    let epistemic = required_string(&draft, "epistemicSource")?;
    let evidence = draft
        .get("evidence")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if matches!(
        epistemic,
        "direct_quote" | "author_claim" | "reported_result"
    ) && evidence.is_empty()
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
    let connection = storage::connect(&state)?;
    for anchor_id in evidence
        .iter()
        .filter_map(|item| item.get("anchorId"))
        .filter_map(Value::as_str)
    {
        if storage::get_json(&connection, "anchor", anchor_id)?.is_none() {
            return Err(AppError::policy(
                "ANCHOR_NOT_FOUND",
                format!("不存在 Anchor {anchor_id}"),
            ));
        }
    }
    storage::insert_json(&connection, "draft", id, &draft)?;
    storage::audit(&connection, "DraftClaimCreated", "draft", id, &json!({}))?;
    Ok(draft)
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
            || verified.get("evidence") != draft.get("evidence")
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
pub fn save_user_note(state: State<'_, AppState>, note: Value) -> Result<Value, AppError> {
    let id = required_string(&note, "id")?;
    required_string(&note, "paperId")?;
    required_string(&note, "content")?;
    if note.get("createdBy").and_then(Value::as_str) != Some("user") {
        return Err(AppError::policy(
            "USER_NOTE_PROVENANCE",
            "用户笔记必须明确标记 createdBy=user",
        ));
    }
    let connection = storage::connect(&state)?;
    storage::upsert_json(&connection, "user_note", id, &note)?;
    storage::audit(&connection, "UserNoteSaved", "user_note", id, &json!({}))?;
    Ok(note)
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

#[tauri::command(rename_all = "camelCase")]
pub fn preview_sync(state: State<'_, AppState>, request: Value) -> Result<Value, AppError> {
    let paper_ids = request
        .get("paperIds")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if paper_ids.is_empty() {
        return Err(AppError::policy(
            "SYNC_SCOPE_EMPTY",
            "同步预览至少需要一篇论文",
        ));
    }
    let plan_id = uuid::Uuid::new_v4().to_string();
    let requested_target = request
        .get("target")
        .and_then(Value::as_str)
        .unwrap_or("git");
    let action_target = if requested_target == "zotero" {
        "zotero"
    } else {
        "git"
    };
    let operation = if requested_target == "github" {
        "preview_push"
    } else {
        "preview_write"
    };
    let actions: Vec<Value> = paper_ids
        .iter()
        .filter_map(Value::as_str)
        .map(|paper_id| {
            json!({
                "id": uuid::Uuid::new_v4().to_string(),
                "target": action_target,
                "operation": operation,
                "resourceRef": paper_id,
                "summary": format!("Preview {operation} for {paper_id}"),
                "preconditions": ["explicit_user_approval", "adapter_configuration"],
                "destructive": false
            })
        })
        .collect();
    let plan = json!({
        "id": plan_id,
        "createdBy": "deterministic_executor",
        "status": "preview",
        "workspaceId": "local-workspace",
        "repositoryPath": null,
        "gitBranch": null,
        "zoteroLibraryId": null,
        "actions": actions,
        "warnings": ["当前只生成确定性预览；未配置任何外部写入执行器。"],
        "createdAt": chrono::Utc::now().to_rfc3339(),
        "approvedAt": null,
        "approvedBy": null
    });
    let connection = storage::connect(&state)?;
    storage::insert_json(&connection, "sync_plan", &plan_id, &plan)?;
    storage::audit(
        &connection,
        "SyncPreviewCreated",
        "sync_plan",
        &plan_id,
        &json!({"willExecute": false}),
    )?;
    Ok(plan)
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
        contains_secret, required_string, review_draft_inner, validate_anchor_value,
        ReviewDraftInput,
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
