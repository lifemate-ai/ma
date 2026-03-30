use axum::{Json, http::StatusCode, extract::{State, Extension}};
use chrono::Utc;
use libsql::Connection;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::{AppState, auth::Claims, companion};

// ── データ型 ───────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Session {
    pub id: String,
    pub started_at: String,
    pub duration_seconds: i64,
    pub mode: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JournalEntry {
    pub id: String,
    pub session_id: Option<String>,
    pub created_at: String,
    pub user_text: String,
    pub companion_loop: Option<String>,
    pub mood_inferred: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateSessionRequest {
    pub duration_seconds: i64,
    pub mode: String,
}

#[derive(Deserialize)]
pub struct CreateJournalRequest {
    pub session_id: Option<String>,
    pub user_text: String,
    pub companion_loop: Option<String>,
    pub mood_inferred: Option<String>,
}

#[derive(Serialize)]
pub struct HistoryResponse {
    pub sessions: Vec<Session>,
    pub journals: Vec<JournalEntry>,
    pub checkins: Vec<Checkin>,
}

#[derive(Serialize)]
pub struct TimelineEntry {
    pub entry_type: String,
    pub timestamp: String,
    pub data: serde_json::Value,
}

#[derive(Serialize)]
pub struct TimelineResponse {
    pub entries: Vec<TimelineEntry>,
}

// ── マイグレーション（起動時に1回呼ぶ） ──────────────────────────

pub async fn migrate(conn: &Connection) -> anyhow::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            started_at TEXT NOT NULL,
            duration_seconds INTEGER NOT NULL,
            mode TEXT NOT NULL,
            user_id TEXT
        );
        CREATE TABLE IF NOT EXISTS journals (
            id TEXT PRIMARY KEY,
            session_id TEXT,
            created_at TEXT NOT NULL,
            user_text TEXT NOT NULL,
            companion_loop TEXT,
            mood_inferred TEXT,
            user_id TEXT
        );
        CREATE TABLE IF NOT EXISTS checkins (
            id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL,
            emotion TEXT NOT NULL,
            body_state TEXT NOT NULL,
            intention TEXT NOT NULL,
            user_id TEXT
        );"
    ).await?;

    // 既存テーブルへのuser_id追加（既にある場合はエラーを無視）
    for sql in [
        "ALTER TABLE sessions ADD COLUMN user_id TEXT",
        "ALTER TABLE journals ADD COLUMN user_id TEXT",
        "ALTER TABLE checkins ADD COLUMN user_id TEXT",
    ] {
        let _ = conn.execute(sql, ()).await; // ignore "duplicate column" error
    }

    Ok(())
}

// ── チェックイン ────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Checkin {
    pub id: String,
    pub created_at: String,
    pub emotion: String,
    pub body_state: String,
    pub intention: String,
}

#[derive(Deserialize)]
pub struct CreateCheckinRequest {
    pub emotion: String,
    pub body_state: String,
    pub intention: String,
}

