use axum::{
    extract::{Extension, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, Utc};
use serde::Serialize;

use crate::{auth::Claims, AppState};

#[derive(Serialize)]
pub struct Insight {
    pub title: String,
    pub summary: String,
    pub category: String,
    pub confidence: f32,
    pub sample_size: u32,
    pub next_step: String,
}

#[derive(Serialize)]
pub struct InsightsResponse {
    pub insights: Vec<Insight>,
}

const MODE_LABELS: &[(&str, &str)] = &[
    ("yasashii", "呼吸に戻る"),
    ("motto_yasashii", "ただ座る"),
    ("body_scan", "ボディスキャン"),
    ("sbnrr", "SBNRR"),
    ("compassion", "思いを届ける"),
    ("breathing_space", "Breathing Space"),
    ("self_compassion_break", "Self-Compassion Break"),
    ("stress_reset", "Stress Reset"),
    ("sleep_winddown", "Sleep Winddown"),
];

fn mode_label(mode: &str) -> &str {
    MODE_LABELS.iter().find(|(key, _)| *key == mode).map(|(_, value)| *value).unwrap_or(mode)
}

fn confidence_from_sample(sample_size: u32) -> f32 {
    match sample_size {
        0..=1 => 0.22,
        2..=3 => 0.38,
        4..=6 => 0.54,
        7..=10 => 0.68,
        _ => 0.78,
    }
}

pub async fn get_insights(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<InsightsResponse>, StatusCode> {
    let conn = state.db.connect().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let user_id = claims.sub;
    let mut insights = Vec::new();

    let mut time_rows = conn
        .query(
            "SELECT
                CASE
                  WHEN ((CAST(strftime('%H', started_at) AS INTEGER) + 9) % 24) BETWEEN 5 AND 11 THEN 'morning'
                  WHEN ((CAST(strftime('%H', started_at) AS INTEGER) + 9) % 24) BETWEEN 12 AND 16 THEN 'afternoon'
                  WHEN ((CAST(strftime('%H', started_at) AS INTEGER) + 9) % 24) BETWEEN 17 AND 20 THEN 'evening'
                  ELSE 'night'
                END as bucket,
                COUNT(*) as cnt
             FROM sessions
             WHERE user_id = ?1
             GROUP BY bucket
             ORDER BY cnt DESC
             LIMIT 1",
            libsql::params![user_id.clone()],
        )
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if let Some(row) = time_rows.next().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)? {
        let bucket: String = row.get(0).unwrap_or_else(|_| "morning".to_string());
        let count = row.get::<i64>(1).unwrap_or(0).max(0) as u32;
        if count >= 2 {
            let label = match bucket.as_str() {
                "morning" => "朝",
                "afternoon" => "昼",
                "evening" => "夕方",
                _ => "夜",
            };
            insights.push(Insight {
                title: format!("{}に戻りやすいです", label),
                summary: format!("今のところは、{}に開くと入りやすい傾向があります。", label),
                category: "timing".into(),
                confidence: confidence_from_sample(count),
                sample_size: count,
                next_step: format!("次も{}に 2〜3 分から始めてみてください。", label),
            });
        }
    }

    let mut burden_rows = conn
        .query(
            "SELECT s.mode, AVG(p.burden) as avg_burden, COUNT(p.id) as sample_size
             FROM sessions s
             JOIN session_postcheck p ON p.session_id = s.id
             WHERE s.user_id = ?1 AND p.burden IS NOT NULL
             GROUP BY s.mode
             HAVING sample_size >= 2
             ORDER BY avg_burden ASC
             LIMIT 1",
            libsql::params![user_id.clone()],
        )
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if let Some(row) = burden_rows.next().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)? {
        let mode: String = row.get(0).unwrap_or_default();
        let sample_size = row.get::<i64>(2).unwrap_or(0).max(0) as u32;
        insights.push(Insight {
            title: format!("{}は負担が軽めです", mode_label(&mode)),
            summary: format!("いまのところは、{}がいちばん軽く戻りやすい practice です。", mode_label(&mode)),
            category: "lowest_burden_protocol".into(),
            confidence: confidence_from_sample(sample_size),
            sample_size,
            next_step: format!("迷う日は {} を短く選ぶと入りやすそうです。", mode_label(&mode)),
        });
    }

    let mut effect_rows = conn
        .query(
            "SELECT
                s.mode,
                AVG(COALESCE(p.calm_delta_self_report, 0) + COALESCE(p.presence_delta, 0) + COALESCE(p.self_kindness_delta, 0)) / 3.0 as calm_score,
                COUNT(p.id) as sample_size
             FROM sessions s
             JOIN session_postcheck p ON p.session_id = s.id
             WHERE s.user_id = ?1
             GROUP BY s.mode
             HAVING sample_size >= 2
             ORDER BY calm_score DESC
             LIMIT 1",
            libsql::params![user_id.clone()],
        )
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if let Some(row) = effect_rows.next().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)? {
        let mode: String = row.get(0).unwrap_or_default();
        let sample_size = row.get::<i64>(2).unwrap_or(0).max(0) as u32;
        insights.push(Insight {
            title: format!("{}は穏やかさにつながりやすいです", mode_label(&mode)),
            summary: format!("今のところは、{}のあとに calmer / present の感触が出やすい傾向があります。", mode_label(&mode)),
            category: "best_effect_protocol".into(),
            confidence: confidence_from_sample(sample_size),
            sample_size,
            next_step: format!("余裕がある日に {} をもう一度試してみてください。", mode_label(&mode)),
        });
    }

    let mut session_rows = conn
        .query(
            "SELECT mode, started_at FROM sessions WHERE user_id = ?1 ORDER BY started_at ASC",
            libsql::params![user_id],
        )
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let mut previous: Option<DateTime<Utc>> = None;
    let mut reentry_modes = std::collections::HashMap::<String, u32>::new();
    while let Some(row) = session_rows.next().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)? {
        let mode: String = row.get(0).unwrap_or_default();
        let started_at: String = row.get(1).unwrap_or_default();
        let Some(current) = DateTime::parse_from_rfc3339(&started_at).ok().map(|value| value.with_timezone(&Utc)) else {
            continue;
        };
        if let Some(last) = previous {
            if (current - last).num_days() >= 5 {
                *reentry_modes.entry(mode).or_insert(0) += 1;
            }
        }
        previous = Some(current);
    }
    if let Some((mode, count)) = reentry_modes.into_iter().max_by_key(|(_, count)| *count) {
        let sample_size = count.max(1);
        insights.push(Insight {
            title: format!("{}は戻り口になりやすいです", mode_label(&mode)),
            summary: format!("少し間が空いた後は、{}から再開することが多いようです。", mode_label(&mode)),
            category: "reentry_path".into(),
            confidence: confidence_from_sample(sample_size),
            sample_size,
            next_step: format!("久しぶりの日は {} を短く選ぶと入りやすそうです。", mode_label(&mode)),
        });
    }

    insights.truncate(3);
    Ok(Json(InsightsResponse { insights }))
}
