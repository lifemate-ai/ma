mod llm;
mod openai;
mod claude;
mod presence;
mod prompt;

pub use llm::{CompanionLLM, SessionContext, SessionMode};

use std::sync::Arc;
use axum::{Json, http::StatusCode, extract::{State, Extension}};
use libsql::Connection;
use serde::{Deserialize, Serialize};
use crate::{AppState, auth::Claims};

// ── リクエスト/レスポンス型 ──────────────────────────────────────

#[derive(Deserialize)]
pub struct GreetRequest {
    pub user_message: Option<String>,
    pub time_of_day: String,
    pub sessions_total: u32,
    pub days_since_last: Option<u32>,
}

#[derive(Deserialize)]
pub struct GuideRequest {
    pub mode: SessionMode,
    pub elapsed_seconds: u32,
    pub phase: String,
}

#[derive(Deserialize)]
pub struct CloseRequest {
    pub mode: SessionMode,
    pub duration_seconds: u32,
}

#[derive(Deserialize)]
pub struct LoopRequest {
    pub user_journal: String,
}

#[derive(Serialize)]
pub struct TextResponse {
    pub text: String,
}

fn mode_name(mode: &SessionMode) -> &'static str {
    match mode {
        SessionMode::Yasashii => "yasashii",
        SessionMode::MottoYasashii => "motto_yasashii",
        SessionMode::BodyScan => "body_scan",
        SessionMode::Sbnrr => "sbnrr",
        SessionMode::EmotionMapping => "emotion_mapping",
        SessionMode::Gratitude => "gratitude",
        SessionMode::Compassion => "compassion",
        SessionMode::Checkin => "checkin",
    }
}

pub async fn migrate(conn: &Connection) -> anyhow::Result<()> {
    presence::migrate(conn).await
}

pub async fn remember_session(
    db: &libsql::Database,
    user_id: Option<&str>,
    mode: &str,
    duration_seconds: i64,
    session_id: &str,
) -> anyhow::Result<()> {
    presence::remember_session(db, user_id, mode, duration_seconds, session_id).await
}

pub async fn remember_journal(
    db: &libsql::Database,
    user_id: Option<&str>,
    journal_id: &str,
    text: &str,
    companion_loop: Option<&str>,
) -> anyhow::Result<()> {
    presence::remember_journal(db, user_id, journal_id, text, companion_loop).await
}

pub async fn remember_checkin(
    db: &libsql::Database,
    user_id: Option<&str>,
    checkin_id: &str,
    emotion: &str,
    body_state: &str,
    intention: &str,
) -> anyhow::Result<()> {
    presence::remember_checkin(db, user_id, checkin_id, emotion, body_state, intention).await
}

pub async fn remember_observation(
    db: &libsql::Database,
    user_id: Option<&str>,
    observation_id: &str,
    source: &str,
    summary: &str,
) -> anyhow::Result<()> {
    presence::remember_observation(db, user_id, observation_id, source, summary).await
}

// ── LLM ファクトリ ───────────────────────────────────────────────

pub fn make_llm(http: reqwest::Client) -> Arc<dyn CompanionLLM + Send + Sync> {
    let provider = std::env::var("LLM_PROVIDER").unwrap_or_else(|_| "openai".to_string());
    match provider.as_str() {
        "claude" => Arc::new(claude::ClaudeLLM::new(http)),
        _ => Arc::new(openai::OpenAILLM::new(http)),
    }
}

// ── ハンドラ ────────────────────────────────────────────────────

