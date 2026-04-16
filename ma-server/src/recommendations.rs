use axum::{
    extract::{Extension, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::{auth::Claims, AppState};

#[derive(Debug, Clone, Deserialize)]
struct ProtocolRegistry {
    protocols: Vec<ProtocolDefinition>,
}

#[derive(Debug, Clone, Deserialize)]
struct ProtocolDefinition {
    id: String,
    default_durations: Vec<u32>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct RecommendationQuery {
    pub available_minutes: Option<u32>,
    pub context: Option<String>,
    pub stress: Option<u8>,
    pub agitation: Option<u8>,
    pub energy: Option<u8>,
    pub sleepiness: Option<u8>,
    pub overwhelm: Option<u8>,
    pub self_criticism: Option<u8>,
}

#[derive(Debug, Clone)]
struct RecommendationInput {
    available_minutes: Option<u32>,
    context: Option<String>,
    stress: Option<u8>,
    agitation: Option<u8>,
    energy: Option<u8>,
    sleepiness: Option<u8>,
    overwhelm: Option<u8>,
    self_criticism: Option<u8>,
    sessions_total: u32,
    days_since_last: Option<u32>,
    time_of_day: TimeOfDay,
    recent_modes: Vec<String>,
    preferred_duration: Option<u32>,
    stress_goal: u8,
    focus_goal: u8,
    sleep_goal: u8,
    kindness_goal: u8,
    regulation_goal: u8,
    presence_goal: u8,
    mode_outcomes: HashMap<String, ModeOutcome>,
}

#[derive(Debug, Clone, Default)]
struct ModeOutcome {
    count: u32,
    avg_burden: Option<f32>,
    avg_calm: Option<f32>,
    avg_presence: Option<f32>,
    avg_kindness: Option<f32>,
    avg_repeat_intent: Option<f32>,
    early_stops: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TimeOfDay {
    Morning,
    Afternoon,
    Evening,
    Night,
}

#[derive(Debug, Clone, Serialize)]
pub struct Recommendation {
    pub protocol_id: String,
    pub launch_mode: String,
    pub title: String,
    pub duration_minutes: u32,
    pub rationale: String,
    pub confidence: f32,
    pub caution_note: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RecommendationsResponse {
    pub recommendations: Vec<Recommendation>,
}

#[derive(Debug, Clone)]
struct Candidate {
    protocol_id: &'static str,
    launch_mode: &'static str,
    title: &'static str,
}

#[derive(Debug, Clone)]
struct ScoredRecommendation {
    candidate: Candidate,
    duration_minutes: u32,
    score: f32,
    rationale: String,
    confidence: f32,
    caution_note: Option<String>,
}

const REGISTRY_JSON: &str = include_str!("../../shared/protocols/registry.json");

const RUNNABLE_CANDIDATES: &[Candidate] = &[
    Candidate {
        protocol_id: "breath_foundation",
        launch_mode: "yasashii",
        title: "呼吸に戻る",
    },
    Candidate {
        protocol_id: "breathing_space",
        launch_mode: "breathing_space",
        title: "Breathing Space",
    },
    Candidate {
        protocol_id: "open_awareness",
        launch_mode: "motto_yasashii",
        title: "ただ座る",
    },
    Candidate {
        protocol_id: "body_scan",
        launch_mode: "body_scan",
        title: "ボディスキャン",
    },
    Candidate {
        protocol_id: "loving_kindness",
        launch_mode: "compassion",
        title: "思いを届ける",
    },
    Candidate {
        protocol_id: "self_compassion_break",
        launch_mode: "self_compassion_break",
        title: "Self-Compassion Break",
    },
    Candidate {
        protocol_id: "stress_reset",
        launch_mode: "stress_reset",
        title: "Stress Reset",
    },
    Candidate {
        protocol_id: "sleep_winddown",
        launch_mode: "sleep_winddown",
        title: "Sleep Winddown",
    },
    Candidate {
        protocol_id: "sbnrr",
        launch_mode: "sbnrr",
        title: "SBNRR",
    },
];

fn load_registry() -> ProtocolRegistry {
    serde_json::from_str(REGISTRY_JSON).expect("valid protocol registry")
}

fn protocol_definition<'a>(
    registry: &'a ProtocolRegistry,
    protocol_id: &str,
) -> Option<&'a ProtocolDefinition> {
    registry.protocols.iter().find(|p| p.id == protocol_id)
}

fn current_time_of_day() -> TimeOfDay {
    let hour = (chrono::Utc::now().timestamp() + 9 * 60 * 60).rem_euclid(24 * 60 * 60) / 3600;
    match hour {
        5..=11 => TimeOfDay::Morning,
        12..=16 => TimeOfDay::Afternoon,
        17..=20 => TimeOfDay::Evening,
        _ => TimeOfDay::Night,
    }
}

async fn recommendation_input(
    state: &AppState,
    user_id: &str,
    query: RecommendationQuery,
) -> Result<RecommendationInput, StatusCode> {
    let conn = state
        .db
        .connect()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut session_rows = conn
        .query(
            "SELECT mode, started_at
             FROM sessions
             WHERE user_id = ?1
             ORDER BY started_at DESC
             LIMIT 12",
            libsql::params![user_id.to_string()],
        )
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut recent_modes = Vec::new();
    let mut latest_started_at: Option<String> = None;
    while let Some(row) = session_rows
        .next()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    {
        let mode: String = row.get(0).unwrap_or_default();
        let started_at: String = row.get(1).unwrap_or_default();
        if latest_started_at.is_none() && !started_at.is_empty() {
            latest_started_at = Some(started_at);
        }
        if !mode.is_empty() {
            recent_modes.push(mode);
        }
    }

    let mut total_rows = conn
        .query(
            "SELECT COUNT(*) FROM sessions WHERE user_id = ?1",
            libsql::params![user_id.to_string()],
        )
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let sessions_total = if let Some(row) = total_rows
        .next()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    {
        row.get::<i64>(0).unwrap_or(0).max(0) as u32
    } else {
        0
    };

    let days_since_last = latest_started_at
        .as_deref()
        .and_then(|ts| chrono::DateTime::parse_from_rfc3339(ts).ok())
        .map(|dt| (chrono::Utc::now() - dt.with_timezone(&chrono::Utc)).num_days().max(0) as u32);

    let mut goal_rows = conn
        .query(
            "SELECT stress, focus, sleep, kindness, emotional_regulation, general_presence
             FROM user_goals WHERE user_id = ?1 LIMIT 1",
            libsql::params![user_id.to_string()],
        )
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let (stress_goal, focus_goal, sleep_goal, kindness_goal, regulation_goal, presence_goal) =
        if let Some(row) = goal_rows.next().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)? {
            (
                row.get::<i64>(0).unwrap_or(0).clamp(0, 4) as u8,
                row.get::<i64>(1).unwrap_or(0).clamp(0, 4) as u8,
                row.get::<i64>(2).unwrap_or(0).clamp(0, 4) as u8,
                row.get::<i64>(3).unwrap_or(0).clamp(0, 4) as u8,
                row.get::<i64>(4).unwrap_or(0).clamp(0, 4) as u8,
                row.get::<i64>(5).unwrap_or(0).clamp(0, 4) as u8,
            )
        } else {
            (0, 0, 0, 0, 0, 0)
        };

    let mut pref_rows = conn
        .query(
            "SELECT preferred_durations_json FROM user_preferences WHERE user_id = ?1 LIMIT 1",
            libsql::params![user_id.to_string()],
        )
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let preferred_duration = if let Some(row) = pref_rows.next().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)? {
        row.get::<String>(0)
            .ok()
            .and_then(|raw| serde_json::from_str::<Vec<u32>>(&raw).ok())
            .and_then(|values| values.into_iter().min())
    } else {
        None
    };

    let mut outcome_rows = conn
        .query(
            "SELECT
                s.mode,
                COUNT(*) as cnt,
                AVG(p.burden) as avg_burden,
                AVG(p.calm_delta_self_report) as avg_calm,
                AVG(p.presence_delta) as avg_presence,
                AVG(p.self_kindness_delta) as avg_kindness,
                AVG(p.repeat_intent) as avg_repeat_intent,
                SUM(CASE
                    WHEN EXISTS (
                        SELECT 1 FROM session_events e
                        WHERE e.session_id = s.id
                          AND e.event_type IN ('aborted', 'shortened')
                    ) THEN 1 ELSE 0
                END) as early_stops
             FROM sessions s
             LEFT JOIN session_postcheck p ON p.session_id = s.id
             WHERE s.user_id = ?1
             GROUP BY s.mode",
            libsql::params![user_id.to_string()],
        )
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut mode_outcomes = HashMap::new();
    while let Some(row) = outcome_rows.next().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)? {
        let mode: String = row.get(0).unwrap_or_default();
        if mode.is_empty() {
            continue;
        }
        mode_outcomes.insert(
            mode,
            ModeOutcome {
                count: row.get::<i64>(1).unwrap_or(0).max(0) as u32,
                avg_burden: row.get::<f64>(2).ok().map(|v| v as f32),
                avg_calm: row.get::<f64>(3).ok().map(|v| v as f32),
                avg_presence: row.get::<f64>(4).ok().map(|v| v as f32),
                avg_kindness: row.get::<f64>(5).ok().map(|v| v as f32),
                avg_repeat_intent: row.get::<f64>(6).ok().map(|v| v as f32),
                early_stops: row.get::<i64>(7).unwrap_or(0).max(0) as u32,
            },
        );
    }

    Ok(RecommendationInput {
        available_minutes: query.available_minutes,
        context: query.context,
        stress: query.stress,
        agitation: query.agitation,
        energy: query.energy,
        sleepiness: query.sleepiness,
        overwhelm: query.overwhelm,
        self_criticism: query.self_criticism,
        sessions_total,
        days_since_last,
        time_of_day: current_time_of_day(),
        recent_modes,
        preferred_duration,
        stress_goal,
        focus_goal,
        sleep_goal,
        kindness_goal,
        regulation_goal,
        presence_goal,
        mode_outcomes,
    })
}

