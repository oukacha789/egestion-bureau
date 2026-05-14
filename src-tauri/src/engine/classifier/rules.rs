use std::path::Path;

#[derive(Debug, Clone)]
pub struct ClassificationResult {
    pub category: String,
    pub subcategory: Option<String>,
    pub confidence: f64,
    pub tags: Vec<String>,
}

const EXTENSION_MAP: &[(&str, &str)] = &[
    ("jpg", "photo"), ("jpeg", "photo"), ("png", "photo"),
    ("heic", "photo"), ("raw", "photo"), ("dng", "photo"),
    ("gif", "photo"), ("webp", "photo"), ("bmp", "photo"),
    ("tiff", "photo"), ("tif", "photo"),
    ("mp4", "video"), ("mov", "video"), ("avi", "video"),
    ("mkv", "video"), ("m4v", "video"), ("wmv", "video"),
    ("flv", "video"), ("webm", "video"),
    ("mp3", "music"), ("flac", "music"), ("aac", "music"),
    ("wav", "music"), ("ogg", "music"), ("m4a", "music"),
    ("aiff", "music"), ("wma", "music"),
    ("pdf", "document"), ("docx", "document"), ("doc", "document"),
    ("xlsx", "document"), ("xls", "document"),
    ("pptx", "document"), ("ppt", "document"),
    ("txt", "document"), ("md", "document"), ("rtf", "document"),
    ("pages", "document"), ("numbers", "document"), ("key", "document"),
    ("zip", "archive"), ("tar", "archive"), ("gz", "archive"),
    ("7z", "archive"), ("rar", "archive"), ("bz2", "archive"),
    ("xz", "archive"), ("dmg", "installer"), ("pkg", "installer"),
    ("rs", "code"), ("py", "code"), ("js", "code"), ("ts", "code"),
    ("go", "code"), ("java", "code"), ("cpp", "code"), ("c", "code"),
    ("sh", "code"), ("rb", "code"), ("swift", "code"),
    ("eml", "email"), ("msg", "email"), ("mbox", "email"), ("emlx", "email"),
];

const FILENAME_PATTERNS: &[(&str, &str, &str)] = &[
    ("facture", "document", "Factures"),
    ("invoice", "document", "Factures"),
    ("cv", "document", "CV"),
    ("resume", "document", "CV"),
    ("contrat", "document", "Contrats"),
    ("contract", "document", "Contrats"),
    ("screenshot", "photo", "Captures"),
    ("capture", "photo", "Captures"),
    ("img_", "photo", "Brutes"),
    ("dsc_", "photo", "Brutes"),
    ("vlc-", "video", "Personnelles"),
    ("setup", "installer", ""),
    ("install", "installer", ""),
    ("gmail",       "email", "Gmail"),
    ("outlook",     "email", "Outlook"),
    ("thunderbird", "email", "Thunderbird"),
];

pub fn classify_by_rules(path: &str, name: &str) -> Option<ClassificationResult> {
    let name_lower = name.to_lowercase();
    let extension = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase());

    for (pattern, category, subcategory) in FILENAME_PATTERNS {
        if name_lower.starts_with(pattern) {
            return Some(ClassificationResult {
                category: category.to_string(),
                subcategory: if subcategory.is_empty() { None } else { Some(subcategory.to_string()) },
                confidence: 0.85,
                tags: vec![category.to_string()],
            });
        }
    }

    if let Some(ext) = extension {
        for (mapped_ext, category) in EXTENSION_MAP {
            if ext == *mapped_ext {
                return Some(ClassificationResult {
                    category: category.to_string(),
                    subcategory: None,
                    confidence: 0.95,
                    tags: vec![category.to_string(), ext.clone()],
                });
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classify_pdf_by_extension() {
        let result = classify_by_rules("/path/to/file.pdf", "file.pdf").unwrap();
        assert_eq!(result.category, "document");
        assert_eq!(result.confidence, 0.95);
    }

    #[test]
    fn test_classify_photo_by_extension() {
        let result = classify_by_rules("/path/photo.heic", "photo.heic").unwrap();
        assert_eq!(result.category, "photo");
    }

    #[test]
    fn test_classify_invoice_by_name_pattern() {
        let result = classify_by_rules("/path/facture_edf.pdf", "facture_edf.pdf").unwrap();
        assert_eq!(result.category, "document");
        assert_eq!(result.subcategory, Some("Factures".to_string()));
        assert_eq!(result.confidence, 0.85);
    }

    #[test]
    fn test_classify_screenshot_by_name() {
        let result = classify_by_rules("/path/screenshot_2026.png", "screenshot_2026.png").unwrap();
        assert_eq!(result.category, "photo");
        assert_eq!(result.subcategory, Some("Captures".to_string()));
    }

    #[test]
    fn test_unknown_extension_returns_none() {
        let result = classify_by_rules("/path/file.xyz123", "file.xyz123");
        assert!(result.is_none());
    }

    #[test]
    fn test_classify_video() {
        let result = classify_by_rules("/path/video.mp4", "video.mp4").unwrap();
        assert_eq!(result.category, "video");
    }

    #[test]
    fn test_classify_music() {
        let result = classify_by_rules("/path/song.flac", "song.flac").unwrap();
        assert_eq!(result.category, "music");
    }

    #[test]
    fn test_classify_eml_by_extension() {
        let result = classify_by_rules("/path/file.eml", "file.eml").unwrap();
        assert_eq!(result.category, "email");
        assert_eq!(result.confidence, 0.95);
        assert_eq!(result.subcategory, None);
    }

    #[test]
    fn test_classify_msg_by_extension() {
        let result = classify_by_rules("/path/file.msg", "file.msg").unwrap();
        assert_eq!(result.category, "email");
        assert_eq!(result.confidence, 0.95);
    }

    #[test]
    fn test_classify_mbox_by_extension() {
        let result = classify_by_rules("/path/archive.mbox", "archive.mbox").unwrap();
        assert_eq!(result.category, "email");
        assert_eq!(result.confidence, 0.95);
    }

    #[test]
    fn test_classify_emlx_by_extension() {
        let result = classify_by_rules("/path/message.emlx", "message.emlx").unwrap();
        assert_eq!(result.category, "email");
        assert_eq!(result.confidence, 0.95);
    }

    #[test]
    fn test_classify_gmail_pattern_wins_over_extension() {
        let result = classify_by_rules("/path/gmail_export.mbox", "gmail_export.mbox").unwrap();
        assert_eq!(result.category, "email");
        assert_eq!(result.subcategory, Some("Gmail".to_string()));
        assert_eq!(result.confidence, 0.85);
    }

    #[test]
    fn test_classify_outlook_pattern() {
        let result = classify_by_rules("/path/outlook_backup.msg", "outlook_backup.msg").unwrap();
        assert_eq!(result.category, "email");
        assert_eq!(result.subcategory, Some("Outlook".to_string()));
        assert_eq!(result.confidence, 0.85);
    }

    #[test]
    fn test_classify_thunderbird_pattern() {
        let result = classify_by_rules("/path/thunderbird_export.mbox", "thunderbird_export.mbox").unwrap();
        assert_eq!(result.category, "email");
        assert_eq!(result.subcategory, Some("Thunderbird".to_string()));
        assert_eq!(result.confidence, 0.85);
    }
}
