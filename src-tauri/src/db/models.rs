use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct FileRecord {
    pub id: String,
    pub path: String,
    pub name: String,
    pub extension: Option<String>,
    pub size_bytes: i64,
    pub hash_sha256: String,
    pub created_at: i64,
    pub modified_at: i64,
    pub indexed_at: i64,
    pub category: Option<String>,
    pub subcategory: Option<String>,
    pub confidence: Option<f64>,
    pub classifier: Option<String>,
    pub is_duplicate: bool,
    pub duplicate_of: Option<String>,
    pub is_organized: bool,
    pub source_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ActionRecord {
    pub id: String,
    pub file_id: Option<String>,
    pub action_type: String,
    pub path_before: Option<String>,
    pub path_after: Option<String>,
    pub executed_at: i64,
    pub undone_at: Option<i64>,
    pub undoable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AiCacheRecord {
    pub hash_sha256: String,
    pub response: String,
    pub model: String,
    pub cached_at: i64,
    pub expires_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct TagRecord {
    pub id: String,
    pub file_id: String,
    pub tag: String,
    pub source: String,
    pub weight: f64,
}
