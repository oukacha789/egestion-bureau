use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum AppEvent {
    FileDetected(FileDetectedPayload),
    FileIndexed(FileIndexedPayload),
    FileClassified(FileClassifiedPayload),
    FileOrganized(FileOrganizedPayload),
    FileDuplicate(FileDuplicatePayload),
    Error(ErrorPayload),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDetectedPayload {
    pub path: String,
    pub source_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileIndexedPayload {
    pub file_id: String,
    pub path: String,
    pub hash_sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileClassifiedPayload {
    pub file_id: String,
    pub category: String,
    pub subcategory: Option<String>,
    pub confidence: f64,
    pub classifier: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileOrganizedPayload {
    pub action_id: String,
    pub file_id: String,
    pub name: String,
    pub path_before: String,
    pub path_after: String,
    pub category: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDuplicatePayload {
    pub file_id: String,
    pub path: String,
    pub duplicate_of_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorPayload {
    pub message: String,
    pub path: Option<String>,
}
