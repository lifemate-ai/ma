use axum::{Json, http::StatusCode, extract::{State, Extension}};
use serde::Serialize;
use crate::{AppState, auth::Claims};

#[derive(Serialize)]
pub struct Insight {
    pub text: String,
    pub category: String,
}

#[derive(Serialize)]
pub struct InsightsResponse {
    pub insights: Vec<Insight>,
}

const MODE_LABELS: &[(&str, &str)] = &[
    ("yasashii", "やさしい呼吸"),
    ("motto_yasashii", "ただ座る"),
    ("body_scan", "ボディスキャン"),
    ("sbnrr", "SBNRR"),
    ("emotion_mapping", "感情マッピング"),
    ("gratitude", "感謝プラクティス"),
    ("compassion", "慈悲の瞑想"),
    ("checkin", "チェックイン"),
];

fn mode_label(mode: &str) -> &str {
    MODE_LABELS.iter().find(|(k, _)| *k == mode).map(|(_, v)| *v).unwrap_or(mode)
}

pub async fn get_insights(
    State(state): State<AppState>,
    claims: Option<Extension<Claims>>,
) -> Result<Json<InsightsResponse>, StatusCode> {
    let user_id = claims.map(|Extension(c)| c.sub);
    let conn = state.db.connect().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let user_filter = user_id.as_deref().unwrap_or("");

    // セッション数チェック（5未満なら空を返す）
    let mut rows = conn.query(
        "SELECT COUNT(*) FROM sessions WHERE (user_id = ?1 OR ?1 = '')",
        libsql::params![user_filter]
    ).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let total: i64 = if let Some(row) = rows.next().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)? {
        row.get(0).unwrap_or(0)
    } else { 0 };

    if total < 5 {
        return Ok(Json(InsightsResponse { insights: vec![] }));
    }

    let mut insights = Vec::new();

    // 1. 最もよく使うモード
    let mut rows = conn.query(
        "SELECT mode, COUNT(*) as cnt FROM sessions WHERE (user_id = ?1 OR ?1 = '') GROUP BY mode ORDER BY cnt DESC LIMIT 1",
        libsql::params![user_filter]
    ).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some(row) = rows.next().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)? {
        let mode: String = row.get(0).unwrap_or_default();
        let cnt: i64 = row.get(1).unwrap_or(0);
        if cnt >= 2 {
            insights.push(Insight {
                text: format!("よく「{}」を選んでいますね。", mode_label(&mode)),
                category: "mode_pattern".into(),
            });
        }
    }

    // 2. チェックインの体の状態パターン
    let mut rows = conn.query(
        "SELECT body_state, COUNT(*) as cnt FROM checkins WHERE (user_id = ?1 OR ?1 = '') GROUP BY body_state ORDER BY cnt DESC LIMIT 1",
        libsql::params![user_filter]
    ).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some(row) = rows.next().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)? {
        let body_state: String = row.get(0).unwrap_or_default();
        let cnt: i64 = row.get(1).unwrap_or(0);
        if cnt >= 2 && !body_state.is_empty() {
            insights.push(Insight {
                text: format!("チェックインで「{}」とよく書いていますね。", body_state),
                category: "body_pattern".into(),
            });
        }
    }

    // 3. 時間帯パターン（JST = UTC+9）
    let mut rows = conn.query(
        "SELECT (CAST(strftime('%H', started_at) AS INTEGER) + 9) % 24 as jst_hour,
                COUNT(*) as cnt
         FROM sessions WHERE (user_id = ?1 OR ?1 = '')
         GROUP BY jst_hour
         ORDER BY cnt DESC
         LIMIT 1",
        libsql::params![user_filter]
    ).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some(row) = rows.next().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)? {
        let hour: i64 = row.get(0).unwrap_or(12);
        let cnt: i64 = row.get(1).unwrap_or(0);
        if cnt >= 2 {
            let time_of_day = match hour {
                5..=11 => "朝",
                12..=16 => "昼",
                17..=20 => "夕方",
                _ => "夜",
            };
            insights.push(Insight {
                text: format!("{}にセッションすることが多いようです。", time_of_day),
                category: "time_pattern".into(),
            });
        }
    }

    // 4. 先週との頻度比較
    let mut rows = conn.query(
        "SELECT
            SUM(CASE WHEN started_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) as this_week,
            SUM(CASE WHEN started_at < datetime('now', '-7 days') AND started_at >= datetime('now', '-14 days') THEN 1 ELSE 0 END) as last_week
         FROM sessions WHERE (user_id = ?1 OR ?1 = '')",
        libsql::params![user_filter]
    ).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some(row) = rows.next().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)? {
        let this_week: i64 = row.get(0).unwrap_or(0);
        let last_week: i64 = row.get(1).unwrap_or(0);
        if this_week > last_week && last_week > 0 {
            insights.push(Insight {
                text: "先週より多く練習しているようです。".into(),
                category: "frequency".into(),
            });
        } else if this_week < last_week && last_week > 0 {
            insights.push(Insight {
                text: "練習のペースが少し落ち着いています。それでいい。".into(),
                category: "frequency".into(),
            });
        }
    }

    // Top 3
    insights.truncate(3);

    Ok(Json(InsightsResponse { insights }))
}
