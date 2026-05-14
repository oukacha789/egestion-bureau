CREATE TABLE IF NOT EXISTS rules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    condition_type TEXT NOT NULL,
    condition_value TEXT NOT NULL,
    target_dir TEXT NOT NULL,
    auto_tag TEXT,
    priority INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
);
