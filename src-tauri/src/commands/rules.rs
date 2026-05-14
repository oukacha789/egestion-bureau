use crate::engine::rules_engine::RuleRecord;
use crate::AppState;
use chrono::Utc;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub async fn get_rules(state: State<'_, AppState>) -> Result<Vec<RuleRecord>, String> {
    sqlx::query_as::<_, RuleRecord>(
        "SELECT id, name, condition_type, condition_value, target_dir, auto_tag, priority, enabled, created_at
         FROM rules ORDER BY priority DESC, created_at ASC"
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_rule(
    name: String,
    condition_type: String,
    condition_value: String,
    target_dir: String,
    auto_tag: Option<String>,
    state: State<'_, AppState>,
) -> Result<RuleRecord, String> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();
    sqlx::query(
        "INSERT INTO rules (id, name, condition_type, condition_value, target_dir, auto_tag, priority, enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?)"
    )
    .bind(&id)
    .bind(&name)
    .bind(&condition_type)
    .bind(&condition_value)
    .bind(&target_dir)
    .bind(&auto_tag)
    .bind(now)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query_as::<_, RuleRecord>(
        "SELECT id, name, condition_type, condition_value, target_dir, auto_tag, priority, enabled, created_at
         FROM rules WHERE id = ?"
    )
    .bind(&id)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_rule(id: String, state: State<'_, AppState>) -> Result<(), String> {
    sqlx::query("DELETE FROM rules WHERE id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn toggle_rule(id: String, state: State<'_, AppState>) -> Result<RuleRecord, String> {
    sqlx::query(
        "UPDATE rules SET enabled = CASE WHEN enabled = 1 THEN 0 ELSE 1 END WHERE id = ?"
    )
    .bind(&id)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query_as::<_, RuleRecord>(
        "SELECT id, name, condition_type, condition_value, target_dir, auto_tag, priority, enabled, created_at
         FROM rules WHERE id = ?"
    )
    .bind(&id)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::SqlitePool;

    async fn make_db() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn test_create_and_get_rule() {
        let pool = make_db().await;
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().timestamp();
        sqlx::query(
            "INSERT INTO rules (id, name, condition_type, condition_value, target_dir, auto_tag, priority, enabled, created_at)
             VALUES (?, 'Figma', 'extension', 'fig', '~/Design', 'design', 0, 1, ?)"
        )
        .bind(&id)
        .bind(now)
        .execute(&pool)
        .await
        .unwrap();

        let rules: Vec<RuleRecord> = sqlx::query_as(
            "SELECT id, name, condition_type, condition_value, target_dir, auto_tag, priority, enabled, created_at FROM rules"
        )
        .fetch_all(&pool)
        .await
        .unwrap();

        assert_eq!(rules.len(), 1);
        assert_eq!(rules[0].name, "Figma");
        assert_eq!(rules[0].condition_type, "extension");
        assert_eq!(rules[0].auto_tag, Some("design".to_string()));
        assert!(rules[0].enabled);
    }

    #[tokio::test]
    async fn test_delete_rule() {
        let pool = make_db().await;
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().timestamp();
        sqlx::query(
            "INSERT INTO rules (id, name, condition_type, condition_value, target_dir, auto_tag, priority, enabled, created_at)
             VALUES (?, 'Test', 'extension', 'pdf', '~/Docs', NULL, 0, 1, ?)"
        )
        .bind(&id)
        .bind(now)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query("DELETE FROM rules WHERE id = ?")
            .bind(&id)
            .execute(&pool)
            .await
            .unwrap();

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM rules")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 0);
    }

    #[tokio::test]
    async fn test_toggle_rule_disables() {
        let pool = make_db().await;
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().timestamp();
        sqlx::query(
            "INSERT INTO rules (id, name, condition_type, condition_value, target_dir, auto_tag, priority, enabled, created_at)
             VALUES (?, 'Test', 'extension', 'pdf', '~/Docs', NULL, 0, 1, ?)"
        )
        .bind(&id)
        .bind(now)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query("UPDATE rules SET enabled = CASE WHEN enabled = 1 THEN 0 ELSE 1 END WHERE id = ?")
            .bind(&id)
            .execute(&pool)
            .await
            .unwrap();

        let enabled: bool = sqlx::query_scalar("SELECT enabled FROM rules WHERE id = ?")
            .bind(&id)
            .fetch_one(&pool)
            .await
            .unwrap();

        assert!(!enabled);
    }
}
