use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportFilters {
    pub category: Option<String>,
    pub tags: Vec<String>,
    pub date_from: Option<i64>,
    pub date_to: Option<i64>,
}

pub async fn build_csv(filters: &ExportFilters, pool: &SqlitePool) -> Result<String> {
    let mut conditions = vec!["is_organized = 1".to_string()];
    if let Some(ref cat) = filters.category {
        conditions.push(format!("category = '{}'", cat.replace('\'', "''")));
    }
    if let Some(from) = filters.date_from {
        conditions.push(format!("modified_at >= {}", from));
    }
    if let Some(to) = filters.date_to {
        conditions.push(format!("modified_at <= {}", to));
    }

    let where_clause = conditions.join(" AND ");
    let sql = format!(
        "SELECT id, path, name, extension, size_bytes, hash_sha256, created_at, modified_at, \
         indexed_at, category, subcategory, confidence, classifier, is_duplicate, duplicate_of, \
         is_organized, source_dir FROM files WHERE {} ORDER BY modified_at DESC LIMIT 10000",
        where_clause
    );

    let rows = sqlx::query(&sql).fetch_all(pool).await?;

    let mut csv = String::from("name,path,category,subcategory,tags,size_bytes,modified_at,confidence\n");

    for row in &rows {
        use sqlx::Row;
        let file_id: String = row.try_get("id").unwrap_or_default();
        let name: String = row.try_get("name").unwrap_or_default();
        let path: String = row.try_get("path").unwrap_or_default();
        let category: String = row.try_get::<Option<String>, _>("category").unwrap_or(None).unwrap_or_default();
        let subcategory: String = row.try_get::<Option<String>, _>("subcategory").unwrap_or(None).unwrap_or_default();
        let size_bytes: i64 = row.try_get("size_bytes").unwrap_or(0);
        let modified_at: i64 = row.try_get("modified_at").unwrap_or(0);
        let confidence: Option<f64> = row.try_get("confidence").unwrap_or(None);

        let tags: Vec<String> = sqlx::query_scalar::<_, String>(
            "SELECT tag FROM tags WHERE file_id = ? ORDER BY weight DESC"
        )
        .bind(&file_id)
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        let tags_str = tags.join("|");
        let conf_str = confidence.map(|c| format!("{:.2}", c)).unwrap_or_default();

        csv.push_str(&format!(
            "{},{},{},{},{},{},{},{}\n",
            csv_escape(&name),
            csv_escape(&path),
            csv_escape(&category),
            csv_escape(&subcategory),
            csv_escape(&tags_str),
            size_bytes,
            modified_at,
            conf_str,
        ));
    }

    Ok(csv)
}

