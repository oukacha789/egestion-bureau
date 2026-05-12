-- Phase 2: Corrections table for tracking manual classification corrections
CREATE TABLE IF NOT EXISTS corrections (
    id           TEXT PRIMARY KEY,
    file_id      TEXT REFERENCES files(id) ON DELETE SET NULL,
    old_category TEXT NOT NULL,
    new_category TEXT NOT NULL,
    corrected_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_corrections_file ON corrections(file_id);
