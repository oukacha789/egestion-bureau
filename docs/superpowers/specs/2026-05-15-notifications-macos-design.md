# Notifications macOS natives

**Date :** 2026-05-15
**Statut :** Approuvé

## Contexte

eGestion organise des fichiers en arrière-plan. L'utilisateur n'a aucun retour système quand un fichier est organisé ou qu'un doublon est détecté. Cette spec ajoute des notifications macOS natives pour ces deux événements, avec throttle pour éviter le spam lors des scans en volume.

## Comportement

Deux événements déclenchent des notifications :

### `file-organized`
- Titre : `"eGestion"`
- Corps : `"<nom_fichier> → <catégorie>"` (fichier unique) ou `"<N> fichiers organisés"` (batch)

### `file-duplicate`
- Titre : `"Doublon détecté"`
- Corps : `"<nom_fichier> est un doublon"`

### Throttle (5 secondes)

Si un événement arrive et `now - last_sent >= 5s` → envoyer immédiatement, réinitialiser les compteurs.

Si un événement arrive et `now - last_sent < 5s` → incrémenter le compteur `pending_organized` ou `pending_duplicate`. Si aucun envoi différé n'est déjà planifié, lancer un `tokio::spawn` qui attend jusqu'à `last_sent + 5s`, puis envoie une notification groupée avec les compteurs accumulés, puis remet les compteurs à zéro.

Les notifications `file-organized` et `file-duplicate` ont des compteurs séparés et peuvent être envoyées indépendamment.

## Architecture

### Nouveau module : `src-tauri/src/notifications.rs`

Contient `ThrottleState` et la logique d'envoi :

```rust
pub struct ThrottleState {
    pub last_sent_organized: Option<Instant>,
    pub pending_organized: u32,
    pub organized_flush_scheduled: bool,

    pub last_sent_duplicate: Option<Instant>,
    pub pending_duplicate: u32,
    pub duplicate_flush_scheduled: bool,
}
```

Deux fonctions publiques :
- `notify_organized(app: &AppHandle, name: &str, category: &str, state: Arc<Mutex<ThrottleState>>)`
- `notify_duplicate(app: &AppHandle, name: &str, state: Arc<Mutex<ThrottleState>>)`

Chaque fonction :
1. Lock `state`
2. Si `last_sent + 5s <= now` → envoie immédiatement via `Notification::new(...).title(...).body(...).show(app)`, met à jour `last_sent`, remet `pending` à 0
3. Sinon → incrémente `pending`, si `flush_scheduled == false` → lance un `tokio::spawn` qui sleep jusqu'à `last_sent + 5s`, puis lock state, envoie notification groupée, remet à zéro

### Modifications

**`src-tauri/Cargo.toml`**
```toml
tauri-plugin-notification = "2"
```

**`src-tauri/src/lib.rs`**
- `mod notifications;`
- `.plugin(tauri_plugin_notification::init())` dans le builder
- `Arc<Mutex<ThrottleState>>` créé dans `setup()`, passé à `start_pipeline`

**`src-tauri/src/lib.rs` — pipeline**
- Dans `AppEvent::FileOrganized(payload)` : appeler `notify_organized(&app_handle, &payload.name, &payload.category, Arc::clone(&throttle))`
- Dans le bloc `if record.is_duplicate` du handler `AppEvent::FileDetected` (où `app_handle.emit("file-duplicate", ...)` est déjà appelé) : ajouter `notify_duplicate(&app_handle_clone, &record.name, Arc::clone(&throttle))`

**`src-tauri/capabilities/default.json`**
- Ajouter la permission `notification:default`

## Hors scope

- Préférence utilisateur pour activer/désactiver les notifications (version future)
- Icône personnalisée dans la notification
- Notifications cliquables (deep link vers le fichier)
- Notifications pour `file-detected` ou `file-classified`
