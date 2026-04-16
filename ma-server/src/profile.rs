use axum::{
    extract::{Extension, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;
use libsql::Connection;
use serde::{Deserialize, Serialize};

use crate::{auth::Claims, AppState};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPreferences {
    pub use_contexts: Vec<String>,
    pub primary_goal: Option<String>,
    pub preferred_durations: Vec<u32>,
    pub preferred_voice_density: String,
    pub eyes_open_preference: String,
    pub posture_preferences: Vec<String>,
    pub favorite_protocols: Vec<String>,
    pub watch_opt_in: bool,
    pub onboarding_completed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserGoals {
    pub stress: u8,
    pub focus: u8,
    pub sleep: u8,
    pub kindness: u8,
    pub emotional_regulation: u8,
    pub general_presence: u8,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ClearDataRequest {
    pub scope: Option<String>,
}

impl Default for UserPreferences {
    fn default() -> Self {
        Self {
            use_contexts: vec![],
            primary_goal: None,
            preferred_durations: vec![2, 3, 5],
            preferred_voice_density: "medium".into(),
            eyes_open_preference: "any".into(),
            posture_preferences: vec![],
            favorite_protocols: vec![],
            watch_opt_in: false,
            onboarding_completed: false,
        }
    }
}

impl Default for UserGoals {
    fn default() -> Self {
        Self {
            stress: 0,
            focus: 0,
            sleep: 0,
            kindness: 0,
            emotional_regulation: 0,
            general_presence: 0,
        }
    }
}

fn decode_json_vec(raw: Option<String>) -> Vec<String> {
    raw.and_then(|value| serde_json::from_str::<Vec<String>>(&value).ok())
        .unwrap_or_default()
}

fn decode_json_u32_vec(raw: Option<String>) -> Vec<u32> {
    raw.and_then(|value| serde_json::from_str::<Vec<u32>>(&value).ok())
        .unwrap_or_else(|| vec![2, 3, 5])
}

fn encode_json<T: Serialize>(value: &T) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "[]".to_string())
}

pub async fn migrate(conn: &Connection) -> anyhow::Result<()> {
    for sql in [
        "ALTER TABLE user_preferences ADD COLUMN use_contexts_json TEXT",
        "ALTER TABLE user_preferences ADD COLUMN primary_goal TEXT",
        "ALTER TABLE user_preferences ADD COLUMN onboarding_completed INTEGER NOT NULL DEFAULT 0",
    ] {
        let _ = conn.execute(sql, ()).await;
    }
    Ok(())
}

pub async fn get_preferences(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<UserPreferences>, StatusCode> {
    let conn = state.db.connect().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let mut rows = conn
        .query(
            "SELECT
                use_contexts_json,
                primary_goal,
                preferred_durations_json,
                preferred_voice_density,
                eyes_open_preference,
                posture_preferences_json,
                favorite_protocols_json,
                watch_opt_in,
                onboarding_completed
             FROM user_preferences
             WHERE user_id = ?1
             LIMIT 1",
            libsql::params![claims.sub],
        )
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let preferences = if let Some(row) = rows.next().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)? {
        UserPreferences {
            use_contexts: decode_json_vec(row.get(0).ok()),
            primary_goal: row.get(1).ok(),
            preferred_durations: decode_json_u32_vec(row.get(2).ok()),
            preferred_voice_density: row.get(3).unwrap_or_else(|_| "medium".to_string()),
            eyes_open_preference: row.get(4).unwrap_or_else(|_| "any".to_string()),
            posture_preferences: decode_json_vec(row.get(5).ok()),
            favorite_protocols: decode_json_vec(row.get(6).ok()),
            watch_opt_in: row.get::<i64>(7).unwrap_or(0) != 0,
            onboarding_completed: row.get::<i64>(8).unwrap_or(0) != 0,
        }
    } else {
        UserPreferences::default()
    };

    Ok(Json(preferences))
}

pub async fn save_preferences(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<UserPreferences>,
) -> Result<Json<UserPreferences>, StatusCode> {
    let conn = state.db.connect().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO user_preferences (
            user_id,
            use_contexts_json,
            primary_goal,
            preferred_durations_json,
            preferred_voice_density,
            eyes_open_preference,
            posture_preferences_json,
            favorite_protocols_json,
            watch_opt_in,
            onboarding_completed,
            created_at,
            updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
         ON CONFLICT(user_id) DO UPDATE SET
            use_contexts_json = excluded.use_contexts_json,
            primary_goal = excluded.primary_goal,
            preferred_durations_json = excluded.preferred_durations_json,
            preferred_voice_density = excluded.preferred_voice_density,
            eyes_open_preference = excluded.eyes_open_preference,
            posture_preferences_json = excluded.posture_preferences_json,
            favorite_protocols_json = excluded.favorite_protocols_json,
            watch_opt_in = excluded.watch_opt_in,
            onboarding_completed = excluded.onboarding_completed,
            updated_at = excluded.updated_at",
        libsql::params![
            claims.sub,
            encode_json(&req.use_contexts),
            req.primary_goal.clone(),
            encode_json(&req.preferred_durations),
            req.preferred_voice_density.clone(),
            req.eyes_open_preference.clone(),
            encode_json(&req.posture_preferences),
            encode_json(&req.favorite_protocols),
            if req.watch_opt_in { 1 } else { 0 },
            if req.onboarding_completed { 1 } else { 0 },
            now.clone(),
            now,
        ],
    )
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(req))
}

pub async fn get_goals(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<UserGoals>, StatusCode> {
    let conn = state.db.connect().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let mut rows = conn
        .query(
            "SELECT stress, focus, sleep, kindness, emotional_regulation, general_presence
             FROM user_goals
             WHERE user_id = ?1
             LIMIT 1",
            libsql::params![claims.sub],
        )
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let goals = if let Some(row) = rows.next().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)? {
        UserGoals {
            stress: row.get::<i64>(0).unwrap_or(0).clamp(0, 4) as u8,
            focus: row.get::<i64>(1).unwrap_or(0).clamp(0, 4) as u8,
            sleep: row.get::<i64>(2).unwrap_or(0).clamp(0, 4) as u8,
            kindness: row.get::<i64>(3).unwrap_or(0).clamp(0, 4) as u8,
            emotional_regulation: row.get::<i64>(4).unwrap_or(0).clamp(0, 4) as u8,
            general_presence: row.get::<i64>(5).unwrap_or(0).clamp(0, 4) as u8,
        }
    } else {
        UserGoals::default()
    };

    Ok(Json(goals))
}

pub async fn save_goals(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<UserGoals>,
) -> Result<Json<UserGoals>, StatusCode> {
    let conn = state.db.connect().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO user_goals (
            user_id, stress, focus, sleep, kindness, emotional_regulation, general_presence, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(user_id) DO UPDATE SET
            stress = excluded.stress,
            focus = excluded.focus,
            sleep = excluded.sleep,
            kindness = excluded.kindness,
            emotional_regulation = excluded.emotional_regulation,
            general_presence = excluded.general_presence,
            updated_at = excluded.updated_at",
        libsql::params![
            claims.sub,
            req.stress as i64,
            req.focus as i64,
            req.sleep as i64,
            req.kindness as i64,
            req.emotional_regulation as i64,
            req.general_presence as i64,
            now.clone(),
            now,
        ],
    )
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(req))
}

