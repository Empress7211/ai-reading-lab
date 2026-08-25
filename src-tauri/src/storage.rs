use std::path::{Path, PathBuf};

use rusqlite::{params, Connection};
use serde_json::Value;

use crate::error::AppError;

pub struct AppState {
    pub db_path: PathBuf,
    pub vault_dir: PathBuf,
}

pub fn initialize(db_path: &Path) -> Result<(), AppError> {
    let mut connection = Connection::open(db_path)?;
    connection.execute_batch(
        r#"
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS entity_json (
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          body TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (entity_type, entity_id)
        );

        CREATE TABLE IF NOT EXISTS pdf_asset (
          paper_id TEXT PRIMARY KEY,
          sha256 TEXT NOT NULL UNIQUE,
          vault_path TEXT NOT NULL,
          source_path TEXT NOT NULL,
          byte_length INTEGER NOT NULL,
          imported_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS audit_event (
          id TEXT PRIMARY KEY,
          event_type TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          body TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS app_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        "#,
    )?;
    connection.execute(
        "INSERT OR IGNORE INTO app_meta(key, value) VALUES ('schema_version', '1')",
        [],
    )?;
    let schema_version: u32 = connection
        .query_row(
            "SELECT value FROM app_meta WHERE key = 'schema_version'",
            [],
            |row| row.get::<_, String>(0),
        )?
        .parse()
        .unwrap_or(1);
    if schema_version < 2 {
        migrate_embedded_evidence_to_links(&mut connection)?;
    }
    Ok(())
}

fn migrate_embedded_evidence_to_links(connection: &mut Connection) -> Result<(), AppError> {
    let transaction = connection.transaction()?;
    for entity_type in ["draft", "verified_claim"] {
        let entities = list_json(&transaction, entity_type)?;
        for mut entity in entities {
            let claim_id = entity
                .get("id")
                .and_then(Value::as_str)
                .ok_or_else(|| AppError::policy("MIGRATION_CLAIM_ID", "旧 Claim 缺少 id"))?
                .to_owned();
            if entity.get("evidenceLinkIds").is_some() {
                continue;
            }
            let legacy_evidence = entity
                .get("evidence")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            let mut link_ids = Vec::with_capacity(legacy_evidence.len());
            for (ordinal, evidence) in legacy_evidence.iter().enumerate() {
                let anchor_id = evidence
                    .get("anchorId")
                    .and_then(Value::as_str)
                    .ok_or_else(|| {
                        AppError::policy("MIGRATION_ANCHOR_ID", "旧 Claim evidence 缺少 anchorId")
                    })?;
                let link_id = format!("legacy-{claim_id}-{ordinal}");
                let link = serde_json::json!({
                    "id": link_id.clone(),
                    "claimId": claim_id.clone(),
                    "anchorId": anchor_id,
                    "relation": "support",
                    "supportType": evidence.get("supportType").cloned().unwrap_or_else(|| Value::String("context".to_owned())),
                    "quotedFragment": evidence.get("quotedFragment").cloned().unwrap_or(Value::Null),
                    "note": evidence.get("notes").cloned().unwrap_or(Value::Null),
                    "ordinal": ordinal,
                });
                upsert_json(&transaction, "evidence_link", &link_id, &link)?;
                link_ids.push(Value::String(link_id));
            }
            let object = entity.as_object_mut().ok_or_else(|| {
                AppError::policy("MIGRATION_CLAIM_OBJECT", "旧 Claim 不是 JSON object")
            })?;
            object.remove("evidence");
            object.insert("evidenceLinkIds".to_owned(), Value::Array(link_ids));
            upsert_json(&transaction, entity_type, &claim_id, &entity)?;
        }
    }
    transaction.execute(
        "UPDATE app_meta SET value = '2' WHERE key = 'schema_version'",
        [],
    )?;
    transaction.commit()?;
    Ok(())
}

pub fn connect(state: &AppState) -> Result<Connection, AppError> {
    let connection = Connection::open(&state.db_path)?;
    connection.pragma_update(None, "foreign_keys", true)?;
    Ok(connection)
}

pub fn upsert_json(
    connection: &Connection,
    entity_type: &str,
    entity_id: &str,
    body: &Value,
) -> Result<(), AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    connection.execute(
        r#"
        INSERT INTO entity_json(entity_type, entity_id, body, version, created_at, updated_at)
        VALUES (?1, ?2, ?3, 1, ?4, ?4)
        ON CONFLICT(entity_type, entity_id) DO UPDATE SET
          body = excluded.body,
          version = entity_json.version + 1,
          updated_at = excluded.updated_at
        "#,
        params![entity_type, entity_id, serde_json::to_string(body)?, now],
    )?;
    Ok(())
}

pub fn insert_json(
    connection: &Connection,
    entity_type: &str,
    entity_id: &str,
    body: &Value,
) -> Result<(), AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    connection.execute(
        r#"
        INSERT INTO entity_json(entity_type, entity_id, body, version, created_at, updated_at)
        VALUES (?1, ?2, ?3, 1, ?4, ?4)
        "#,
        params![entity_type, entity_id, serde_json::to_string(body)?, now],
    )?;
    Ok(())
}

pub fn get_json(
    connection: &Connection,
    entity_type: &str,
    entity_id: &str,
) -> Result<Option<Value>, AppError> {
    let mut statement = connection
        .prepare("SELECT body FROM entity_json WHERE entity_type = ?1 AND entity_id = ?2")?;
    let mut rows = statement.query(params![entity_type, entity_id])?;
    match rows.next()? {
        Some(row) => Ok(Some(serde_json::from_str(&row.get::<_, String>(0)?)?)),
        None => Ok(None),
    }
}

pub fn delete_json(
    connection: &Connection,
    entity_type: &str,
    entity_id: &str,
) -> Result<(), AppError> {
    connection.execute(
        "DELETE FROM entity_json WHERE entity_type = ?1 AND entity_id = ?2",
        params![entity_type, entity_id],
    )?;
    Ok(())
}

pub fn list_json(connection: &Connection, entity_type: &str) -> Result<Vec<Value>, AppError> {
    let mut statement = connection.prepare(
        "SELECT body FROM entity_json WHERE entity_type = ?1 ORDER BY created_at, entity_id",
    )?;
    let rows = statement.query_map([entity_type], |row| row.get::<_, String>(0))?;
    rows.map(|row| serde_json::from_str(&row.map_err(AppError::from)?).map_err(AppError::from))
        .collect()
}

pub fn audit(
    connection: &Connection,
    event_type: &str,
    entity_type: &str,
    entity_id: &str,
    body: &Value,
) -> Result<(), AppError> {
    connection.execute(
        r#"INSERT INTO audit_event(id, event_type, entity_type, entity_id, body, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)"#,
        params![
            uuid::Uuid::new_v4().to_string(),
            event_type,
            entity_type,
            entity_id,
            serde_json::to_string(body)?,
            chrono::Utc::now().to_rfc3339()
        ],
    )?;
    Ok(())
}
