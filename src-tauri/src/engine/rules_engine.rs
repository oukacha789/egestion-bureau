use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::path::PathBuf;

use crate::db::models::FileRecord;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct RuleRecord {
    pub id: String,
    pub name: String,
    pub condition_type: String,
    pub condition_value: String,
    pub target_dir: String,
    pub auto_tag: Option<String>,
    pub priority: i64,
    pub enabled: bool,
    pub created_at: i64,
}

pub struct RuleMatch {
    pub rule_id: String,
    pub target_dir: PathBuf,
    pub auto_tag: Option<String>,
}

pub async fn evaluate(record: &FileRecord, pool: &SqlitePool) -> Result<Option<RuleMatch>> {
    let rules: Vec<RuleRecord> = sqlx::query_as(
        "SELECT id, name, condition_type, condition_value, target_dir, auto_tag, priority, enabled, created_at
         FROM rules WHERE enabled = 1 ORDER BY priority DESC, created_at ASC"
    )
    .fetch_all(pool)
    .await?;

    for rule in rules {
        if matches_rule(record, &rule) {
            let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"));
            let target = resolve_target_dir(&rule.target_dir, &home);
            return Ok(Some(RuleMatch {
                rule_id: rule.id,
                target_dir: target,
                auto_tag: rule.auto_tag,
            }));
        }
    }
    Ok(None)
}

fn matches_rule(record: &FileRecord, rule: &RuleRecord) -> bool {
    match rule.condition_type.as_str() {
        "extension" => record
            .extension
            .as_deref()
            .map(|e| e.to_lowercase() == rule.condition_value.to_lowercase().trim_start_matches('.'))
            .unwrap_or(false),
        "name_contains" => record
            .name
            .to_lowercase()
            .contains(&rule.condition_value.to_lowercase()),
        "source" => record
            .source_dir
            .as_deref()
            .map(|s| s.to_lowercase().contains(&rule.condition_value.to_lowercase()))
            .unwrap_or(false),
        _ => false,
    }
}

