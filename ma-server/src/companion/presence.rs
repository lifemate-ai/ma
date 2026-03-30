use std::cmp::Ordering;

use chrono::Utc;
use libsql::{Connection, Database};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const ANONYMOUS_SCOPE: &str = "__anonymous__";
const BASE_THRESHOLD: f32 = 0.42;
const MIN_THRESHOLD: f32 = 0.18;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct CompanionState {
    pub familiarity: f32,
    pub attunement: f32,
    pub steadiness: f32,
    pub protective_tension: f32,
    pub openness: f32,
    pub watchfulness: f32,
}

impl Default for CompanionState {
    fn default() -> Self {
        Self {
            familiarity: 0.4,
            attunement: 0.45,
            steadiness: 0.62,
            protective_tension: 0.22,
            openness: 0.38,
            watchfulness: 0.34,
        }
    }
}

impl CompanionState {
    fn clamp(value: f32) -> f32 {
        value.clamp(0.0, 1.0)
    }

    fn settle(&mut self) {
        let baseline = Self::default();
        self.familiarity = Self::clamp(self.familiarity + (baseline.familiarity - self.familiarity) * 0.08);
        self.attunement = Self::clamp(self.attunement + (baseline.attunement - self.attunement) * 0.08);
        self.steadiness = Self::clamp(self.steadiness + (baseline.steadiness - self.steadiness) * 0.08);
        self.protective_tension =
            Self::clamp(self.protective_tension + (baseline.protective_tension - self.protective_tension) * 0.08);
        self.openness = Self::clamp(self.openness + (baseline.openness - self.openness) * 0.08);
        self.watchfulness = Self::clamp(self.watchfulness + (baseline.watchfulness - self.watchfulness) * 0.08);
    }

    fn apply(&mut self, winner: Option<&WorkspaceSignal>, prediction_error: f32) {
        self.settle();

        if let Some(signal) = winner {
            match signal.kind.as_str() {
                "journal" => {
                    self.attunement += 0.08 + 0.08 * signal.activation;
                    self.steadiness += 0.03;
                }
                "checkin" => {
                    self.attunement += 0.1;
                    self.protective_tension += 0.03 + 0.08 * signal.urgency;
                }
                "practice" => {
                    self.familiarity += 0.08 + 0.05 * signal.activation;
                    self.steadiness += 0.04;
                }
                "gap" => {
                    self.protective_tension += 0.1 + 0.12 * signal.novelty;
                    self.attunement += 0.05;
                }
                "transition" => {
                    self.openness += 0.08 + 0.08 * signal.novelty;
                    self.steadiness -= 0.04;
                }
                "message" => {
                    self.attunement += 0.07;
                    self.openness += 0.04;
                }
                "observation" => {
                    self.attunement += 0.1;
                    self.watchfulness += 0.16 + 0.08 * signal.activation;
                    self.steadiness += 0.05;
                }
                _ => {
                    self.attunement += 0.03;
                }
            }
        }

        self.protective_tension += 0.14 * prediction_error;
        self.openness += 0.08 * prediction_error;
        self.steadiness -= 0.1 * prediction_error;

        self.familiarity = Self::clamp(self.familiarity);
        self.attunement = Self::clamp(self.attunement);
        self.steadiness = Self::clamp(self.steadiness);
        self.protective_tension = Self::clamp(self.protective_tension);
        self.openness = Self::clamp(self.openness);
        self.watchfulness = Self::clamp(self.watchfulness);
    }

    fn as_prompt_lines(&self) -> Vec<String> {
        let familiarity = if self.familiarity >= 0.7 {
            "同じ人を迎える親しみがかなり育っている"
        } else if self.familiarity >= 0.5 {
            "戻ってくる相手としての親しみがある"
        } else {
            "親しみはまだ静かに育っている途中"
        };

        let stance = if self.protective_tension >= 0.6 {
            "少し慎重で、細い変化を見逃したくない"
        } else if self.steadiness >= 0.68 {
            "声の重心は安定していて、落ち着いて迎えられる"
        } else {
            "やわらかく受け止めたいが、少しだけ揺れもある"
        };

        let attention = if self.attunement >= 0.7 {
            "相手の小さな変化をかなり拾いやすい"
        } else if self.watchfulness >= 0.58 {
            "言葉だけでなく様子も確かめながら見守ろうとしている"
        } else if self.openness >= 0.6 {
            "いつもと違う流れも受け止める余白がある"
        } else {
            "静かに様子を見ながら寄り添う"
        };

        vec![
            familiarity.to_string(),
            stance.to_string(),
            attention.to_string(),
        ]
    }
}