pub async fn save_checkin(
    State(state): State<AppState>,
    claims: Option<Extension<Claims>>,
    Json(req): Json<CreateCheckinRequest>,
) -> Result<Json<Checkin>, StatusCode> {
    let user_id = claims.map(|Extension(c)| c.sub);

    let conn = state.db.connect().map_err(|e| {
        tracing::error!("DB connect error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let checkin = Checkin {
        id: Uuid::new_v4().to_string(),
        created_at: Utc::now().to_rfc3339(),
        emotion: req.emotion,
        body_state: req.body_state,
        intention: req.intention,
    };

    conn.execute(
        "INSERT INTO checkins (id, created_at, emotion, body_state, intention, user_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        libsql::params![
            checkin.id.clone(),
            checkin.created_at.clone(),
            checkin.emotion.clone(),
            checkin.body_state.clone(),
            checkin.intention.clone(),
            user_id.clone(),
        ],
    ).await.map_err(|e| {
        tracing::error!("Insert checkin error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    companion::remember_checkin(
        &state.db,
        user_id.as_deref(),
        &checkin.id,
        &checkin.emotion,
        &checkin.body_state,
        &checkin.intention,
    ).await.map_err(|e| {
        tracing::error!("Companion checkin memory error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(checkin))
}

// ── ハンドラ ──────────────────────────────────────────────────

pub async fn save_session(
    State(state): State<AppState>,
    claims: Option<Extension<Claims>>,
    Json(req): Json<CreateSessionRequest>,
) -> Result<Json<Session>, StatusCode> {
    let user_id = claims.map(|Extension(c)| c.sub);

    let conn = state.db.connect().map_err(|e| {
        tracing::error!("DB connect error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let session = Session {
        id: Uuid::new_v4().to_string(),
        started_at: Utc::now().to_rfc3339(),
        duration_seconds: req.duration_seconds,
        mode: req.mode,
    };

    conn.execute(
        "INSERT INTO sessions (id, started_at, duration_seconds, mode, user_id) VALUES (?1, ?2, ?3, ?4, ?5)",
        libsql::params![session.id.clone(), session.started_at.clone(), session.duration_seconds, session.mode.clone(), user_id.clone()],
    ).await.map_err(|e| {
        tracing::error!("Insert session error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    companion::remember_session(
        &state.db,
        user_id.as_deref(),
        &session.mode,
        session.duration_seconds,
        &session.id,
    ).await.map_err(|e| {
        tracing::error!("Companion session memory error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(session))
}

pub async fn save_journal(
    State(state): State<AppState>,
    claims: Option<Extension<Claims>>,
    Json(req): Json<CreateJournalRequest>,
) -> Result<Json<JournalEntry>, StatusCode> {
    let user_id = claims.map(|Extension(c)| c.sub);

    let conn = state.db.connect().map_err(|e| {
        tracing::error!("DB connect error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let entry = JournalEntry {
        id: Uuid::new_v4().to_string(),
        session_id: req.session_id,
        created_at: Utc::now().to_rfc3339(),
        user_text: req.user_text,
        companion_loop: req.companion_loop,
        mood_inferred: req.mood_inferred,
    };

    conn.execute(
        "INSERT INTO journals (id, session_id, created_at, user_text, companion_loop, mood_inferred, user_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        libsql::params![
            entry.id.clone(),
            entry.session_id.clone(),
            entry.created_at.clone(),
            entry.user_text.clone(),
            entry.companion_loop.clone(),
            entry.mood_inferred.clone(),
            user_id.clone(),
        ],
    ).await.map_err(|e| {
        tracing::error!("Insert journal error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    companion::remember_journal(
        &state.db,
        user_id.as_deref(),
        &entry.id,
        &entry.user_text,
        entry.companion_loop.as_deref(),
    ).await.map_err(|e| {
        tracing::error!("Companion journal memory error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(entry))
}

pub async fn get_history(
    State(state): State<AppState>,
    claims: Option<Extension<Claims>>,
) -> Result<Json<HistoryResponse>, StatusCode> {
    let user_id = claims.map(|Extension(c)| c.sub);
    let conn = state.db.connect().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let user_filter = user_id.as_deref().unwrap_or("");
    let mut rows = conn.query(
        "SELECT id, started_at, duration_seconds, mode FROM sessions WHERE (user_id = ?1 OR ?1 = '') ORDER BY started_at DESC LIMIT 100",
        libsql::params![user_filter]
    ).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut sessions = Vec::new();
    while let Some(row) = rows.next().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)? {
        sessions.push(Session {
            id: row.get(0).unwrap_or_default(),
            started_at: row.get(1).unwrap_or_default(),
            duration_seconds: row.get(2).unwrap_or(0),
            mode: row.get(3).unwrap_or_default(),
        });
    }

    let mut rows = conn.query(
        "SELECT id, session_id, created_at, user_text, companion_loop, mood_inferred
         FROM journals WHERE (user_id = ?1 OR ?1 = '') ORDER BY created_at DESC LIMIT 100",
        libsql::params![user_filter]
    ).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut journals = Vec::new();
    while let Some(row) = rows.next().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)? {
        journals.push(JournalEntry {
            id: row.get(0).unwrap_or_default(),
            session_id: row.get(1).ok(),
            created_at: row.get(2).unwrap_or_default(),
            user_text: row.get(3).unwrap_or_default(),
            companion_loop: row.get(4).ok(),
            mood_inferred: row.get(5).ok(),
        });
    }

    let mut rows = conn.query(
        "SELECT id, created_at, emotion, body_state, intention FROM checkins WHERE (user_id = ?1 OR ?1 = '') ORDER BY created_at DESC LIMIT 100",
        libsql::params![user_filter]
    ).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut checkins = Vec::new();
    while let Some(row) = rows.next().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)? {
        checkins.push(Checkin {
            id: row.get(0).unwrap_or_default(),
            created_at: row.get(1).unwrap_or_default(),
            emotion: row.get(2).unwrap_or_default(),
            body_state: row.get(3).unwrap_or_default(),
            intention: row.get(4).unwrap_or_default(),
        });
    }

    Ok(Json(HistoryResponse { sessions, journals, checkins }))
}

pub async fn get_unified_history(
    State(state): State<AppState>,
    claims: Option<Extension<Claims>>,
) -> Result<Json<TimelineResponse>, StatusCode> {
    let user_id = claims.map(|Extension(c)| c.sub);
    let conn = state.db.connect().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let user_filter = user_id.as_deref().unwrap_or("");

    let mut entries: Vec<TimelineEntry> = Vec::new();

    // Sessions with their linked journals
    let mut rows = conn.query(
        "SELECT s.id, s.started_at, s.duration_seconds, s.mode,
                j.id, j.user_text, j.companion_loop, j.mood_inferred
         FROM sessions s
         LEFT JOIN journals j ON j.session_id = s.id
         WHERE (s.user_id = ?1 OR ?1 = '')
         ORDER BY s.started_at DESC LIMIT 200",
        libsql::params![user_filter]
    ).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    while let Some(row) = rows.next().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)? {
        let journal_id: Option<String> = row.get(4).ok();
        let data = serde_json::json!({
            "id": row.get::<String>(0).unwrap_or_default(),
            "duration_seconds": row.get::<i64>(2).unwrap_or(0),
            "mode": row.get::<String>(3).unwrap_or_default(),
            "journal": journal_id.map(|_| serde_json::json!({
                "user_text": row.get::<String>(5).unwrap_or_default(),
                "companion_loop": row.get::<Option<String>>(6).unwrap_or(None),
                "mood_inferred": row.get::<Option<String>>(7).unwrap_or(None),
            })),
        });
        entries.push(TimelineEntry {
            entry_type: "session".into(),
            timestamp: row.get(1).unwrap_or_default(),
            data,
        });
    }

    // Checkins
    let mut rows = conn.query(
        "SELECT id, created_at, emotion, body_state, intention FROM checkins WHERE (user_id = ?1 OR ?1 = '') ORDER BY created_at DESC LIMIT 100",
        libsql::params![user_filter]
    ).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    while let Some(row) = rows.next().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)? {
        let data = serde_json::json!({
            "id": row.get::<String>(0).unwrap_or_default(),
            "emotion": row.get::<String>(2).unwrap_or_default(),
            "body_state": row.get::<String>(3).unwrap_or_default(),
            "intention": row.get::<String>(4).unwrap_or_default(),
        });
        entries.push(TimelineEntry {
            entry_type: "checkin".into(),
            timestamp: row.get(1).unwrap_or_default(),
            data,
        });
    }

    // Sort by timestamp descending
    entries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    Ok(Json(TimelineResponse { entries }))
}
