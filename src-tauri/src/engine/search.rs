use anyhow::Result;
use tantivy::{
    schema::{Field, Schema, FAST, INDEXED, STORED, STRING, TEXT},
    Index, IndexWriter, IndexReader,
};
#[cfg(test)]
use tantivy::directory::RamDirectory;
use serde::Serialize;

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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_open_in_memory() {
        let idx = SearchIndex::in_memory();
        assert!(idx.is_ok());
    }
}