#[derive(Debug, Clone)]
pub struct PresenceEvent {
    pub phase: String,
    pub time_of_day: String,
    pub mode: Option<String>,
    pub user_message: Option<String>,
    pub days_since_last: Option<u32>,
    pub elapsed_seconds: Option<u32>,
    pub duration_seconds: Option<u32>,
    pub journal_text: Option<String>,
    pub observation_text: Option<String>,
}

#[derive(Debug, Clone)]
struct MemoryRow {
    kind: String,
    summary: String,
    importance: f32,
    confidence: f32,
    activation_count: i64,
    last_seen_at: String,
}

#[derive(Debug, Clone)]
struct WorkspaceSignal {
    kind: String,
    summary: String,
    activation: f32,
    urgency: f32,
    novelty: f32,
}

impl WorkspaceSignal {
    fn score(&self) -> f32 {
        self.activation * (0.4 * self.urgency + 0.35 * self.novelty + 0.25)
    }
}

#[derive(Debug, Clone)]
pub struct PresenceSnapshot {
    pub prompt_context: String,
    pub prediction_error: f32,
}

fn user_scope(user_id: Option<&str>) -> String {
    user_id.unwrap_or(ANONYMOUS_SCOPE).to_string()
}

fn query_filter(user_id: Option<&str>) -> String {
    user_id.unwrap_or("").to_string()
}

fn compact_text(text: &str, max_chars: usize) -> String {
    let normalized = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let truncated: String = normalized.chars().take(max_chars).collect();
    if normalized.chars().count() > max_chars {
        format!("{truncated}…")
    } else {
        truncated
    }
}

fn time_bucket(label: &str) -> &'static str {
    match label {
        "morning" => "morning",
        "afternoon" => "afternoon",
        "evening" => "evening",
        "night" => "night",
        _ => "unknown",
    }
}

fn effective_threshold(prediction_error: f32) -> f32 {
    (BASE_THRESHOLD - 0.18 * prediction_error.tanh()).max(MIN_THRESHOLD)
}

async fn load_state(db: &Database, user_id: Option<&str>) -> anyhow::Result<CompanionState> {
    let conn = db.connect()?;
    let scope = user_scope(user_id);
    let mut rows = conn
        .query(
            "SELECT state_json FROM companion_state WHERE user_scope = ?1 LIMIT 1",
            libsql::params![scope],
        )
        .await?;
    if let Some(row) = rows.next().await? {
        let raw: String = row.get(0).unwrap_or_default();
        if let Ok(state) = serde_json::from_str::<CompanionState>(&raw) {
            return Ok(state);
        }
    }
    Ok(CompanionState::default())
}

async fn save_state(db: &Database, user_id: Option<&str>, state: &CompanionState) -> anyhow::Result<()> {
    let conn = db.connect()?;
    let scope = user_scope(user_id);
    let now = Utc::now().to_rfc3339();
    let json = serde_json::to_string(state)?;
    conn.execute(
        "INSERT INTO companion_state (user_scope, state_json, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(user_scope) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at",
        libsql::params![scope, json, now],
    )
    .await?;
    Ok(())
}

async fn upsert_memory(
    db: &Database,
    user_id: Option<&str>,
    kind: &str,
    summary: &str,
    source_ref: Option<&str>,
    importance: f32,
    confidence: f32,
) -> anyhow::Result<()> {
    let conn = db.connect()?;
    let scope = user_scope(user_id);
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO companion_memories
            (id, user_scope, kind, summary, source_ref, importance, confidence, activation_count, last_seen_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?9, ?10)
         ON CONFLICT(user_scope, kind, summary) DO UPDATE SET
            source_ref = COALESCE(excluded.source_ref, companion_memories.source_ref),
            importance = MAX(companion_memories.importance, excluded.importance),
            confidence = ((companion_memories.confidence * companion_memories.activation_count) + excluded.confidence)
                         / (companion_memories.activation_count + 1),
            activation_count = companion_memories.activation_count + 1,
            last_seen_at = excluded.last_seen_at,
            updated_at = excluded.updated_at",
        libsql::params![
            Uuid::new_v4().to_string(),
            scope,
            kind.to_string(),
            summary.to_string(),
            source_ref.map(|s| s.to_string()),
            importance,
            confidence,
            now.clone(),
            now.clone(),
            now,
        ],
    )
    .await?;
    Ok(())
}

