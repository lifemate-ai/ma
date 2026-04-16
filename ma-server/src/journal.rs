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
    pub session_id: Option<String>,
    pub duration_seconds: i64,
    pub mode: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SessionPrecheck {
    pub id: String,
    pub session_id: String,
    pub stress: Option<i64>,
    pub agitation: Option<i64>,
    pub energy: Option<i64>,
    pub sleepiness: Option<i64>,
    pub body_tension: Option<i64>,
    pub overwhelm: Option<i64>,
    pub self_criticism: Option<i64>,
    pub available_minutes: Option<i64>,
    pub context_tag: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SessionPostcheck {
    pub id: String,
    pub session_id: String,
    pub calm_delta_self_report: Option<i64>,
    pub presence_delta: Option<i64>,
    pub self_kindness_delta: Option<i64>,
    pub burden: Option<i64>,
    pub too_activated: bool,
    pub too_sleepy: bool,
    pub repeat_intent: Option<i64>,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct CreateSessionPrecheckRequest {
    pub session_id: String,
    pub stress: Option<i64>,
    pub agitation: Option<i64>,
    pub energy: Option<i64>,
    pub sleepiness: Option<i64>,
    pub body_tension: Option<i64>,
    pub overwhelm: Option<i64>,
    pub self_criticism: Option<i64>,
    pub available_minutes: Option<i64>,
    pub context_tag: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateSessionPostcheckRequest {
    pub session_id: String,
    pub calm_delta_self_report: Option<i64>,
    pub presence_delta: Option<i64>,
    pub self_kindness_delta: Option<i64>,
    pub burden: Option<i64>,
    pub too_activated: bool,
    pub too_sleepy: bool,
    pub repeat_intent: Option<i64>,
}

#[derive(Deserialize)]
pub struct CreateSessionEventRequest {
    pub session_id: String,
    pub event_type: String,
    pub event_time_offset_ms: i64,
    pub payload_json: Option<serde_json::Value>,
}

#[derive(Deserialize)]
pub struct CreateRecommendationLogRequest {
    pub recommended_protocol: String,
    pub rationale: String,
    pub input_snapshot_json: Option<serde_json::Value>,
    pub accepted_bool: bool,
    pub session_id: Option<String>,
    pub confidence: Option<f64>,
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
        );
        CREATE TABLE IF NOT EXISTS user_preferences (
            user_id TEXT PRIMARY KEY,
            preferred_durations_json TEXT,
            preferred_voice_density TEXT,
            eyes_open_preference TEXT,
            posture_preferences_json TEXT,
            favorite_protocols_json TEXT,
            watch_opt_in INTEGER NOT NULL DEFAULT 0,
            reminder_prefs_json TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS user_goals (
            user_id TEXT PRIMARY KEY,
            stress INTEGER NOT NULL DEFAULT 0,
            focus INTEGER NOT NULL DEFAULT 0,
            sleep INTEGER NOT NULL DEFAULT 0,
            kindness INTEGER NOT NULL DEFAULT 0,
            emotional_regulation INTEGER NOT NULL DEFAULT 0,
            general_presence INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS session_precheck (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            stress INTEGER,
            agitation INTEGER,
            energy INTEGER,
            sleepiness INTEGER,
            body_tension INTEGER,
            overwhelm INTEGER,
            self_criticism INTEGER,
            available_minutes INTEGER,
            context_tag TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS session_postcheck (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            calm_delta_self_report INTEGER,
            presence_delta INTEGER,
            self_kindness_delta INTEGER,
            burden INTEGER,
            too_activated INTEGER NOT NULL DEFAULT 0,
            too_sleepy INTEGER NOT NULL DEFAULT 0,
            repeat_intent INTEGER,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS session_events (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            event_time_offset_ms INTEGER NOT NULL DEFAULT 0,
            payload_json TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS recommendation_log (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            recommended_protocol TEXT NOT NULL,
            rationale TEXT NOT NULL,
            input_snapshot_json TEXT,
            accepted_bool INTEGER,
            session_id TEXT,
            confidence REAL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS safety_events (
            id TEXT PRIMARY KEY,
            session_id TEXT,
            user_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            trigger_source TEXT,
            action_taken TEXT,
            resolved_bool INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
    Extension(claims): Extension<Claims>,
    Json(req): Json<CreateCheckinRequest>,
) -> Result<Json<Checkin>, StatusCode> {
    let user_id = claims.sub;

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
        Some(user_id.as_str()),
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
    Extension(claims): Extension<Claims>,
    Json(req): Json<CreateSessionRequest>,
) -> Result<Json<Session>, StatusCode> {
    let user_id = claims.sub;
    let CreateSessionRequest { session_id, duration_seconds, mode } = req;

    let conn = state.db.connect().map_err(|e| {
        tracing::error!("DB connect error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let session = Session {
        id: session_id.unwrap_or_else(|| Uuid::new_v4().to_string()),
        started_at: Utc::now().to_rfc3339(),
        duration_seconds,
        mode,
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
        Some(user_id.as_str()),
        &session.mode,
        session.duration_seconds,
        &session.id,
    ).await.map_err(|e| {
        tracing::error!("Companion session memory error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(session))
}

pub async fn save_session_precheck(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<CreateSessionPrecheckRequest>,
) -> Result<Json<SessionPrecheck>, StatusCode> {
    let user_id = claims.sub;
    let conn = state.db.connect().map_err(|e| {
        tracing::error!("DB connect error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let precheck = SessionPrecheck {
        id: Uuid::new_v4().to_string(),
        session_id: req.session_id,
        stress: req.stress,
        agitation: req.agitation,
        energy: req.energy,
        sleepiness: req.sleepiness,
        body_tension: req.body_tension,
        overwhelm: req.overwhelm,
        self_criticism: req.self_criticism,
        available_minutes: req.available_minutes,
        context_tag: req.context_tag,
        created_at: Utc::now().to_rfc3339(),
    };

    conn.execute(
        "INSERT INTO session_precheck
         (id, session_id, user_id, stress, agitation, energy, sleepiness, body_tension, overwhelm, self_criticism, available_minutes, context_tag, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        libsql::params![
            precheck.id.clone(),
            precheck.session_id.clone(),
            user_id,
            precheck.stress,
            precheck.agitation,
            precheck.energy,
            precheck.sleepiness,
            precheck.body_tension,
            precheck.overwhelm,
            precheck.self_criticism,
            precheck.available_minutes,
            precheck.context_tag.clone(),
            precheck.created_at.clone(),
        ],
    ).await.map_err(|e| {
        tracing::error!("Insert session precheck error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(precheck))
}

pub async fn save_session_postcheck(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<CreateSessionPostcheckRequest>,
) -> Result<Json<SessionPostcheck>, StatusCode> {
    let user_id = claims.sub;
    let conn = state.db.connect().map_err(|e| {
        tracing::error!("DB connect error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let postcheck = SessionPostcheck {
        id: Uuid::new_v4().to_string(),
        session_id: req.session_id,
        calm_delta_self_report: req.calm_delta_self_report,
        presence_delta: req.presence_delta,
        self_kindness_delta: req.self_kindness_delta,
        burden: req.burden,
        too_activated: req.too_activated,
        too_sleepy: req.too_sleepy,
        repeat_intent: req.repeat_intent,
        created_at: Utc::now().to_rfc3339(),
    };

    conn.execute(
        "INSERT INTO session_postcheck
         (id, session_id, user_id, calm_delta_self_report, presence_delta, self_kindness_delta, burden, too_activated, too_sleepy, repeat_intent, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        libsql::params![
            postcheck.id.clone(),
            postcheck.session_id.clone(),
            user_id.clone(),
            postcheck.calm_delta_self_report,
            postcheck.presence_delta,
            postcheck.self_kindness_delta,
            postcheck.burden,
            if postcheck.too_activated { 1 } else { 0 },
            if postcheck.too_sleepy { 1 } else { 0 },
            postcheck.repeat_intent,
            postcheck.created_at.clone(),
        ],
    ).await.map_err(|e| {
        tracing::error!("Insert session postcheck error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if postcheck.too_activated || postcheck.too_sleepy || postcheck.burden.unwrap_or(0) >= 4 {
        conn.execute(
            "INSERT INTO safety_events (id, session_id, user_id, event_type, trigger_source, action_taken, resolved_bool)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0)",
            libsql::params![
                Uuid::new_v4().to_string(),
                postcheck.session_id.clone(),
                user_id.clone(),
                "postcheck_flag",
                "postcheck",
                if postcheck.too_activated {
                    "grounding_recommended"
                } else if postcheck.too_sleepy {
                    "rest_recommended"
                } else {
                    "lighter_protocol_recommended"
                },
            ],
        ).await.map_err(|e| {
            tracing::error!("Insert safety event error: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    }

    Ok(Json(postcheck))
}

pub async fn save_session_event(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<CreateSessionEventRequest>,
) -> Result<StatusCode, StatusCode> {
    let user_id = claims.sub;
    let CreateSessionEventRequest {
        session_id,
        event_type,
        event_time_offset_ms,
        payload_json,
    } = req;
    let conn = state.db.connect().map_err(|e| {
        tracing::error!("DB connect error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    conn.execute(
        "INSERT INTO session_events (id, session_id, user_id, event_type, event_time_offset_ms, payload_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        libsql::params![
            Uuid::new_v4().to_string(),
            session_id,
            user_id,
            event_type,
            event_time_offset_ms,
            payload_json.map(|value| value.to_string()),
        ],
    ).await.map_err(|e| {
        tracing::error!("Insert session event error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn save_recommendation_log(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<CreateRecommendationLogRequest>,
) -> Result<StatusCode, StatusCode> {
    let user_id = claims.sub;
    let CreateRecommendationLogRequest {
        recommended_protocol,
        rationale,
        input_snapshot_json,
        accepted_bool,
        session_id,
        confidence,
    } = req;
    let conn = state.db.connect().map_err(|e| {
        tracing::error!("DB connect error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    conn.execute(
        "INSERT INTO recommendation_log
         (id, user_id, recommended_protocol, rationale, input_snapshot_json, accepted_bool, session_id, confidence)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        libsql::params![
            Uuid::new_v4().to_string(),
            user_id,
            recommended_protocol,
            rationale,
            input_snapshot_json.map(|value| value.to_string()),
            if accepted_bool { 1 } else { 0 },
            session_id,
            confidence,
        ],
    ).await.map_err(|e| {
        tracing::error!("Insert recommendation log error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn save_journal(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<CreateJournalRequest>,
) -> Result<Json<JournalEntry>, StatusCode> {
    let user_id = claims.sub;

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
        Some(user_id.as_str()),
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
    Extension(claims): Extension<Claims>,
) -> Result<Json<HistoryResponse>, StatusCode> {
    let conn = state.db.connect().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let user_filter = claims.sub;
    let mut rows = conn.query(
        "SELECT id, started_at, duration_seconds, mode FROM sessions WHERE user_id = ?1 ORDER BY started_at DESC LIMIT 100",
        libsql::params![user_filter.clone()]
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
         FROM journals WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 100",
        libsql::params![user_filter.clone()]
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
        "SELECT id, created_at, emotion, body_state, intention FROM checkins WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 100",
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
    Extension(claims): Extension<Claims>,
) -> Result<Json<TimelineResponse>, StatusCode> {
    let conn = state.db.connect().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let user_filter = claims.sub;

    let mut entries: Vec<TimelineEntry> = Vec::new();

    // Sessions with their linked journals
    let mut rows = conn.query(
        "SELECT s.id, s.started_at, s.duration_seconds, s.mode,
                j.id, j.user_text, j.companion_loop, j.mood_inferred
         FROM sessions s
         LEFT JOIN journals j ON j.session_id = s.id
         WHERE s.user_id = ?1
         ORDER BY s.started_at DESC LIMIT 200",
        libsql::params![user_filter.clone()]
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
        "SELECT id, created_at, emotion, body_state, intention FROM checkins WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 100",
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
