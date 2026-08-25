use std::time::Duration;

use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};

use crate::error::AppError;

pub const CREDENTIAL_REF: &str = "paperweave-local://openai-compatible";

pub trait CredentialStore {
    fn load(&self) -> Result<Option<String>, AppError>;
    fn save(&self, api_key: &str) -> Result<(), AppError>;
    fn delete(&self) -> Result<(), AppError>;
}

pub fn normalize_base_url(value: &str) -> Result<String, AppError> {
    let normalized = value.trim().trim_end_matches('/');
    let parsed = Url::parse(normalized).map_err(|_| {
        AppError::policy(
            "OPENAI_BASE_URL_INVALID",
            "Base URL 必须是完整的 http:// 或 https:// 地址",
        )
    })?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(AppError::policy(
            "OPENAI_BASE_URL_INVALID",
            "Base URL 仅支持 http:// 或 https://",
        ));
    }
    if !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return Err(AppError::policy(
            "OPENAI_BASE_URL_INVALID",
            "Base URL 不能包含账号、密码、查询参数或片段",
        ));
    }
    Ok(normalized.to_owned())
}

fn require_api_key(api_key: &str) -> Result<&str, AppError> {
    let normalized = api_key.trim();
    if normalized.is_empty() {
        return Err(AppError::policy(
            "OPENAI_API_KEY_REQUIRED",
            "尚未在 PaperWeave 中保存 API Key",
        ));
    }
    Ok(normalized)
}

fn client() -> Result<Client, AppError> {
    Client::builder()
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|error| {
            AppError::policy(
                "OPENAI_CLIENT_FAILED",
                format!("无法创建模型请求客户端：{error}"),
            )
        })
}

async fn response_text(response: reqwest::Response) -> Result<String, AppError> {
    let status = response.status();
    let body = response.text().await.map_err(|error| {
        AppError::policy(
            "OPENAI_RESPONSE_READ_FAILED",
            format!("无法读取模型服务响应：{error}"),
        )
    })?;
    if !status.is_success() {
        let excerpt: String = body.chars().take(800).collect();
        return Err(AppError::policy(
            "OPENAI_PROVIDER_ERROR",
            format!("模型服务返回 HTTP {status}：{excerpt}"),
        ));
    }
    Ok(body)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiModel {
    pub id: String,
    #[serde(
        rename(serialize = "ownedBy", deserialize = "owned_by"),
        alias = "ownedBy",
        default
    )]
    pub owned_by: Option<String>,
}

#[derive(Deserialize)]
struct ModelsResponse {
    data: Vec<OpenAiModel>,
}