async fn load_recent_memories(db: &Database, user_id: Option<&str>, limit: i64) -> anyhow::Result<Vec<MemoryRow>> {
    let conn = db.connect()?;
    let scope = user_scope(user_id);
    let mut rows = conn
        .query(
            "SELECT kind, summary, importance, confidence, activation_count, last_seen_at
             FROM companion_memories
             WHERE user_scope = ?1
             ORDER BY last_seen_at DESC, activation_count DESC
             LIMIT ?2",
            libsql::params![scope, limit],
        )
        .await?;

    let mut result = Vec::new();
    while let Some(row) = rows.next().await? {
        result.push(MemoryRow {
            kind: row.get(0).unwrap_or_default(),
            summary: row.get(1).unwrap_or_default(),
            importance: row.get::<f64>(2).unwrap_or(0.5) as f32,
            confidence: row.get::<f64>(3).unwrap_or(0.5) as f32,
            activation_count: row.get(4).unwrap_or(0),
            last_seen_at: row.get(5).unwrap_or_default(),
        });
    }
    Ok(result)
}

async fn preferred_mode(db: &Database, user_id: Option<&str>) -> anyhow::Result<Option<(String, i64)>> {
    let conn = db.connect()?;
    let filter = query_filter(user_id);
    let mut rows = conn
        .query(
            "SELECT mode, COUNT(*) as cnt
             FROM sessions
             WHERE (user_id = ?1 OR ?1 = '')
             GROUP BY mode
             ORDER BY cnt DESC
             LIMIT 1",
            libsql::params![filter],
        )
        .await?;
    if let Some(row) = rows.next().await? {
        let mode: String = row.get(0).unwrap_or_default();
        let count: i64 = row.get(1).unwrap_or(0);
        if !mode.is_empty() {
            return Ok(Some((mode, count)));
        }
    }
    Ok(None)
}

async fn preferred_time_bucket(db: &Database, user_id: Option<&str>) -> anyhow::Result<Option<String>> {
    let conn = db.connect()?;
    let filter = query_filter(user_id);
    let mut rows = conn
        .query(
            "SELECT
                CASE
                    WHEN ((CAST(strftime('%H', started_at) AS INTEGER) + 9) % 24) < 12 THEN 'morning'
                    WHEN ((CAST(strftime('%H', started_at) AS INTEGER) + 9) % 24) < 17 THEN 'afternoon'
                    WHEN ((CAST(strftime('%H', started_at) AS INTEGER) + 9) % 24) < 21 THEN 'evening'
                    ELSE 'night'
                END as bucket,
                COUNT(*) as cnt
             FROM sessions
             WHERE (user_id = ?1 OR ?1 = '')
             GROUP BY bucket
             ORDER BY cnt DESC
             LIMIT 1",
            libsql::params![filter],
        )
        .await?;
    if let Some(row) = rows.next().await? {
        let bucket: String = row.get(0).unwrap_or_default();
        if !bucket.is_empty() {
            return Ok(Some(bucket));
        }
    }
    Ok(None)
}

fn recency_urgency(timestamp: &str) -> f32 {
    let Ok(dt) = chrono::DateTime::parse_from_rfc3339(timestamp) else {
        return 0.4;
    };
    let age_hours = (Utc::now() - dt.with_timezone(&Utc)).num_hours().max(0) as f32;
    if age_hours <= 12.0 {
        0.9
    } else if age_hours <= 48.0 {
        0.7
    } else if age_hours <= 168.0 {
        0.5
    } else {
        0.3
    }
}

fn memory_signal(memory: &MemoryRow) -> WorkspaceSignal {
    let activation_novelty = 1.0 / (1.0 + memory.activation_count.max(0) as f32);
    let urgency = recency_urgency(&memory.last_seen_at);
    WorkspaceSignal {
        kind: memory.kind.clone(),
        summary: memory.summary.clone(),
        activation: (0.45 * memory.importance + 0.35 * memory.confidence + 0.2 * urgency).clamp(0.0, 1.0),
        urgency,
        novelty: (0.6 * activation_novelty + 0.4 * (1.0 - memory.confidence)).clamp(0.0, 1.0),
    }
}

