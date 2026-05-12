use anyhow::Result;
use tantivy::{
    schema::{Field, Schema, Value, FAST, INDEXED, STORED, STRING, TEXT},
    Index, IndexWriter, IndexReader, TantivyDocument, Term,
};
#[cfg(test)]
use tantivy::directory::RamDirectory;
use serde::Serialize;
use crate::db::models::FileRecord;

pub struct SearchIndex {
    index: Index,
    writer: IndexWriter,
    reader: IndexReader,
    pub id_field: Field,
    pub name_field: Field,
    pub path_field: Field,
    pub category_field: Field,
    pub subcategory_field: Field,
    pub tags_field: Field,
    pub year_field: Field,
}

#[derive(Debug, Serialize, Clone)]
pub struct SearchResult {
    pub id: String,
    pub name: String,
    pub path: String,
    pub category: String,
    pub subcategory: String,
    pub tags: Vec<String>,
    pub year: u64,
    pub score: f32,
}

impl SearchIndex {
    fn build_schema() -> (Schema, Field, Field, Field, Field, Field, Field, Field) {
        let mut b = Schema::builder();
        let id_field       = b.add_text_field("id",          STRING | STORED);
        let name_field     = b.add_text_field("name",        TEXT | STORED);
        let path_field     = b.add_text_field("path",        STORED);
        let category_field = b.add_text_field("category",    STRING | STORED);
        let sub_field      = b.add_text_field("subcategory", TEXT | STORED);
        let tags_field     = b.add_text_field("tags",        TEXT | STORED);
        let year_field     = b.add_u64_field("year",         STORED | INDEXED | FAST);
        (b.build(), id_field, name_field, path_field, category_field, sub_field, tags_field, year_field)
    }

    pub fn open_or_create(index_path: &std::path::Path) -> Result<Self> {
        let (schema, id_field, name_field, path_field, category_field, subcategory_field, tags_field, year_field) =
            Self::build_schema();
        std::fs::create_dir_all(index_path)?;
        let dir = tantivy::directory::MmapDirectory::open(index_path)?;
        let index = Index::open_or_create(dir, schema)?;
        let writer = index.writer(50_000_000)?;
        let reader = index.reader()?;
        Ok(Self { index, writer, reader, id_field, name_field, path_field, category_field, subcategory_field, tags_field, year_field })
    }

    #[cfg(test)]
    pub fn in_memory() -> Result<Self> {
        let (schema, id_field, name_field, path_field, category_field, subcategory_field, tags_field, year_field) =
            Self::build_schema();
        let dir = RamDirectory::create();
        let index = Index::open_or_create(dir, schema)?;
        let writer = index.writer(50_000_000)?;
        let reader = index.reader()?;
        Ok(Self { index, writer, reader, id_field, name_field, path_field, category_field, subcategory_field, tags_field, year_field })
    }

    fn timestamp_to_year(ts: i64) -> u64 {
        chrono::DateTime::from_timestamp(ts, 0)
            .map(|dt: chrono::DateTime<chrono::Utc>| {
                use chrono::Datelike;
                dt.year() as u64
            })
            .unwrap_or(2024)
    }

    pub fn index_document(&mut self, record: &FileRecord, tags: &[String]) -> Result<()> {
        // Delete existing entry for this file (update = delete + add)
        self.writer.delete_term(Term::from_field_text(self.id_field, &record.id));

        let mut doc = TantivyDocument::default();
        doc.add_text(self.id_field, &record.id);
        doc.add_text(self.name_field, &record.name);
        doc.add_text(self.path_field, &record.path);
        doc.add_text(self.category_field, record.category.as_deref().unwrap_or("other"));
        doc.add_text(self.subcategory_field, record.subcategory.as_deref().unwrap_or(""));
        for tag in tags {
            doc.add_text(self.tags_field, tag);
        }
        doc.add_u64(self.year_field, Self::timestamp_to_year(record.created_at));

        self.writer.add_document(doc)?;
        self.writer.commit()?;
        self.reader.reload()?;
        Ok(())
    }

    pub fn delete_document(&mut self, file_id: &str) -> Result<()> {
        self.writer.delete_term(Term::from_field_text(self.id_field, file_id));
        self.writer.commit()?;
        self.reader.reload()?;
        Ok(())
    }