pub async fn list_models(base_url: &str, api_key: &str) -> Result<Vec<OpenAiModel>, AppError> {
    let endpoint = format!("{}/models", normalize_base_url(base_url)?);
    let response = client()?
        .get(endpoint)
        .bearer_auth(require_api_key(api_key)?)
        .send()
        .await
        .map_err(|error| {
            AppError::policy(
                "OPENAI_REQUEST_FAILED",
                format!("无法连接模型服务：{error}"),
            )
        })?;
    let body = response_text(response).await?;
    let mut models: ModelsResponse = serde_json::from_str(&body).map_err(|error| {
        AppError::policy(
            "OPENAI_MODELS_RESPONSE_INVALID",
            format!("模型列表不是兼容的 JSON 响应：{error}"),
        )
    })?;
    models.data.retain(|model| !model.id.trim().is_empty());
    models.data.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(models.data)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationAnchor {
    pub id: String,
    pub page_index: i64,
    pub selected_text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationContext {
    pub paper_title: String,
    pub anchors: Vec<GenerationAnchor>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedDraft {
    pub claim_text: String,
    pub claim_type: String,
    pub epistemic_source: String,
    pub anchor_ids: Vec<String>,
    pub relation: String,
    pub support_type: String,
    pub assumptions: Vec<String>,
    pub scope_conditions: Vec<String>,
    pub limitations: Vec<String>,
    pub confidence: f64,
    pub confidence_basis: Vec<String>,
    pub needs_human_attention: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GeneratedDrafts {
    pub drafts: Vec<GeneratedDraft>,
}

pub const MAX_GENERATION_ANCHORS: usize = 8;
pub const MAX_GENERATION_CONTEXT_CHARS: usize = 20_000;

pub fn validate_generation_context(context: &GenerationContext) -> Result<(), AppError> {
    if context.anchors.len() > MAX_GENERATION_ANCHORS {
        return Err(AppError::policy(
            "OPENAI_ANCHOR_LIMIT",
            format!("每次最多选择 {MAX_GENERATION_ANCHORS} 个 Evidence Anchor"),
        ));
    }
    let selected_text_chars: usize = context
        .anchors
        .iter()
        .map(|anchor| anchor.selected_text.chars().count())
        .sum();
    if selected_text_chars > MAX_GENERATION_CONTEXT_CHARS {
        return Err(AppError::policy(
            "OPENAI_CONTEXT_TOO_LARGE",
            format!(
                "所选 Anchor 文本总计 {selected_text_chars} 个字符，超过 {MAX_GENERATION_CONTEXT_CHARS} 字符上限"
            ),
        ));
    }
    Ok(())
}

#[derive(Serialize)]
struct ChatMessage {
    role: &'static str,
    content: String,
}

#[derive(Serialize)]
struct ResponseFormat {
    #[serde(rename = "type")]
    format_type: &'static str,
}

#[derive(Serialize)]
struct ChatCompletionRequest {
    model: String,
    messages: Vec<ChatMessage>,
    response_format: ResponseFormat,
    max_tokens: u32,
}

#[derive(Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatChoiceMessage,
}

#[derive(Deserialize)]
struct ChatChoiceMessage {
    content: String,
}

const SYSTEM_PROMPT: &str = r#"You create evidence-bound Draft Claims for a human-reviewed PDF reader.
Return JSON only, with 1–3 drafts and this exact top-level shape: {"drafts":[...]}.
Each draft must contain claimText, claimType, epistemicSource, anchorIds, relation, supportType, assumptions, scopeConditions, limitations, confidence, confidenceBasis, needsHumanAttention.
anchorIds, assumptions, scopeConditions, limitations, and confidenceBasis must always be JSON arrays, even when empty or containing one item.
Type-accurate JSON example: {"drafts":[{"claimText":"The selected evidence reports a reviewable result.","claimType":"empirical","epistemicSource":"reported_result","anchorIds":["anchor-1"],"relation":"support","supportType":"reported_result","assumptions":[],"scopeConditions":[],"limitations":[],"confidence":0.8,"confidenceBasis":["Directly stated in the selected evidence"],"needsHumanAttention":false}]}
The example shows types only. Use the supplied evidence and actual supplied anchor IDs; never copy placeholder content or IDs.
Allowed claimType: theoretical, empirical, methodological, descriptive, interpretive, normative.
Allowed epistemicSource: direct_quote, author_claim, reported_result, ai_inference. Never output user_judgment.
Allowed relation: support, counter, qualify, context.
Allowed supportType: direct_statement, reported_result, definition, method_description, limitation_statement, figure, table, equation, context.
Use only supplied anchor IDs. Every draft must cite at least one anchor. Keep each claim atomic and in the language of its evidence. If epistemicSource is ai_inference, needsHumanAttention must be true. These are proposals only and must not claim human verification."#;

pub async fn generate_drafts(
    base_url: &str,
    model: &str,
    api_key: &str,
    context: &GenerationContext,
) -> Result<GeneratedDrafts, AppError> {
    validate_generation_context(context)?;
    let normalized_model = model.trim();
    if normalized_model.is_empty() {
        return Err(AppError::policy("OPENAI_MODEL_REQUIRED", "尚未选择模型 ID"));
    }
    let context_json = serde_json::to_string(context)?;
    let request = ChatCompletionRequest {
        model: normalized_model.to_owned(),
        messages: vec![
            ChatMessage {
                role: "system",
                content: SYSTEM_PROMPT.to_owned(),
            },
            ChatMessage {
                role: "user",
                content: context_json,
            },
        ],
        response_format: ResponseFormat {
            format_type: "json_object",
        },
        max_tokens: 2_000,
    };
    let endpoint = format!("{}/chat/completions", normalize_base_url(base_url)?);
    let response = client()?
        .post(endpoint)
        .bearer_auth(require_api_key(api_key)?)
        .json(&request)
        .send()
        .await
        .map_err(|error| {
            AppError::policy(
                "OPENAI_REQUEST_FAILED",
                format!("无法连接模型服务：{error}"),
            )
        })?;
    let body = response_text(response).await?;
    let completion: ChatCompletionResponse = serde_json::from_str(&body).map_err(|error| {
        AppError::policy(
            "OPENAI_COMPLETION_RESPONSE_INVALID",
            format!("Chat Completions 响应格式无效：{error}"),
        )
    })?;
    let content = completion
        .choices
        .into_iter()
        .next()
        .map(|choice| choice.message.content)
        .filter(|content| !content.trim().is_empty())
        .ok_or_else(|| {
            AppError::policy("OPENAI_COMPLETION_EMPTY", "模型服务没有返回 Draft 内容")
        })?;
    serde_json::from_str(content.trim()).map_err(|error| {
        AppError::policy(
            "OPENAI_DRAFT_JSON_INVALID",
            format!("模型未返回约定的 Draft JSON：{error}"),
        )
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperMapContextBlock {
    pub id: String,
    pub page: u32,
    pub kind: String,
    pub section_path: Vec<String>,
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperMapGenerationContext {
    pub blocks: Vec<PaperMapContextBlock>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GeneratedPaperMapEvidenceGroup {
    pub label: String,
    pub block_ids: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GeneratedPaperMapNode {
    pub title: String,
    pub summary: String,
    pub kind: String,
    pub evidence_groups: Vec<GeneratedPaperMapEvidenceGroup>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GeneratedPaperMap {
    pub nodes: Vec<GeneratedPaperMapNode>,
}

const PAPER_MAP_SYSTEM_PROMPT: &str = r#"You build a concise, evidence-bound argument map for a human-controlled PDF reader.
Return JSON only with this exact shape: {"nodes":[{"title":"...","summary":"...","kind":"problem","evidenceGroups":[{"label":"...","blockIds":["p0001-b0001"]}]}]}.
Return 5–8 nodes. Allowed kind: problem, background, method, result, limitation, conclusion.
Use exactly one evidence group per node. Put 1–3 unique blockIds in that group; never return a fourth blockId. If more evidence exists, select the strongest three instead of returning it.
title, summary, kind, and evidenceGroups[].label must each be a plain JSON string, never an object or array. evidenceGroups[].blockIds must be an array of plain string IDs.
Every blockId must be copied character-for-character from an id supplied in the input Blocks. A valid blockId has the exact form pNNNN-bNNNN.
Never invent or complete a blockId. Never append or prepend words, names, spaces, punctuation, or any other characters to a copied blockId.
Use only supplied block IDs whose kind is abstract, paragraph, list, figure_caption, table_caption, or equation.
Never cite front_matter, title, author, email, section_heading, or reference blocks.
Do not return quotes, source text, page numbers, bounding boxes, coordinates, file paths, confidence scores, or fields not shown in the schema.
Keep summaries explanatory rather than compressed labels. Preserve the paper's language.
Before returning, count every blockIds array and confirm each contains at least 1 and at most 3 strings. Then verify every blockId can be found verbatim among the supplied input Block ids.
This map is a navigation aid, not a verified conclusion. It must not claim human review or write Evidence Anchors."#;

pub async fn generate_paper_map(
    base_url: &str,
    model: &str,
    api_key: &str,
    confirmed_full_text_upload: bool,
    context: &PaperMapGenerationContext,
) -> Result<GeneratedPaperMap, AppError> {
    if !confirmed_full_text_upload {
        return Err(AppError::policy(
            "PAPER_MAP_UPLOAD_CONFIRMATION_REQUIRED",
            "生成论证地图前必须逐篇确认发送本地结构化全文文本",
        ));
    }
    let normalized_model = model.trim();
    if normalized_model.is_empty() {
        return Err(AppError::policy("OPENAI_MODEL_REQUIRED", "尚未选择模型 ID"));
    }
    let request = ChatCompletionRequest {
        model: normalized_model.to_owned(),
        messages: vec![
            ChatMessage {
                role: "system",
                content: PAPER_MAP_SYSTEM_PROMPT.to_owned(),
            },
            ChatMessage {
                role: "user",
                content: serde_json::to_string(context)?,
            },
        ],
        response_format: ResponseFormat {
            format_type: "json_object",
        },
        max_tokens: 5_000,
    };
    let endpoint = format!("{}/chat/completions", normalize_base_url(base_url)?);
    let response = client()?
        .post(endpoint)
        .bearer_auth(require_api_key(api_key)?)
        .json(&request)
        .send()
        .await
        .map_err(|error| {
            AppError::policy(
                "OPENAI_REQUEST_FAILED",
                format!("无法连接模型服务：{error}"),
            )
        })?;
    let body = response_text(response).await?;
    let completion: ChatCompletionResponse = serde_json::from_str(&body).map_err(|error| {
        AppError::policy(
            "OPENAI_COMPLETION_RESPONSE_INVALID",
            format!("Chat Completions 响应格式无效：{error}"),
        )
    })?;
    let content = completion
        .choices
        .into_iter()
        .next()
        .map(|choice| choice.message.content)
        .filter(|content| !content.trim().is_empty())
        .ok_or_else(|| {
            AppError::policy("OPENAI_COMPLETION_EMPTY", "模型服务没有返回论证地图内容")
        })?;
    serde_json::from_str(content.trim()).map_err(|error| {
        AppError::policy(
            "PAPER_MAP_JSON_INVALID",
            format!("模型未返回约定的 paper_map.v1 JSON：{error}"),
        )
    })
}

#[cfg(test)]
mod tests {
    use std::io::{ErrorKind, Read, Write};
    use std::net::TcpListener;
    use std::sync::mpsc::{self, Receiver};
    use std::thread;

    use serde_json::json;

    use super::{
        generate_drafts, generate_paper_map, list_models, normalize_base_url, GenerationAnchor,
        GenerationContext, PaperMapContextBlock, PaperMapGenerationContext,
    };

    fn mock_server(response_body: String) -> (String, Receiver<String>, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let (sender, receiver) = mpsc::channel();
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = Vec::new();
            let mut buffer = [0_u8; 4096];
            loop {
                let count = stream.read(&mut buffer).unwrap();
                if count == 0 {
                    break;
                }
                request.extend_from_slice(&buffer[..count]);
                let Some(header_end) = request.windows(4).position(|part| part == b"\r\n\r\n")
                else {
                    continue;
                };
                let header_text = String::from_utf8_lossy(&request[..header_end]);
                let content_length = header_text
                    .lines()
                    .find_map(|line| {
                        line.to_ascii_lowercase()
                            .strip_prefix("content-length: ")
                            .and_then(|value| value.trim().parse::<usize>().ok())
                    })
                    .unwrap_or(0);
                if request.len() >= header_end + 4 + content_length {
                    break;
                }
            }
            sender.send(String::from_utf8(request).unwrap()).unwrap();
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                response_body.len(),
                response_body
            );
            stream.write_all(response.as_bytes()).unwrap();
        });
        (format!("http://{address}/v1"), receiver, handle)
    }

    fn request_json(request: &str) -> serde_json::Value {
        let (_, body) = request.split_once("\r\n\r\n").unwrap();
        serde_json::from_str(body).unwrap()
    }

    fn no_request_server() -> (String, TcpListener) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        (
            format!("http://{}/v1", listener.local_addr().unwrap()),
            listener,
        )
    }

    fn assert_no_request(listener: TcpListener) {
        match listener.accept() {
            Err(error) if error.kind() == ErrorKind::WouldBlock => {}
            Ok(_) => panic!("generation preflight unexpectedly contacted the provider"),
            Err(error) => panic!("failed to inspect mock provider: {error}"),
        }
    }

    fn generation_context() -> GenerationContext {
        GenerationContext {
            paper_title: "Evidence first".to_owned(),
            anchors: vec![GenerationAnchor {
                id: "anchor-1".to_owned(),
                page_index: 0,
                selected_text: "A selected reported result.".to_owned(),
            }],
        }
    }

    fn paper_map_context() -> PaperMapGenerationContext {
        PaperMapGenerationContext {
            blocks: vec![PaperMapContextBlock {
                id: "p0001-b0001".to_owned(),
                page: 1,
                kind: "paragraph".to_owned(),
                section_path: vec!["Results".to_owned()],
                text: "The method improves the reported result.".to_owned(),
            }],
        }
    }

    #[test]
    fn validates_and_normalizes_base_urls() {
        assert_eq!(
            normalize_base_url(" https://provider.example/v1/ ").unwrap(),
            "https://provider.example/v1"
        );
        assert!(normalize_base_url("provider.example/v1").is_err());
        assert!(normalize_base_url("https://user:pass@provider.example/v1").is_err());
    }

    #[test]
    fn rejects_more_than_eight_anchors_before_http_request() {
        let (base_url, listener) = no_request_server();
        let context = GenerationContext {
            paper_title: "Evidence first".to_owned(),
            anchors: (0..9)
                .map(|index| GenerationAnchor {
                    id: format!("anchor-{index}"),
                    page_index: index,
                    selected_text: "Selected evidence.".to_owned(),
                })
                .collect(),
        };

        let error = tauri::async_runtime::block_on(generate_drafts(
            &base_url, "model-a", "test-key", &context,
        ))
        .unwrap_err()
        .to_string();

        assert!(error.starts_with("OPENAI_ANCHOR_LIMIT:"));
        assert_no_request(listener);
    }

    #[test]
    fn rejects_oversized_selected_text_before_http_request() {
        let (base_url, listener) = no_request_server();
        let context = GenerationContext {
            paper_title: "Evidence first".to_owned(),
            anchors: vec![GenerationAnchor {
                id: "anchor-1".to_owned(),
                page_index: 0,
                selected_text: "x".repeat(20_001),
            }],
        };

        let error = tauri::async_runtime::block_on(generate_drafts(
            &base_url, "model-a", "test-key", &context,
        ))
        .unwrap_err()
        .to_string();

        assert!(error.starts_with("OPENAI_CONTEXT_TOO_LARGE:"));
        assert_no_request(listener);
    }

    #[test]
    fn loads_models_from_the_compatible_endpoint() {
        let response = json!({
            "data": [
                {"id": "model-b", "owned_by": "provider"},
                {"id": "model-a", "owned_by": "provider"}
            ]
        })
        .to_string();
        let (base_url, request, handle) = mock_server(response);
        let models = tauri::async_runtime::block_on(list_models(&base_url, "test-key")).unwrap();
        let request = request.recv().unwrap();
        handle.join().unwrap();

        assert!(request.starts_with("GET /v1/models HTTP/1.1"));
        assert!(request
            .to_ascii_lowercase()
            .contains("authorization: bearer test-key"));
        assert_eq!(
            models
                .iter()
                .map(|model| model.id.as_str())
                .collect::<Vec<_>>(),
            vec!["model-a", "model-b"]
        );
        assert_eq!(
            serde_json::to_value(&models[0]).unwrap()["ownedBy"],
            "provider"
        );
    }

    #[test]
    fn sends_chat_completions_and_parses_structured_drafts() {
        let draft = json!({
            "drafts": [{
                "claimText": "The reported evidence supports a reviewable claim.",
                "claimType": "empirical",
                "epistemicSource": "reported_result",
                "anchorIds": ["anchor-1"],
                "relation": "support",
                "supportType": "reported_result",
                "assumptions": [],
                "scopeConditions": [],
                "limitations": [],
                "confidence": 0.8,
                "confidenceBasis": ["Directly tied to the selected result"],
                "needsHumanAttention": false
            }]
        });
        let response = json!({
            "choices": [{"message": {"content": draft.to_string()}}]
        })
        .to_string();
        let (base_url, request, handle) = mock_server(response);
        let context = generation_context();
        let generated = tauri::async_runtime::block_on(generate_drafts(
            &base_url, "model-a", "test-key", &context,
        ))
        .unwrap();
        let request = request.recv().unwrap();
        handle.join().unwrap();

        assert!(request.starts_with("POST /v1/chat/completions HTTP/1.1"));
        let request_json = request_json(&request);
        assert_eq!(request_json["model"], "model-a");
        assert_eq!(
            request_json["response_format"],
            json!({"type": "json_object"})
        );
        assert_eq!(request_json["max_tokens"], 2_000);
        assert!(request_json.get("json_schema").is_none());
        let system_prompt = request_json["messages"][0]["content"].as_str().unwrap();
        assert!(system_prompt.contains("1–3 drafts"));
        assert!(system_prompt.contains("\"anchorIds\":[\"anchor-1\"]"));
        assert!(system_prompt.contains("\"assumptions\":[]"));
        assert!(system_prompt.contains("\"scopeConditions\":[]"));
        assert!(system_prompt.contains("\"limitations\":[]"));
        assert!(system_prompt
            .contains("\"confidenceBasis\":[\"Directly stated in the selected evidence\"]"));
        assert!(request_json["messages"][1]["content"]
            .as_str()
            .unwrap()
            .contains("anchor-1"));
        assert_eq!(generated.drafts.len(), 1);
        assert_eq!(generated.drafts[0].anchor_ids, vec!["anchor-1"]);
    }

    #[test]
    fn rejects_string_array_fields_before_returning_drafts_for_persistence() {
        let invalid_draft = json!({
            "drafts": [{
                "claimText": "The reported evidence supports a reviewable claim.",
                "claimType": "empirical",
                "epistemicSource": "reported_result",
                "anchorIds": ["anchor-1"],
                "relation": "support",
                "supportType": "reported_result",
                "assumptions": [],
                "scopeConditions": [],
                "limitations": [],
                "confidence": 0.8,
                "confidenceBasis": "Directly tied to the selected result",
                "needsHumanAttention": false
            }]
        });
        let response = json!({
            "choices": [{"message": {"content": invalid_draft.to_string()}}]
        })
        .to_string();
        let (base_url, request, handle) = mock_server(response);

        let result = tauri::async_runtime::block_on(generate_drafts(
            &base_url,
            "model-a",
            "test-key",
            &generation_context(),
        ));
        request.recv().unwrap();
        handle.join().unwrap();

        let error = result.unwrap_err().to_string();
        assert!(error.starts_with("OPENAI_DRAFT_JSON_INVALID:"));
        assert!(error.contains("expected a sequence"));
    }

    #[test]
    fn paper_map_requires_confirmation_before_http_request() {
        let (base_url, listener) = no_request_server();

        let error = tauri::async_runtime::block_on(generate_paper_map(
            &base_url,
            "model-a",
            "test-key",
            false,
            &paper_map_context(),
        ))
        .unwrap_err()
        .to_string();

        assert!(error.starts_with("PAPER_MAP_UPLOAD_CONFIRMATION_REQUIRED:"));
        assert_no_request(listener);
    }

    #[test]
    fn paper_map_request_omits_local_coordinates_and_parses_strict_nodes() {
        let map = json!({
            "nodes": (0..5).map(|index| {
                let kind = ["problem", "method", "result", "limitation", "conclusion"][index];
                json!({
                    "title": format!("Node {index}"),
                    "summary": "An explanatory map node.",
                    "kind": kind,
                    "evidenceGroups": [{"label": "Evidence", "blockIds": ["p0001-b0001"]}]
                })
            }).collect::<Vec<_>>()
        });
        let response = json!({
            "choices": [{"message": {"content": map.to_string()}}]
        })
        .to_string();
        let (base_url, request, handle) = mock_server(response);

        let generated = tauri::async_runtime::block_on(generate_paper_map(
            &base_url,
            "model-a",
            "test-key",
            true,
            &paper_map_context(),
        ))
        .unwrap();
        let request = request.recv().unwrap();
        handle.join().unwrap();
        let request_json = request_json(&request);
        let system_content = request_json["messages"][0]["content"].as_str().unwrap();
        let user_content = request_json["messages"][1]["content"].as_str().unwrap();
        let sent_context: serde_json::Value = serde_json::from_str(user_content).unwrap();
        let sent_block = &sent_context["blocks"][0];

        assert_eq!(generated.nodes.len(), 5);
        assert!(system_content.contains("title, summary, kind, and evidenceGroups[].label"));
        assert!(system_content.contains("never return a fourth blockId"));
        assert!(system_content.contains("at most 3 strings"));
        assert!(system_content.contains("copied character-for-character"));
        assert!(system_content.contains("exact form pNNNN-bNNNN"));
        assert!(system_content.contains("Never append or prepend"));
        assert!(system_content.contains("found verbatim among the supplied input Block ids"));
        assert!(user_content.contains("p0001-b0001"));
        assert_eq!(sent_context.as_object().unwrap().len(), 1);
        assert_eq!(sent_block.as_object().unwrap().len(), 5);
        for field in ["id", "page", "kind", "sectionPath", "text"] {
            assert!(sent_block.get(field).is_some());
        }
        assert!(!user_content.contains("bbox"));
        assert!(!user_content.contains("pdfSha256"));
        assert!(!user_content.contains("filePath"));
        assert_eq!(request_json["max_tokens"], 5_000);
    }

    #[test]
    fn paper_map_rejects_model_supplied_quotes_pages_and_coordinates() {
        let invalid = json!({
            "nodes": [{
                "title": "Node",
                "summary": "Summary",
                "kind": "result",
                "page": 1,
                "evidenceGroups": [{
                    "label": "Evidence",
                    "blockIds": ["p0001-b0001"],
                    "quote": "Model supplied quote",
                    "bbox": [0.1, 0.1, 0.8, 0.2]
                }]
            }]
        });
        let response = json!({
            "choices": [{"message": {"content": invalid.to_string()}}]
        })
        .to_string();
        let (base_url, request, handle) = mock_server(response);

        let result = tauri::async_runtime::block_on(generate_paper_map(
            &base_url,
            "model-a",
            "test-key",
            true,
            &paper_map_context(),
        ));
        request.recv().unwrap();
        handle.join().unwrap();

        assert!(result
            .unwrap_err()
            .to_string()
            .starts_with("PAPER_MAP_JSON_INVALID:"));
    }
}
