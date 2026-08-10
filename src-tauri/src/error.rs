use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("WORKSPACE_IO: {0}")]
    Io(#[from] std::io::Error),
    #[error("WORKSPACE_DATABASE: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("WORKSPACE_SERIALIZATION: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("{code}: {message}")]
    Policy { code: &'static str, message: String },
}

impl AppError {
    pub fn policy(code: &'static str, message: impl Into<String>) -> Self {
        Self::Policy {
            code,
            message: message.into(),
        }
    }
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