    pub fn search(&self, query: &str, limit: usize, category: Option<&str>) -> Result<Vec<SearchResult>> {
        use tantivy::{collector::TopDocs, query::QueryParser};

        let searcher = self.reader.searcher();
        let query_parser = QueryParser::for_index(
            &self.index,
            vec![self.name_field, self.subcategory_field, self.tags_field],
        );

        let parsed = query_parser.parse_query(query).unwrap_or_else(|_| {
            query_parser.parse_query_lenient(query).0
        });

        let top_docs = searcher.search(&parsed, &TopDocs::with_limit(limit * 3))?;

        let mut results = Vec::new();
        for (score, addr) in top_docs {
            let doc: TantivyDocument = searcher.doc(addr)?;
            let id = doc.get_first(self.id_field).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let cat = doc.get_first(self.category_field).and_then(|v| v.as_str()).unwrap_or("").to_string();

            if let Some(filter) = category {
                if cat != filter {
                    continue;
                }
            }

            let tags: Vec<String> = doc.get_all(self.tags_field)
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect();

            results.push(SearchResult {
                id,
                name: doc.get_first(self.name_field).and_then(|v| v.as_str()).unwrap_or("").to_string(),
                path: doc.get_first(self.path_field).and_then(|v| v.as_str()).unwrap_or("").to_string(),
                category: cat,
                subcategory: doc.get_first(self.subcategory_field).and_then(|v| v.as_str()).unwrap_or("").to_string(),
                tags,
                year: doc.get_first(self.year_field).and_then(|v| v.as_u64()).unwrap_or(0),
                score,
            });

            if results.len() == limit {
                break;
            }
        }
        Ok(results)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_open_in_memory() {
        let idx = SearchIndex::in_memory();
        assert!(idx.is_ok());
    }

    #[test]
    fn test_index_and_search_finds_document() {
        let mut idx = SearchIndex::in_memory().unwrap();
        let record = make_test_record("file-1", "rapport_annuel.pdf", "document", "Factures", 1704067200);
        idx.index_document(&record, &["facture".to_string()]).unwrap();
        let results = idx.search("rapport", 10, None).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "file-1");
    }

    #[test]
    fn test_delete_document_removes_from_search() {
        let mut idx = SearchIndex::in_memory().unwrap();
        let record = make_test_record("file-2", "old_file.pdf", "document", "Divers", 1704067200);
        idx.index_document(&record, &[]).unwrap();
        // Verify document IS found before deletion
        let before = idx.search("old", 10, None).unwrap(); // use "old" which is a single token
        assert_eq!(before.len(), 1, "Document should be found before deletion");
        idx.delete_document("file-2").unwrap();
        let results = idx.search("old", 10, None).unwrap();
        assert!(results.is_empty(), "Document should be gone after deletion");
    }

    #[test]
    fn test_search_with_category_filter() {
        let mut idx = SearchIndex::in_memory().unwrap();
        let r1 = make_test_record("file-3", "photo_vacances.jpg", "photo", "Vacances", 1704067200);
        let r2 = make_test_record("file-4", "doc_vacances.pdf", "document", "Divers", 1704067200);
        idx.index_document(&r1, &[]).unwrap();
        idx.index_document(&r2, &[]).unwrap();
        let results = idx.search("vacances", 10, Some("photo")).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "file-3");
    }

    fn make_test_record(id: &str, name: &str, category: &str, subcategory: &str, ts: i64) -> FileRecord {
        FileRecord {
            id: id.to_string(),
            path: format!("/Egestion/{}/{}", category, name),
            name: name.to_string(),
            extension: name.split('.').last().map(|s| s.to_string()),
            size_bytes: 1024,
            hash_sha256: format!("hash_{}", id),
            created_at: ts,
            modified_at: ts,
            indexed_at: ts,
            category: Some(category.to_string()),
            subcategory: Some(subcategory.to_string()),
            confidence: Some(0.95),
            classifier: Some("rule".to_string()),
            is_duplicate: false,
            duplicate_of: None,
            is_organized: true,
            source_dir: Some("desktop".to_string()),
        }
    }
}