pub async fn clear_user_data(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<ClearDataRequest>,
) -> Result<StatusCode, StatusCode> {
    let conn = state.db.connect().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let user_id = claims.sub;
    let scope = req.scope.unwrap_or_else(|| "all".to_string());

    if scope == "observations" {
        for query in [
            "DELETE FROM companion_observations WHERE user_scope = ?1",
            "DELETE FROM companion_memories WHERE user_scope = ?1 AND kind = 'observation'",
        ] {
            conn.execute(query, libsql::params![user_id.clone()])
                .await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        }
        return Ok(StatusCode::NO_CONTENT);
    }

    for query in [
        "DELETE FROM session_events WHERE user_id = ?1",
        "DELETE FROM session_postcheck WHERE user_id = ?1",
        "DELETE FROM session_precheck WHERE user_id = ?1",
        "DELETE FROM recommendation_log WHERE user_id = ?1",
        "DELETE FROM safety_events WHERE user_id = ?1",
        "DELETE FROM journals WHERE user_id = ?1",
        "DELETE FROM checkins WHERE user_id = ?1",
        "DELETE FROM sessions WHERE user_id = ?1",
        "DELETE FROM user_preferences WHERE user_id = ?1",
        "DELETE FROM user_goals WHERE user_id = ?1",
        "DELETE FROM companion_observations WHERE user_scope = ?1",
        "DELETE FROM companion_memories WHERE user_scope = ?1",
        "DELETE FROM companion_state WHERE user_scope = ?1",
    ] {
        conn.execute(query, libsql::params![user_id.clone()])
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    Ok(StatusCode::NO_CONTENT)
}
