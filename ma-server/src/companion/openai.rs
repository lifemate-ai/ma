use super::llm::{CompanionLLM, CompanionResponse, SessionContext, SessionMode};
use super::prompt;
use async_trait::async_trait;
use serde_json::json;

pub struct OpenAILLM {
    client: reqwest::Client,
    api_key: String,
    model: String,
}

impl OpenAILLM {
    pub fn new(client: reqwest::Client) -> Self {
        Self {
            client,
            api_key: std::env::var("OPENAI_API_KEY").unwrap_or_default(),
            model: std::env::var("OPENAI_MODEL").unwrap_or_else(|_| "gpt-4o-mini".to_string()),
        }
    }

    async fn chat_with_system(&self, system_prompt: &str, user_prompt: &str) -> anyhow::Result<String> {
        let res = self.client
            .post("https://api.openai.com/v1/chat/completions")
            .bearer_auth(&self.api_key)
            .json(&json!({
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "max_completion_tokens": 1000,
                "temperature": 0.7,
            }))
            .send()
            .await?
            .error_for_status()?;

        let body: serde_json::Value = res.json().await?;
        let text = body["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .trim()
            .to_string();
        Ok(text)
    }

    async fn chat(&self, user_prompt: &str) -> anyhow::Result<String> {
        self.chat_with_system(prompt::system_prompt(), user_prompt).await
    }

    async fn vision(&self, system_prompt: &str, user_prompt: &str, image_data_url: &str) -> anyhow::Result<String> {
        let res = self.client
            .post("https://api.openai.com/v1/chat/completions")
            .bearer_auth(&self.api_key)
            .json(&json!({
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": [
                        {"type": "text", "text": user_prompt},
                        {"type": "image_url", "image_url": {"url": image_data_url}}
                    ]}
                ],
                "max_completion_tokens": 300,
                "temperature": 0.2,
            }))
            .send()
            .await?
            .error_for_status()?;

        let body: serde_json::Value = res.json().await?;
        let text = body["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .trim()
            .to_string();
        Ok(text)
    }
}

#[async_trait]
impl CompanionLLM for OpenAILLM {
    async fn greet(&self, ctx: SessionContext) -> anyhow::Result<CompanionResponse> {
        let p = prompt::greet_prompt(
            &ctx.time_of_day,
            ctx.sessions_total,
            ctx.days_since_last,
            ctx.user_message.as_deref(),
            ctx.memory_context.as_deref(),
        );
        let text = self.chat(&p).await?;
        Ok(CompanionResponse { text })
    }

    async fn guide(&self, mode: SessionMode, phase: &str, elapsed_seconds: u32, memory_context: Option<String>) -> anyhow::Result<CompanionResponse> {
        let mode_str = match mode {
            SessionMode::Yasashii => "yasashii",
            SessionMode::MottoYasashii => "motto_yasashii",
            SessionMode::BodyScan => "body_scan",
            SessionMode::Sbnrr => "sbnrr",
            SessionMode::EmotionMapping => "emotion_mapping",
            SessionMode::Gratitude => "gratitude",
            SessionMode::Compassion => "compassion",
            SessionMode::Checkin => "checkin",
        };
        let p = prompt::guide_prompt(mode_str, phase, elapsed_seconds, memory_context.as_deref());
        let text = self.chat(&p).await?;
        Ok(CompanionResponse { text })
    }

    async fn close(&self, mode: SessionMode, duration_seconds: u32, memory_context: Option<String>) -> anyhow::Result<CompanionResponse> {
        let mode_str = match mode {
            SessionMode::Yasashii => "yasashii",
            SessionMode::MottoYasashii => "motto_yasashii",
            SessionMode::BodyScan => "body_scan",
            SessionMode::Sbnrr => "sbnrr",
            SessionMode::EmotionMapping => "emotion_mapping",
            SessionMode::Gratitude => "gratitude",
            SessionMode::Compassion => "compassion",
            SessionMode::Checkin => "checkin",
        };
        let p = prompt::close_prompt(mode_str, duration_seconds, memory_context.as_deref());
        let text = self.chat(&p).await?;
        Ok(CompanionResponse { text })
    }

    async fn loop_back(&self, user_journal: &str, memory_context: Option<String>) -> anyhow::Result<CompanionResponse> {
        let p = prompt::loop_prompt(user_journal, memory_context.as_deref());
        let text = self.chat(&p).await?;
        Ok(CompanionResponse { text })
    }

    async fn observe(&self, source: &str, image_data_url: &str) -> anyhow::Result<CompanionResponse> {
        let p = prompt::observe_prompt(source);
        let text = self
            .vision(prompt::observation_system_prompt(), &p, image_data_url)
            .await?;
        Ok(CompanionResponse { text })
    }
}
