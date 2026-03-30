use serde::{Deserialize, Serialize};
use async_trait::async_trait;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionMode {
    Yasashii,       // やさしい手法: 呼吸に注意
    MottoYasashii,  // もっとやさしい手法: ただ座る
    BodyScan,       // ボディスキャン
    Sbnrr,          // SBNRR: 止まる・呼吸・注意・反省・反応
    EmotionMapping, // 感情マッピング
    Gratitude,      // 感謝プラクティス
    Compassion,     // 慈悲の瞑想
    Checkin,        // 自己認識チェックイン
}

#[derive(Debug, Clone)]
pub struct SessionContext {
    pub time_of_day: String,
    pub sessions_total: u32,
    pub days_since_last: Option<u32>,
    pub user_message: Option<String>,
    pub memory_context: Option<String>,
}

#[derive(Debug, Clone)]
pub struct CompanionResponse {
    pub text: String,
}

#[async_trait]
pub trait CompanionLLM {
    /// セッション開始時の挨拶（ToM: ユーザーの状態を推測して応答）
    async fn greet(&self, ctx: SessionContext) -> anyhow::Result<CompanionResponse>;

    /// セッション中のガイダンス（phase: "open" | "mid" | "close"）
    async fn guide(&self, mode: SessionMode, phase: &str, elapsed_seconds: u32, memory_context: Option<String>) -> anyhow::Result<CompanionResponse>;

    /// セッション終了時のクロージング
    async fn close(&self, mode: SessionMode, duration_seconds: u32, memory_context: Option<String>) -> anyhow::Result<CompanionResponse>;

    /// ジャーナリングのルーピング（言い換えて確認）
    async fn loop_back(&self, user_journal: &str, memory_context: Option<String>) -> anyhow::Result<CompanionResponse>;

    /// カメラ観察から、見守りに使う短い観察文を返す
    async fn observe(&self, source: &str, image_data_url: &str) -> anyhow::Result<CompanionResponse>;
}