fn compute_prediction_error(
    event: &PresenceEvent,
    preferred_mode: Option<&str>,
    preferred_time_bucket: Option<&str>,
) -> f32 {
    let mut error = 0.0;

    if let Some(days) = event.days_since_last {
        if days >= 3 {
            error += ((days as f32) / 14.0).min(0.35);
        } else if days == 0 {
            error += 0.05;
        }
    }

    if let (Some(current), Some(preferred)) = (event.mode.as_deref(), preferred_mode) {
        if current != preferred {
            error += 0.18;
        } else {
            error += 0.03;
        }
    }

    if let Some(preferred) = preferred_time_bucket {
        if time_bucket(&event.time_of_day) != preferred {
            error += 0.16;
        }
    }

    if event.user_message.as_deref().is_some_and(|msg| !msg.trim().is_empty()) {
        error += 0.08;
    }

    if event.journal_text.as_deref().is_some_and(|text| text.chars().count() > 60) {
        error += 0.05;
    }

    if event.observation_text.as_deref().is_some_and(|text| !text.trim().is_empty()) {
        error += 0.1;
    }

    if event.phase == "mid" && event.elapsed_seconds.unwrap_or_default() >= 60 {
        error += 0.04;
    }

    error.clamp(0.0, 1.0)
}

fn sort_signals(signals: &mut [WorkspaceSignal]) {
    signals.sort_by(|left, right| {
        right
            .score()
            .partial_cmp(&left.score())
            .unwrap_or(Ordering::Equal)
    });
}

fn select_workspace(mut signals: Vec<WorkspaceSignal>, prediction_error: f32) -> (Option<WorkspaceSignal>, Vec<WorkspaceSignal>) {
    sort_signals(&mut signals);
    let threshold = effective_threshold(prediction_error);
    let winner = signals.first().filter(|signal| signal.score() >= threshold).cloned();
    let peripherals = if winner.is_some() {
        signals.into_iter().skip(1).take(3).collect()
    } else {
        signals.into_iter().take(3).collect()
    };
    (winner, peripherals)
}

fn build_prompt_context(
    state: &CompanionState,
    prediction_error: f32,
    winner: Option<&WorkspaceSignal>,
    peripherals: &[WorkspaceSignal],
) -> String {
    let mut lines = Vec::new();
    lines.push("コンパニオンの持続状態:".to_string());
    for line in state.as_prompt_lines() {
        lines.push(format!("- {line}"));
    }

    lines.push("前景化されているもの:".to_string());
    if let Some(winner) = winner {
        lines.push(format!("- {}", winner.summary));
    } else {
        lines.push("- 今日は静かな戻り方で、強すぎる前景はまだない".to_string());
    }

    if !peripherals.is_empty() {
        lines.push("背景で気にかかっていること:".to_string());
        for signal in peripherals {
            lines.push(format!("- {}", signal.summary));
        }
    }

    let prediction_line = if prediction_error >= 0.55 {
        "今日は少し意外な戻り方で、ふだんより敏感になっている"
    } else if prediction_error >= 0.25 {
        "いつも通りではない気配が少しあり、注意がやや開いている"
    } else {
        "流れは比較的なめらかで、落ち着いて迎えられる"
    };
    lines.push("予測誤差の状態:".to_string());
    lines.push(format!("- {prediction_line}"));

    lines.join("\n")
}