fn choose_duration(input: &RecommendationInput, defaults: &[u32]) -> u32 {
    if defaults.is_empty() {
        return 2;
    }
    if let Some(available) = input.available_minutes {
        if let Some(best) = defaults
            .iter()
            .copied()
            .filter(|duration| *duration <= available)
            .max()
        {
            return best;
        }
        return defaults[0];
    }
    if input.days_since_last.unwrap_or(999) >= 7 || input.sessions_total == 0 {
        return defaults[0];
    }
    if let Some(preferred) = input.preferred_duration {
        if let Some(best) = defaults.iter().copied().filter(|duration| *duration <= preferred).max() {
            return best;
        }
    }
    match input.time_of_day {
        TimeOfDay::Night => defaults.iter().copied().find(|d| *d >= 5).unwrap_or(defaults[0]),
        _ => defaults.iter().copied().find(|d| *d >= 3).unwrap_or(defaults[0]),
    }
}

fn count_recent_mode(recent_modes: &[String], launch_mode: &str) -> usize {
    recent_modes.iter().filter(|mode| mode.as_str() == launch_mode).count()
}

fn rationale_and_score(
    candidate: &Candidate,
    input: &RecommendationInput,
    duration_minutes: u32,
) -> (f32, Vec<&'static str>, Option<String>) {
    let mut score = 0.3_f32;
    let mut reasons = Vec::new();
    let mut caution = None;

    let lapse_days = input.days_since_last.unwrap_or(u32::MAX);
    let high_activation = input.agitation.unwrap_or(0) >= 3 || input.overwhelm.unwrap_or(0) >= 3;
    let low_energy = input.energy.unwrap_or(4) <= 1;
    let sleepy = input.sleepiness.unwrap_or(0) >= 3;
    let self_critical = input.self_criticism.unwrap_or(0) >= 3;
    let work_context = input
        .context
        .as_deref()
        .map(|value| value == "work" || value == "work_break")
        .unwrap_or(matches!(input.time_of_day, TimeOfDay::Afternoon));
    let bedtime_context = input
        .context
        .as_deref()
        .map(|value| value == "bedtime" || value == "sleep")
        .unwrap_or(matches!(input.time_of_day, TimeOfDay::Night));

    if input.sessions_total == 0 || lapse_days >= 7 {
        match candidate.protocol_id {
            "breath_foundation" => {
                score += 0.35;
                reasons.push("戻りやすさを優先しています");
            }
            "breathing_space" | "stress_reset" => {
                score += 0.18;
                reasons.push("短く戻りやすい入口です");
            }
            "body_scan" | "open_awareness" => score -= 0.08,
            _ => {}
        }
    }

    if high_activation {
        match candidate.protocol_id {
            "breath_foundation" => {
                score += 0.25;
                reasons.push("いまは短く足元へ戻りやすいです");
            }
            "stress_reset" => {
                score += 0.22;
                reasons.push("外向きの再定位から入りやすいです");
            }
            "body_scan" => {
                score += 0.12;
                reasons.push("体の接地感を使いやすいです");
                caution = Some("つらさが強ければ、目を開けて短く切り上げて大丈夫です。".to_string());
            }
            "open_awareness" => score -= 0.28,
            "loving_kindness" => score -= 0.1,
            "self_compassion_break" => score -= 0.04,
            _ => {}
        }
    }

    if work_context {
        match candidate.protocol_id {
            "breathing_space" => {
                score += 0.24;
                reasons.push("切り替えに短く使えます");
            }
            "stress_reset" => {
                score += 0.22;
                reasons.push("仕事の合間に次の一歩へ戻しやすいです");
            }
            "sbnrr" => {
                score += 0.16;
                reasons.push("次の一歩へ戻しやすいです");
            }
            "breath_foundation" => score += 0.08,
            "body_scan" => score -= 0.05,
            _ => {}
        }
    }

    if bedtime_context {
        match candidate.protocol_id {
            "sleep_winddown" => {
                score += 0.28;
                reasons.push("夜に覚醒を上げすぎずほどきやすいです");
            }
            "body_scan" => {
                score += 0.14;
                reasons.push("夜は体から静かにほどきやすいです");
            }
            "loving_kindness" => {
                score += 0.08;
                reasons.push("やわらかく閉じやすい流れです");
            }
            "sbnrr" => score -= 0.08,
            _ => {}
        }
    }

    if low_energy || sleepy {
        match candidate.protocol_id {
            "sleep_winddown" if bedtime_context => score += 0.12,
            "body_scan" if bedtime_context => score += 0.1,
            "stress_reset" => score += 0.06,
            "open_awareness" => score -= 0.06,
            _ => {}
        }
    }

    if self_critical {
        match candidate.protocol_id {
            "self_compassion_break" => {
                score += 0.26;
                reasons.push("自分への厳しさが強い日に短く向いています");
            }
            "loving_kindness" => {
                score += 0.18;
                reasons.push("自分への硬さを少しゆるめやすいです");
            }
            "breath_foundation" => score += 0.08,
            _ => {}
        }
    }

    if input.stress_goal >= 2 || input.regulation_goal >= 2 {
        match candidate.protocol_id {
            "breath_foundation" | "stress_reset" => score += 0.1,
            _ => {}
        }
    }

    if input.focus_goal >= 2 {
        match candidate.protocol_id {
            "breathing_space" | "sbnrr" => score += 0.1,
            _ => {}
        }
    }

    if input.sleep_goal >= 2 {
        match candidate.protocol_id {
            "sleep_winddown" => score += 0.14,
            "body_scan" => score += 0.06,
            _ => {}
        }
    }

    if input.kindness_goal >= 2 {
        match candidate.protocol_id {
            "self_compassion_break" | "loving_kindness" => score += 0.1,
            _ => {}
        }
    }

    if input.presence_goal >= 2 && !high_activation {
        match candidate.protocol_id {
            "breathing_space" | "open_awareness" => score += 0.05,
            _ => {}
        }
    }

    if input.stress.unwrap_or(0) >= 3 {
        match candidate.protocol_id {
            "breath_foundation" => score += 0.14,
            "sbnrr" => score += 0.08,
            _ => {}
        }
    }

    if duration_minutes <= 2 {
        score += 0.05;
    } else if duration_minutes >= 10 && lapse_days >= 7 {
        score -= 0.12;
    }

    let recent_count = count_recent_mode(&input.recent_modes, candidate.launch_mode);
    if recent_count >= 3 {
        score -= 0.18;
    } else if recent_count == 1 {
        score += 0.05;
    }

    if let Some(outcome) = input.mode_outcomes.get(candidate.launch_mode) {
        if outcome.count >= 2 {
            if outcome.avg_burden.is_some_and(|value| value <= 1.5) {
                score += 0.14;
                reasons.push("負担が軽く出やすい流れです");
            }
            if outcome.avg_burden.is_some_and(|value| value >= 3.0) {
                score -= 0.16;
            }
            if outcome.avg_repeat_intent.is_some_and(|value| value >= 3.0) {
                score += 0.1;
            }
            if outcome.avg_calm.is_some_and(|value| value >= 2.5)
                || outcome.avg_presence.is_some_and(|value| value >= 2.5)
                || outcome.avg_kindness.is_some_and(|value| value >= 2.5)
            {
                score += 0.12;
                reasons.push("前にも穏やかに戻りやすかった practice です");
            }
        }
        if outcome.early_stops >= 2 {
            score -= 0.18;
        }
    }

    (score, reasons, caution)
}

