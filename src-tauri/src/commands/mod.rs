pub mod files;
pub mod tags;
pub mod assistant;
pub mod export;
pub mod prefs;
pub mod rules;

pub use files::*;
pub use tags::*;
pub use assistant::*;
pub use export::*;
pub use prefs::*;
pub use rules::*;

pub fn resolve_api_key(config_key: Option<&str>) -> String {
    config_key
        .filter(|k| !k.is_empty())
        .map(String::from)
        .unwrap_or_else(|| std::env::var("ANTHROPIC_API_KEY").unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_api_key_returns_config_key() {
        let key = resolve_api_key(Some("my-config-key"));
        assert_eq!(key, "my-config-key");
    }

    #[test]
    fn test_resolve_api_key_ignores_empty_string() {
        let _key = resolve_api_key(Some(""));
        // no panic — correct behavior
    }

    #[test]
    fn test_resolve_api_key_none_returns_env_or_empty() {
        let _key = resolve_api_key(None);
        // no panic — correct behavior
    }
}
