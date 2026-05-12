CREATE TABLE IF NOT EXISTS files (
    id            TEXT PRIMARY KEY,
    path          TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    extension     TEXT,
    size_bytes    INTEGER NOT NULL,
    hash_sha256   TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    modified_at   INTEGER NOT NULL,
    indexed_at    INTEGER NOT NULL,
    category      TEXT,
    subcategory   TEXT,
    confidence    REAL,
    classifier    TEXT,
    is_duplicate  INTEGER NOT NULL DEFAULT 0,
    duplicate_of  TEXT REFERENCES files(id),
    is_organized  INTEGER NOT NULL DEFAULT 0,
    source_dir    TEXT
);

CREATE TABLE IF NOT EXISTS tags (
    id       TEXT PRIMARY KEY,
    file_id  TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    tag      TEXT NOT NULL,
    source   TEXT NOT NULL,
    weight   REAL NOT NULL DEFAULT 1.0
);

CREATE INDEX IF NOT EXISTS idx_tags_file ON tags(file_id);
CREATE INDEX IF NOT EXISTS idx_tags_tag  ON tags(tag);

CREATE TABLE IF NOT EXISTS actions (
    id           TEXT PRIMARY KEY,
    file_id      TEXT REFERENCES files(id),
    action_type  TEXT NOT NULL,
    path_before  TEXT,
    path_after   TEXT,
    executed_at  INTEGER NOT NULL,
    undone_at    INTEGER,
    undoable     INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_actions_executed ON actions(executed_at DESC);

CREATE TABLE IF NOT EXISTS ai_cache (
    hash_sha256   TEXT PRIMARY KEY,
    response      TEXT NOT NULL,
    model         TEXT NOT NULL,
    cached_at     INTEGER NOT NULL,
    expires_at    INTEGER NOT NULL
);