pub async fn greet(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<GreetRequest>,
) -> Result<Json<TextResponse>, StatusCode> {
    let user_id = claims.sub;
    let presence = presence::build_presence_snapshot(
        &state.db,
        Some(user_id.as_str()),
        &presence::PresenceEvent {
            phase: "greet".into(),
            time_of_day: req.time_of_day.clone(),
            mode: None,
            user_message: req.user_message.clone(),
            days_since_last: req.days_since_last,
            elapsed_seconds: None,
            duration_seconds: None,
            journal_text: None,
            observation_text: None,
        },
    )
    .await
    .map_err(|e| {
        tracing::error!("presence context error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    let ctx = SessionContext {
        time_of_day: req.time_of_day,
        sessions_total: req.sessions_total,
        days_since_last: req.days_since_last,
        user_message: req.user_message,
        memory_context: Some(presence.prompt_context),
    };
    let text = state.llm.greet(ctx).await.map_err(|e| {
        tracing::error!("greet error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    Ok(Json(TextResponse { text: text.text }))
}

pub async fn guide(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<GuideRequest>,
) -> Result<Json<TextResponse>, StatusCode> {
    let user_id = claims.sub;
    let presence = presence::build_presence_snapshot(
        &state.db,
        Some(user_id.as_str()),
        &presence::PresenceEvent {
            phase: req.phase.clone(),
            time_of_day: "unknown".into(),
            mode: Some(mode_name(&req.mode).to_string()),
            user_message: None,
            days_since_last: None,
            elapsed_seconds: Some(req.elapsed_seconds),
            duration_seconds: None,
            journal_text: None,
            observation_text: None,
        },
    )
    .await
    .map_err(|e| {
        tracing::error!("presence context error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    tracing::debug!("guide prediction_error={:.3}", presence.prediction_error);
    let text = state.llm.guide(req.mode, &req.phase, req.elapsed_seconds, Some(presence.prompt_context)).await.map_err(|e| {
        tracing::error!("guide error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    Ok(Json(TextResponse { text: text.text }))
}

pub async fn close_session(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<CloseRequest>,
) -> Result<Json<TextResponse>, StatusCode> {
    let user_id = claims.sub;
    let presence = presence::build_presence_snapshot(
        &state.db,
        Some(user_id.as_str()),
        &presence::PresenceEvent {
            phase: "close".into(),
            time_of_day: "unknown".into(),
            mode: Some(mode_name(&req.mode).to_string()),
            user_message: None,
            days_since_last: None,
            elapsed_seconds: None,
            duration_seconds: Some(req.duration_seconds),
            journal_text: None,
            observation_text: None,
        },
    )
    .await
    .map_err(|e| {
        tracing::error!("presence context error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    let text = state.llm.close(req.mode, req.duration_seconds, Some(presence.prompt_context)).await.map_err(|e| {
        tracing::error!("close error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    Ok(Json(TextResponse { text: text.text }))
}

#[derive(Deserialize)]
pub struct SbnrrStepRequest {
    pub step: String,
}

#[derive(Deserialize)]
pub struct ObserveRequest {
    pub source: Option<String>,
    pub summary: Option<String>,
    pub image_data_url: Option<String>,
}

#[derive(Serialize)]
pub struct ObservationResponse {
    pub id: String,
    pub source: String,
    pub summary: String,
}

pub async fn loop_back(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<LoopRequest>,
) -> Result<Json<TextResponse>, StatusCode> {
    let user_id = claims.sub;
    let presence = presence::build_presence_snapshot(
        &state.db,
        Some(user_id.as_str()),
        &presence::PresenceEvent {
            phase: "journal".into(),
            time_of_day: "unknown".into(),
            mode: None,
            user_message: None,
            days_since_last: None,
            elapsed_seconds: None,
            duration_seconds: None,
            journal_text: Some(req.user_journal.clone()),
            observation_text: None,
        },
    )
    .await
    .map_err(|e| {
        tracing::error!("presence context error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    let text = state.llm.loop_back(&req.user_journal, Some(presence.prompt_context)).await.map_err(|e| {
        tracing::error!("loop error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    Ok(Json(TextResponse { text: text.text }))
}

pub async fn sbnrr_step(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<SbnrrStepRequest>,
) -> Result<Json<TextResponse>, StatusCode> {
    let step_prompt = prompt::sbnrr_step_prompt(&req.step);
    let user_id = claims.sub;
    let presence = presence::build_presence_snapshot(
        &state.db,
        Some(user_id.as_str()),
        &presence::PresenceEvent {
            phase: "sbnrr".into(),
            time_of_day: "unknown".into(),
            mode: Some("sbnrr".into()),
            user_message: None,
            days_since_last: None,
            elapsed_seconds: Some(0),
            duration_seconds: None,
            journal_text: None,
            observation_text: None,
        },
    )
    .await
    .map_err(|e| {
        tracing::error!("presence context error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    // Use the guide method with the SBNRR step prompt
    let text = state.llm.guide(SessionMode::Sbnrr, &step_prompt, 0, Some(presence.prompt_context)).await.map_err(|e| {
        tracing::error!("sbnrr_step error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    Ok(Json(TextResponse { text: text.text }))
}

pub async fn observe(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<ObserveRequest>,
) -> Result<Json<ObservationResponse>, StatusCode> {
    let user_id = claims.sub;
    let observation_id = uuid::Uuid::new_v4().to_string();
    let source = req
        .source
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "camera".to_string());
    let summary = match req.summary.map(|value| value.trim().to_string()).filter(|value| !value.is_empty()) {
        Some(summary) => summary,
        None => {
            let image_data_url = req
                .image_data_url
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .ok_or(StatusCode::BAD_REQUEST)?;
            let observed = state.llm.observe(&source, image_data_url).await.map_err(|e| {
                tracing::error!("observe vision error: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
            let text = observed.text.trim().to_string();
            if text.is_empty() {
                return Err(StatusCode::INTERNAL_SERVER_ERROR);
            }
            text
        }
    };

    let _presence = presence::build_presence_snapshot(
        &state.db,
        Some(user_id.as_str()),
        &presence::PresenceEvent {
            phase: "observation".into(),
            time_of_day: "unknown".into(),
            mode: None,
            user_message: None,
            days_since_last: None,
            elapsed_seconds: None,
            duration_seconds: None,
            journal_text: None,
            observation_text: Some(summary.clone()),
        },
    )
    .await
    .map_err(|e| {
        tracing::error!("presence context error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    remember_observation(
        &state.db,
        Some(user_id.as_str()),
        &observation_id,
        &source,
        &summary,
    )
        .await
        .map_err(|e| {
            tracing::error!("Companion observation memory error: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(ObservationResponse {
        id: observation_id,
        source,
        summary,
    }))
}
