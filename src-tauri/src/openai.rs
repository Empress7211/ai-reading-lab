use std::time::Duration;

use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};

use crate::error::AppError;

pub const CREDENTIAL_REF: &str = "keychain://com.paperweave.desktop/openai-compatible";
#[cfg(target_os = "macos")]
const KEYCHAIN_SERVICE: &str = "com.paperweave.desktop";
#[cfg(target_os = "macos")]
const KEYCHAIN_ACCOUNT: &str = "openai-compatible";
#[cfg(target_os = "macos")]
const ITEM_NOT_FOUND: i32 = -25300;

pub trait CredentialStore {
    fn load(&self) -> Result<Option<String>, AppError>;
    fn save(&self, api_key: &str) -> Result<(), AppError>;
    fn delete(&self) -> Result<(), AppError>;
}

pub struct MacOsKeychainStore;

#[cfg(target_os = "macos")]
impl CredentialStore for MacOsKeychainStore {
    fn load(&self) -> Result<Option<String>, AppError> {
        match security_framework::passwords::get_generic_password(
            KEYCHAIN_SERVICE,
            KEYCHAIN_ACCOUNT,
        ) {
            Ok(bytes) => String::from_utf8(bytes).map(Some).map_err(|_| {
                AppError::policy(
                    "KEYCHAIN_VALUE_INVALID",
                    "Keychain 中的 API Key 不是有效 UTF-8 文本",
                )
            }),
            Err(error) if error.code() == ITEM_NOT_FOUND => Ok(None),
            Err(error) => Err(AppError::policy(
                "KEYCHAIN_READ_FAILED",
                format!("无法从 macOS Keychain 读取 API Key：{error}"),
            )),
        }
    }

    fn save(&self, api_key: &str) -> Result<(), AppError> {
        let normalized = api_key.trim();
        if normalized.is_empty() {
            return Err(AppError::policy(
                "OPENAI_API_KEY_REQUIRED",
                "API Key 不能为空",
            ));
        }
        security_framework::passwords::set_generic_password(
            KEYCHAIN_SERVICE,
            KEYCHAIN_ACCOUNT,
            normalized.as_bytes(),
        )
        .map_err(|error| {
            AppError::policy(
                "KEYCHAIN_WRITE_FAILED",
                format!("无法写入 macOS Keychain：{error}"),
            )
        })
    }

    fn delete(&self) -> Result<(), AppError> {
        match security_framework::passwords::delete_generic_password(
            KEYCHAIN_SERVICE,
            KEYCHAIN_ACCOUNT,
        ) {
            Ok(()) => Ok(()),
            Err(error) if error.code() == ITEM_NOT_FOUND => Ok(()),
            Err(error) => Err(AppError::policy(
                "KEYCHAIN_DELETE_FAILED",
                format!("无法从 macOS Keychain 删除 API Key：{error}"),
            )),
        }
    }
}

#[cfg(not(target_os = "macos"))]
impl CredentialStore for MacOsKeychainStore {
    fn load(&self) -> Result<Option<String>, AppError> {
        Err(AppError::policy(
            "KEYCHAIN_UNAVAILABLE",
            "API Key 存储仅支持 PaperWeave macOS 应用",
        ))
    }

    fn save(&self, _api_key: &str) -> Result<(), AppError> {
        Err(AppError::policy(
            "KEYCHAIN_UNAVAILABLE",
            "API Key 存储仅支持 PaperWeave macOS 应用",
        ))
    }

    fn delete(&self) -> Result<(), AppError> {
        Err(AppError::policy(
            "KEYCHAIN_UNAVAILABLE",
            "API Key 存储仅支持 PaperWeave macOS 应用",
        ))
    }
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
            "尚未在 macOS Keychain 中配置 API Key",
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

#[derive(Serialize)]
struct ChatMessage {
    role: &'static str,
    content: String,
}

#[derive(Serialize)]
struct ChatCompletionRequest {
    model: String,
    messages: Vec<ChatMessage>,
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
Return JSON only, with this exact top-level shape: {"drafts":[...]}.
Each draft must contain claimText, claimType, epistemicSource, anchorIds, relation, supportType, assumptions, scopeConditions, limitations, confidence, confidenceBasis, needsHumanAttention.
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

#[cfg(test)]
mod tests {
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::mpsc::{self, Receiver};
    use std::thread;

    use serde_json::json;

    use super::{
        generate_drafts, list_models, normalize_base_url, GenerationAnchor, GenerationContext,
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
        let context = GenerationContext {
            paper_title: "Evidence first".to_owned(),
            anchors: vec![GenerationAnchor {
                id: "anchor-1".to_owned(),
                page_index: 0,
                selected_text: "A selected reported result.".to_owned(),
            }],
        };
        let generated = tauri::async_runtime::block_on(generate_drafts(
            &base_url, "model-a", "test-key", &context,
        ))
        .unwrap();
        let request = request.recv().unwrap();
        handle.join().unwrap();

        assert!(request.starts_with("POST /v1/chat/completions HTTP/1.1"));
        assert!(request.contains("\"model\":\"model-a\""));
        assert!(request.contains("anchor-1"));
        assert_eq!(generated.drafts.len(), 1);
        assert_eq!(generated.drafts[0].anchor_ids, vec!["anchor-1"]);
    }
}