fn confidence(input: &RecommendationInput, score_gap: f32) -> f32 {
    let mut value = 0.35_f32;
    if input.sessions_total > 0 {
        value += 0.12;
    }
    let supplied_signals = [
        input.available_minutes.is_some(),
        input.context.is_some(),
        input.stress.is_some(),
        input.agitation.is_some(),
        input.energy.is_some(),
        input.sleepiness.is_some(),
        input.overwhelm.is_some(),
        input.self_criticism.is_some(),
    ]
    .into_iter()
    .filter(|v| *v)
    .count();
    value += (supplied_signals as f32 * 0.03).min(0.18);
    value += score_gap.clamp(0.0, 0.2);
    value.clamp(0.2, 0.9)
}

fn format_rationale(
    candidate: &Candidate,
    reasons: &[&'static str],
    duration_minutes: u32,
    input: &RecommendationInput,
) -> String {
    let lead = if input.days_since_last.unwrap_or(u32::MAX) >= 7 {
        "少し間が空いていても戻りやすいように、"
    } else {
        ""
    };
    let reason_text = reasons.first().copied().unwrap_or(match candidate.protocol_id {
        "breath_foundation" => "短く始めやすいです",
        "breathing_space" => "切り替えの短い間に使いやすいです",
        "open_awareness" => "静かに座る入口になります",
        "body_scan" => "体から落ち着きを作りやすいです",
        "loving_kindness" => "少しやさしさへ戻りやすいです",
        "self_compassion_break" => "自分への硬さがある日に短く戻りやすいです",
        "stress_reset" => "仕事の流れを切らず整えやすいです",
        "sleep_winddown" => "夜にやわらかく下りやすいです",
        "sbnrr" => "反応を急がず整えやすいです",
        _ => "今の流れに合いやすいです",
    });
    format!("{lead}{duration_minutes}分で始めやすく、{reason_text}。")
}

fn score_recommendations(input: &RecommendationInput, registry: &ProtocolRegistry) -> Vec<ScoredRecommendation> {
    let mut scored = Vec::new();

    for candidate in RUNNABLE_CANDIDATES {
        let Some(protocol) = protocol_definition(registry, candidate.protocol_id) else {
            continue;
        };
        let duration_minutes = choose_duration(input, &protocol.default_durations);
        let (score, reasons, caution_note) = rationale_and_score(candidate, input, duration_minutes);
        scored.push(ScoredRecommendation {
            candidate: candidate.clone(),
            duration_minutes,
            score,
            rationale: format_rationale(candidate, &reasons, duration_minutes, input),
            confidence: 0.35,
            caution_note,
        });
    }

    scored.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let top_scores: Vec<f32> = scored.iter().take(3).map(|item| item.score).collect();
    for (idx, item) in scored.iter_mut().enumerate() {
        let next_score = top_scores.get(idx + 1).copied().unwrap_or(item.score - 0.05);
        item.confidence = confidence(input, (item.score - next_score).max(0.0));
    }

    scored
}

pub async fn get_recommendations(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Query(query): Query<RecommendationQuery>,
) -> Result<Json<RecommendationsResponse>, StatusCode> {
    let registry = load_registry();
    let input = recommendation_input(&state, &claims.sub, query).await?;
    let recommendations = score_recommendations(&input, &registry)
        .into_iter()
        .take(3)
        .map(|item| Recommendation {
            protocol_id: item.candidate.protocol_id.to_string(),
            launch_mode: item.candidate.launch_mode.to_string(),
            title: item.candidate.title.to_string(),
            duration_minutes: item.duration_minutes,
            rationale: item.rationale,
            confidence: (item.confidence * 100.0).round() / 100.0,
            caution_note: item.caution_note,
        })
        .collect();

    Ok(Json(RecommendationsResponse { recommendations }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_input() -> RecommendationInput {
        RecommendationInput {
            available_minutes: None,
            context: None,
            stress: None,
            agitation: None,
            energy: None,
            sleepiness: None,
            overwhelm: None,
            self_criticism: None,
            sessions_total: 0,
            days_since_last: None,
            time_of_day: TimeOfDay::Morning,
            recent_modes: vec![],
            preferred_duration: None,
            stress_goal: 0,
            focus_goal: 0,
            sleep_goal: 0,
            kindness_goal: 0,
            regulation_goal: 0,
            presence_goal: 0,
            mode_outcomes: HashMap::new(),
        }
    }

    #[test]
    fn hiatus_prioritizes_easy_reentry() {
        let registry = load_registry();
        let mut input = base_input();
        input.sessions_total = 5;
        input.days_since_last = Some(12);

        let scored = score_recommendations(&input, &registry);
        assert_eq!(scored[0].candidate.protocol_id, "breath_foundation");
    }

    #[test]
    fn high_activation_penalizes_open_awareness() {
        let registry = load_registry();
        let mut input = base_input();
        input.sessions_total = 8;
        input.days_since_last = Some(1);
        input.agitation = Some(4);
        input.overwhelm = Some(4);

        let scored = score_recommendations(&input, &registry);
        let open = scored.iter().find(|item| item.candidate.protocol_id == "open_awareness").unwrap();
        let breath = scored.iter().find(|item| item.candidate.protocol_id == "breath_foundation").unwrap();
        assert!(breath.score > open.score);
    }

    #[test]
    fn bedtime_prefers_body_scan() {
        let registry = load_registry();
        let mut input = base_input();
        input.sessions_total = 4;
        input.days_since_last = Some(0);
        input.time_of_day = TimeOfDay::Night;
        input.context = Some("bedtime".to_string());

        let scored = score_recommendations(&input, &registry);
        assert_eq!(scored[0].candidate.protocol_id, "sleep_winddown");
    }

    #[test]
    fn work_context_prefers_brief_transition_protocols() {
        let registry = load_registry();
        let mut input = base_input();
        input.sessions_total = 6;
        input.days_since_last = Some(1);
        input.context = Some("work_break".to_string());
        input.available_minutes = Some(3);

        let scored = score_recommendations(&input, &registry);
        assert!(matches!(
            scored[0].candidate.protocol_id,
            "breathing_space" | "stress_reset"
        ));
    }

    #[test]
    fn self_criticism_prefers_self_compassion_break() {
        let registry = load_registry();
        let mut input = base_input();
        input.sessions_total = 3;
        input.days_since_last = Some(0);
        input.self_criticism = Some(4);

        let scored = score_recommendations(&input, &registry);
        assert_eq!(scored[0].candidate.protocol_id, "self_compassion_break");
    }
}