pub async fn migrate(conn: &Connection) -> anyhow::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS companion_state (
            user_scope TEXT PRIMARY KEY,
            state_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS companion_memories (
            id TEXT PRIMARY KEY,
            user_scope TEXT NOT NULL,
            kind TEXT NOT NULL,
            summary TEXT NOT NULL,
            source_ref TEXT,
            importance REAL NOT NULL DEFAULT 0.5,
            confidence REAL NOT NULL DEFAULT 0.5,
            activation_count INTEGER NOT NULL DEFAULT 1,
            last_seen_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_companion_memories_scope_kind_summary
            ON companion_memories(user_scope, kind, summary);
        CREATE INDEX IF NOT EXISTS idx_companion_memories_scope_seen
            ON companion_memories(user_scope, last_seen_at DESC);
        CREATE TABLE IF NOT EXISTS companion_observations (
            id TEXT PRIMARY KEY,
            user_scope TEXT NOT NULL,
            source TEXT NOT NULL,
            summary TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_companion_observations_scope_created
            ON companion_observations(user_scope, created_at DESC);",
    )
    .await?;
    Ok(())
}

pub async fn remember_session(
    db: &Database,
    user_id: Option<&str>,
    mode: &str,
    duration_seconds: i64,
    session_id: &str,
) -> anyhow::Result<()> {
    let summary = if duration_seconds > 0 {
        format!("最近の実践では「{mode}」を{}秒つづけた", duration_seconds)
    } else {
        format!("最近の実践で「{mode}」を選んだ")
    };
    upsert_memory(db, user_id, "practice", &summary, Some(session_id), 0.72, 0.82).await
}

pub async fn remember_journal(
    db: &Database,
    user_id: Option<&str>,
    journal_id: &str,
    text: &str,
    companion_loop: Option<&str>,
) -> anyhow::Result<()> {
    let summary = format!("最近のふり返りでは「{}」と話していた", compact_text(text, 90));
    upsert_memory(db, user_id, "journal", &summary, Some(journal_id), 0.84, 0.78).await?;
    if let Some(loop_text) = companion_loop.filter(|value| !value.trim().is_empty()) {
        let loop_summary = format!("前回は「{}」と受け止めて返した", compact_text(loop_text, 90));
        upsert_memory(db, user_id, "reflection", &loop_summary, Some(journal_id), 0.68, 0.7).await?;
    }
    Ok(())
}

pub async fn remember_checkin(
    db: &Database,
    user_id: Option<&str>,
    checkin_id: &str,
    emotion: &str,
    body_state: &str,
    intention: &str,
) -> anyhow::Result<()> {
    let summary = format!(
        "直近のチェックインは 感情={} / 体={} / 意図={}",
        compact_text(emotion, 24),
        compact_text(body_state, 24),
        compact_text(intention, 24)
    );
    upsert_memory(db, user_id, "checkin", &summary, Some(checkin_id), 0.88, 0.86).await
}

pub async fn remember_observation(
    db: &Database,
    user_id: Option<&str>,
    observation_id: &str,
    source: &str,
    summary: &str,
) -> anyhow::Result<()> {
    let conn = db.connect()?;
    let scope = user_scope(user_id);
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO companion_observations (id, user_scope, source, summary, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        libsql::params![
            observation_id.to_string(),
            scope,
            source.to_string(),
            summary.to_string(),
            now,
        ],
    )
    .await?;

    let memory_summary = format!(
        "最近は{}越しに「{}」が見えていた",
        compact_text(source, 16),
        compact_text(summary, 90)
    );
    upsert_memory(db, user_id, "observation", &memory_summary, Some(observation_id), 0.9, 0.88).await
}

pub async fn build_presence_snapshot(
    db: &Database,
    user_id: Option<&str>,
    event: &PresenceEvent,
) -> anyhow::Result<PresenceSnapshot> {
    let memories = load_recent_memories(db, user_id, 18).await?;
    let preferred_mode = preferred_mode(db, user_id).await?;
    let preferred_time_bucket = preferred_time_bucket(db, user_id).await?;
    let prediction_error = compute_prediction_error(
        event,
        preferred_mode.as_ref().map(|(mode, _)| mode.as_str()),
        preferred_time_bucket.as_deref(),
    );

    let mut signals: Vec<WorkspaceSignal> = memories.iter().map(memory_signal).collect();

    if let Some(days) = event.days_since_last.filter(|days| *days >= 2) {
        signals.push(WorkspaceSignal {
            kind: "gap".into(),
            summary: format!("{days}日ぶりに戻ってきたこと自体が少し大きい"),
            activation: 0.82,
            urgency: 0.74,
            novelty: ((days as f32) / 10.0).clamp(0.2, 0.95),
        });
    }

    if let Some(message) = event.user_message.as_deref().filter(|msg| !msg.trim().is_empty()) {
        signals.push(WorkspaceSignal {
            kind: "message".into(),
            summary: format!("最初のひとこと「{}」に今の気配が出ている", compact_text(message, 64)),
            activation: 0.78,
            urgency: 0.8,
            novelty: 0.42,
        });
    }

    if let (Some(current_mode), Some((preferred, count))) = (event.mode.as_deref(), preferred_mode.as_ref()) {
        let (summary, novelty) = if current_mode == preferred {
            (
                format!("よく戻るやり方「{current_mode}」をまた選んでいる"),
                0.16,
            )
        } else {
            (
                format!("いつもの「{preferred}」ではなく、今日は「{current_mode}」を選んでいる"),
                0.72,
            )
        };
        signals.push(WorkspaceSignal {
            kind: if current_mode == preferred { "practice".into() } else { "transition".into() },
            summary,
            activation: ((*count as f32) / 6.0).clamp(0.45, 0.82),
            urgency: 0.48,
            novelty,
        });
    }

    if let Some(observation) = event.observation_text.as_deref().filter(|text| !text.trim().is_empty()) {
        signals.push(WorkspaceSignal {
            kind: "observation".into(),
            summary: format!("さっき見えていたのは「{}」だった", compact_text(observation, 72)),
            activation: 0.9,
            urgency: 0.86,
            novelty: 0.52,
        });
    }

    if let Some(duration) = event.duration_seconds.filter(|duration| *duration >= 300) {
        signals.push(WorkspaceSignal {
            kind: "practice".into(),
            summary: format!("今日は{}秒ぶん、しっかり居続けた", duration),
            activation: 0.76,
            urgency: 0.42,
            novelty: 0.28,
        });
    }

    let (winner, peripherals) = select_workspace(signals, prediction_error);

    let mut state = load_state(db, user_id).await?;
    state.apply(winner.as_ref(), prediction_error);
    save_state(db, user_id, &state).await?;

    Ok(PresenceSnapshot {
        prompt_context: build_prompt_context(&state, prediction_error, winner.as_ref(), &peripherals),
        prediction_error,
    })
}

#[cfg(test)]
mod tests {
    use super::{CompanionState, WorkspaceSignal, compute_prediction_error, effective_threshold, select_workspace};

    #[test]
    fn threshold_lowers_when_prediction_error_rises() {
        assert!(effective_threshold(0.8) < effective_threshold(0.0));
        assert!(effective_threshold(1.0) >= 0.18);
    }

    #[test]
    fn workspace_prefers_stronger_signal() {
        let signals = vec![
            WorkspaceSignal {
                kind: "journal".into(),
                summary: "recent journal".into(),
                activation: 0.8,
                urgency: 0.7,
                novelty: 0.5,
            },
            WorkspaceSignal {
                kind: "practice".into(),
                summary: "habit".into(),
                activation: 0.45,
                urgency: 0.3,
                novelty: 0.1,
            },
        ];
        let (winner, peripheral) = select_workspace(signals, 0.2);
        assert_eq!(winner.expect("winner").kind, "journal");
        assert_eq!(peripheral.len(), 1);
    }

    #[test]
    fn state_moves_with_prediction_error() {
        let mut state = CompanionState::default();
        let winner = WorkspaceSignal {
            kind: "gap".into(),
            summary: "long gap".into(),
            activation: 0.8,
            urgency: 0.7,
            novelty: 0.8,
        };
        state.apply(Some(&winner), 0.7);
        assert!(state.protective_tension > CompanionState::default().protective_tension);
        assert!(state.attunement > CompanionState::default().attunement);
    }

    #[test]
    fn observation_signal_increases_watchfulness() {
        let mut state = CompanionState::default();
        let winner = WorkspaceSignal {
            kind: "observation".into(),
            summary: "recent camera note".into(),
            activation: 0.9,
            urgency: 0.8,
            novelty: 0.5,
        };
        state.apply(Some(&winner), 0.2);
        assert!(state.watchfulness > CompanionState::default().watchfulness);
        assert!(state.attunement > CompanionState::default().attunement);
    }

    #[test]
    fn prediction_error_reflects_mode_shift() {
        let event = super::PresenceEvent {
            phase: "open".into(),
            time_of_day: "night".into(),
            mode: Some("gratitude".into()),
            user_message: None,
            days_since_last: Some(5),
            elapsed_seconds: None,
            duration_seconds: None,
            journal_text: None,
            observation_text: None,
        };
        let error = compute_prediction_error(&event, Some("yasashii"), Some("morning"));
        assert!(error > 0.4);
    }
}