fn resolve_target_dir(target_dir: &str, home: &PathBuf) -> PathBuf {
    if target_dir.starts_with("~/") {
        home.join(&target_dir[2..])
    } else {
        PathBuf::from(target_dir)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_record(name: &str, ext: &str, source: &str) -> FileRecord {
        FileRecord {
            id: "test".to_string(),
            path: format!("/tmp/{}", name),
            name: name.to_string(),
            extension: Some(ext.to_string()),
            size_bytes: 100,
            hash_sha256: "abc".to_string(),
            created_at: 0,
            modified_at: 0,
            indexed_at: 0,
            category: None,
            subcategory: None,
            confidence: None,
            classifier: None,
            is_duplicate: false,
            duplicate_of: None,
            is_organized: false,
            source_dir: Some(source.to_string()),
        }
    }

    fn make_rule(ctype: &str, cval: &str) -> RuleRecord {
        RuleRecord {
            id: "r1".to_string(),
            name: "test".to_string(),
            condition_type: ctype.to_string(),
            condition_value: cval.to_string(),
            target_dir: "~/Test".to_string(),
            auto_tag: None,
            priority: 0,
            enabled: true,
            created_at: 0,
        }
    }

    #[test]
    fn test_matches_extension() {
        let record = make_record("design.fig", "fig", "desktop");
        let rule = make_rule("extension", "fig");
        assert!(matches_rule(&record, &rule));
    }

    #[test]
    fn test_matches_extension_case_insensitive() {
        let record = make_record("design.FIG", "FIG", "desktop");
        let rule = make_rule("extension", "fig");
        assert!(matches_rule(&record, &rule));
    }

    #[test]
    fn test_extension_strips_leading_dot() {
        let record = make_record("file.pdf", "pdf", "desktop");
        let rule = make_rule("extension", ".pdf");
        assert!(matches_rule(&record, &rule));
    }

    #[test]
    fn test_matches_name_contains() {
        let record = make_record("facture_mai.pdf", "pdf", "downloads");
        let rule = make_rule("name_contains", "facture");
        assert!(matches_rule(&record, &rule));
    }

    #[test]
    fn test_no_match_name_contains() {
        let record = make_record("rapport.pdf", "pdf", "downloads");
        let rule = make_rule("name_contains", "facture");
        assert!(!matches_rule(&record, &rule));
    }

    #[test]
    fn test_matches_source() {
        let record = make_record("archive.zip", "zip", "downloads");
        let rule = make_rule("source", "downloads");
        assert!(matches_rule(&record, &rule));
    }

    #[test]
    fn test_resolve_tilde_path() {
        let home = PathBuf::from("/Users/test");
        let result = resolve_target_dir("~/Documents/Finance", &home);
        assert_eq!(result, PathBuf::from("/Users/test/Documents/Finance"));
    }

    #[test]
    fn test_no_match_wrong_extension() {
        let record = make_record("file.png", "png", "desktop");
        let rule = make_rule("extension", "pdf");
        assert!(!matches_rule(&record, &rule));
    }

    #[tokio::test]
    async fn test_evaluate_returns_match_from_db() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();

        sqlx::query(
            "INSERT INTO rules (id, name, condition_type, condition_value, target_dir, auto_tag, priority, enabled, created_at)
             VALUES ('r1', 'Figma', 'extension', 'fig', '~/Design', 'design', 0, 1, 0)"
        )
        .execute(&pool)
        .await
        .unwrap();

        let record = FileRecord {
            id: "f1".to_string(),
            path: "/tmp/logo.fig".to_string(),
            name: "logo.fig".to_string(),
            extension: Some("fig".to_string()),
            size_bytes: 100,
            hash_sha256: "abc".to_string(),
            created_at: 0,
            modified_at: 0,
            indexed_at: 0,
            category: None,
            subcategory: None,
            confidence: None,
            classifier: None,
            is_duplicate: false,
            duplicate_of: None,
            is_organized: false,
            source_dir: Some("desktop".to_string()),
        };

        let result = evaluate(&record, &pool).await.unwrap();
        assert!(result.is_some());
        let m = result.unwrap();
        assert_eq!(m.rule_id, "r1");
        assert_eq!(m.auto_tag, Some("design".to_string()));
    }

    #[tokio::test]
    async fn test_evaluate_no_match_returns_none() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();

        let record = FileRecord {
            id: "f1".to_string(),
            path: "/tmp/photo.jpg".to_string(),
            name: "photo.jpg".to_string(),
            extension: Some("jpg".to_string()),
            size_bytes: 100,
            hash_sha256: "abc".to_string(),
            created_at: 0,
            modified_at: 0,
            indexed_at: 0,
            category: None,
            subcategory: None,
            confidence: None,
            classifier: None,
            is_duplicate: false,
            duplicate_of: None,
            is_organized: false,
            source_dir: Some("desktop".to_string()),
        };

        let result = evaluate(&record, &pool).await.unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_evaluate_disabled_rule_not_matched() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();

        sqlx::query(
            "INSERT INTO rules (id, name, condition_type, condition_value, target_dir, auto_tag, priority, enabled, created_at)
             VALUES ('r1', 'Disabled', 'extension', 'fig', '~/Design', NULL, 0, 0, 0)"
        )
        .execute(&pool)
        .await
        .unwrap();

        let record = FileRecord {
            id: "f1".to_string(),
            path: "/tmp/logo.fig".to_string(),
            name: "logo.fig".to_string(),
            extension: Some("fig".to_string()),
            size_bytes: 100,
            hash_sha256: "abc".to_string(),
            created_at: 0,
            modified_at: 0,
            indexed_at: 0,
            category: None,
            subcategory: None,
            confidence: None,
            classifier: None,
            is_duplicate: false,
            duplicate_of: None,
            is_organized: false,
            source_dir: Some("desktop".to_string()),
        };

        let result = evaluate(&record, &pool).await.unwrap();
        assert!(result.is_none(), "Disabled rule must not match");
    }
}