fn csv_escape(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

pub async fn build_report(pool: &SqlitePool) -> Result<String> {
    // Stats par catégorie
    let cats: Vec<(String, i64)> = sqlx::query_as::<_, (String, i64)>(
        "SELECT category, COUNT(*) as cnt FROM files WHERE is_organized = 1 AND category IS NOT NULL GROUP BY category ORDER BY cnt DESC"
    )
    .fetch_all(pool)
    .await?;

    // Top 10 tags
    let top_tags: Vec<(String, i64)> = sqlx::query_as::<_, (String, i64)>(
        "SELECT tag, COUNT(*) as cnt FROM tags GROUP BY tag ORDER BY cnt DESC LIMIT 10"
    )
    .fetch_all(pool)
    .await?;

    // 30 dernières actions
    let actions: Vec<(String, Option<String>, i64)> = sqlx::query_as::<_, (String, Option<String>, i64)>(
        "SELECT action_type, path_after, executed_at FROM actions WHERE undone_at IS NULL ORDER BY executed_at DESC LIMIT 30"
    )
    .fetch_all(pool)
    .await?;

    // Doublons
    let (dup_count, dup_size): (i64, i64) = sqlx::query_as::<_, (i64, i64)>(
        "SELECT COUNT(*), COALESCE(SUM(size_bytes), 0) FROM files WHERE is_duplicate = 1"
    )
    .fetch_one(pool)
    .await
    .unwrap_or((0, 0));

    let now: DateTime<Utc> = Utc::now();
    let max_count = cats.iter().map(|(_, c)| *c).max().unwrap_or(1).max(1);

    // SVG bar chart
    let bar_width = 300i64;
    let bar_height = 20i64;
    let gap = 6i64;
    let svg_height = (bar_height + gap) * cats.len() as i64;

    let color_bar = "#6366f1";
    let color_label = "#a1a1aa";
    let mut bars = String::new();
    for (i, (cat, count)) in cats.iter().enumerate() {
        let y = i as i64 * (bar_height + gap);
        let w = (count * bar_width) / max_count;
        let mid_y = y + bar_height / 2;
        let text_x = 100 + w + 6;
        bars.push_str(&format!(
            "<rect x=\"100\" y=\"{y}\" width=\"{w}\" height=\"{bar_height}\" fill=\"{color_bar}\" rx=\"3\"/>\n\
             <text x=\"95\" y=\"{mid_y}\" font-size=\"11\" fill=\"{color_label}\" text-anchor=\"end\" dominant-baseline=\"middle\">{cat}</text>\n\
             <text x=\"{text_x}\" y=\"{mid_y}\" font-size=\"10\" fill=\"{color_bar}\" dominant-baseline=\"middle\">{count}</text>\n"
        ));
    }

    let actions_rows: String = actions
        .iter()
        .map(|(atype, path, ts)| {
            let dt = DateTime::from_timestamp(*ts, 0)
                .unwrap_or(DateTime::UNIX_EPOCH)
                .format("%d/%m/%Y %H:%M")
                .to_string();
            let path_str = path.as_deref().unwrap_or("—");
            format!("<tr><td>{dt}</td><td>{atype}</td><td title=\"{path_str}\">{}</td></tr>",
                path_str.rsplit('/').next().unwrap_or(path_str))
        })
        .collect();

    let tag_rows: String = top_tags
        .iter()
        .map(|(tag, cnt)| format!("<tr><td>{tag}</td><td>{cnt}</td></tr>"))
        .collect();

    let html = format!(r#"<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Rapport Egestion — {now_fmt}</title>
<style>
  body {{ font-family: -apple-system, sans-serif; background: #18181b; color: #e4e4e7; margin: 0; padding: 2rem; }}
  h1 {{ color: #f4f4f5; font-size: 1.5rem; margin-bottom: 0.25rem; }}
  .subtitle {{ color: #71717a; font-size: 0.875rem; margin-bottom: 2rem; }}
  h2 {{ color: #a1a1aa; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2rem; margin-bottom: 1rem; }}
  .card {{ background: #27272a; border-radius: 0.75rem; padding: 1.5rem; margin-bottom: 1.5rem; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 0.8125rem; }}
  td, th {{ padding: 0.5rem 0.75rem; border-bottom: 1px solid #3f3f46; text-align: left; }}
  th {{ color: #71717a; font-weight: 500; }}
  .dup-box {{ display: flex; gap: 2rem; }}
  .dup-stat {{ text-align: center; }}
  .dup-stat .num {{ font-size: 2rem; font-weight: 700; color: #f87171; }}
  .dup-stat .lbl {{ font-size: 0.75rem; color: #71717a; }}
</style>
</head>
<body>
<h1>Rapport Egestion</h1>
<p class="subtitle">Généré le {now_fmt}</p>

<h2>Fichiers par catégorie</h2>
<div class="card">
<svg width="500" height="{svg_height}" xmlns="http://www.w3.org/2000/svg">{bars}</svg>
</div>

<h2>Top 10 tags</h2>
<div class="card">
<table>
<thead><tr><th>Tag</th><th>Occurrences</th></tr></thead>
<tbody>{tag_rows}</tbody>
</table>
</div>

<h2>Doublons détectés</h2>
<div class="card">
<div class="dup-box">
  <div class="dup-stat"><div class="num">{dup_count}</div><div class="lbl">fichiers en doublon</div></div>
  <div class="dup-stat"><div class="num">{dup_size_fmt}</div><div class="lbl">espace potentiellement libérable</div></div>
</div>
</div>

<h2>30 dernières actions</h2>
<div class="card">
<table>
<thead><tr><th>Date</th><th>Action</th><th>Fichier</th></tr></thead>
<tbody>{actions_rows}</tbody>
</table>
</div>
</body>
</html>"#,
        now_fmt = now.format("%d/%m/%Y à %H:%M").to_string(),
        svg_height = svg_height.max(20),
        bars = bars,
        tag_rows = tag_rows,
        dup_count = dup_count,
        dup_size_fmt = format_bytes(dup_size),
        actions_rows = actions_rows,
    );

    Ok(html)
}

fn format_bytes(b: i64) -> String {
    if b < 1024 { format!("{} o", b) }
    else if b < 1024 * 1024 { format!("{} Ko", b / 1024) }
    else { format!("{:.1} Mo", b as f64 / 1_048_576.0) }
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
    async fn test_build_csv_has_header() {
        let pool = make_db().await;
        let filters = ExportFilters { category: None, tags: vec![], date_from: None, date_to: None };
        let csv = build_csv(&filters, &pool).await.unwrap();
        assert!(csv.starts_with("name,path,category,subcategory,tags,size_bytes,modified_at,confidence\n"));
    }

    #[tokio::test]
    async fn test_build_csv_empty_db_only_header() {
        let pool = make_db().await;
        let filters = ExportFilters { category: None, tags: vec![], date_from: None, date_to: None };
        let csv = build_csv(&filters, &pool).await.unwrap();
        assert_eq!(csv.lines().count(), 1); // only header
    }

    #[tokio::test]
    async fn test_build_report_is_valid_html() {
        let pool = make_db().await;
        let html = build_report(&pool).await.unwrap();
        assert!(html.contains("<!DOCTYPE html>"));
        assert!(html.contains("Rapport Egestion"));
        assert!(html.contains("</html>"));
    }

    #[test]
    fn test_csv_escape_wraps_comma() {
        assert_eq!(csv_escape("a,b"), "\"a,b\"");
    }

    #[test]
    fn test_csv_escape_plain_unchanged() {
        assert_eq!(csv_escape("hello"), "hello");
    }
}
