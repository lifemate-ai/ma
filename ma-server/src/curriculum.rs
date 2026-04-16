use axum::{Json, http::StatusCode, extract::{State, Extension}};
use serde::Serialize;
use crate::{AppState, auth::Claims};

#[derive(Serialize)]
pub struct CurriculumStatus {
    pub current_week: u32,
    pub suggested_modes: Vec<String>,
    pub tried_modes: Vec<String>,
    pub total_sessions: u32,
}

const WEEK_MODES: &[&[&str]] = &[
    &["yasashii", "motto_yasashii"],
    &["sbnrr", "body_scan"],
    &["emotion_mapping", "checkin"],
    &["gratitude", "compassion"],
];

pub async fn get_status(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<CurriculumStatus>, StatusCode> {
    let conn = state.db.connect().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let user_filter = claims.sub;

    // 全セッション数と初回日時
    let mut rows = conn.query(
        "SELECT COUNT(*), MIN(started_at) FROM sessions WHERE user_id = ?1",
        libsql::params![user_filter.clone()]
    ).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let (total_sessions, first_session_at): (u32, Option<String>) =
        if let Some(row) = rows.next().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)? {
            (
                row.get::<i64>(0).unwrap_or(0) as u32,
                row.get(1).ok(),
            )
        } else {
            (0, None)
        };

    // 試したことのあるモード
    let mut rows = conn.query(
        "SELECT DISTINCT mode FROM sessions WHERE user_id = ?1",
        libsql::params![user_filter]
    ).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut tried_modes = Vec::new();
    while let Some(row) = rows.next().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)? {
        tried_modes.push(row.get::<String>(0).unwrap_or_default());
    }

    // 経過週を初回セッション日から計算
    let current_week = if let Some(first_at) = first_session_at {
        let first_ms = chrono::DateTime::parse_from_rfc3339(&first_at)
            .map(|d| d.timestamp_millis())
            .unwrap_or(0);
        let now_ms = chrono::Utc::now().timestamp_millis();
        let days_elapsed = ((now_ms - first_ms) / 86_400_000) as u32;
        let week = (days_elapsed / 7) + 1;
        week.min(4)  // cap at week 4 (week 5+ shows all modes)
    } else {
        1
    };

    let suggested_modes = if total_sessions == 0 {
        WEEK_MODES[0].iter().map(|s| s.to_string()).collect()
    } else if current_week as usize <= WEEK_MODES.len() {
        WEEK_MODES[(current_week - 1) as usize].iter().map(|s| s.to_string()).collect()
    } else {
        // week 5+: suggest modes not yet tried
        let all_modes = WEEK_MODES.iter().flat_map(|w| w.iter()).map(|s| s.to_string());
        all_modes.filter(|m| !tried_modes.contains(m)).collect()
    };

    Ok(Json(CurriculumStatus {
        current_week,
        suggested_modes,
        tried_modes,
        total_sessions,
    }))
}
