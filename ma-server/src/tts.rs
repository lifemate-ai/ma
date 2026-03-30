use axum::{Json, http::StatusCode, response::{IntoResponse, Response}, extract::State, body::Body};
use serde::Deserialize;
use crate::AppState;

#[derive(Deserialize)]
pub struct TtsRequest {
    pub text: String,
    pub voice_id: Option<String>,
    pub stability: Option<f32>,
    pub similarity_boost: Option<f32>,
}

fn voice_and_key(req_voice: Option<String>) -> Result<(String, String), Response> {
    let api_key = std::env::var("ELEVENLABS_API_KEY").map_err(|_| {
        tracing::error!("ELEVENLABS_API_KEY not set");
        StatusCode::SERVICE_UNAVAILABLE.into_response()
    })?;
    let voice_id = req_voice
        .unwrap_or_else(|| std::env::var("ELEVENLABS_VOICE_ID")
            .unwrap_or_else(|_| "21m00Tcm4TlvDq8ikWAM".to_string()));
    Ok((voice_id, api_key))
}

fn tts_body(text: &str, stability: f32, similarity_boost: f32) -> serde_json::Value {
    serde_json::json!({
        "text": text,
        "model_id": "eleven_v3",
        "voice_settings": {
            "stability": stability,
            "similarity_boost": similarity_boost,
        }
    })
}

/// 通常TTS（バッファ返却）
pub async fn synthesize(
    State(state): State<AppState>,
    Json(req): Json<TtsRequest>,
) -> impl IntoResponse {
    let (voice_id, api_key) = match voice_and_key(req.voice_id) {
        Ok(v) => v,
        Err(r) => return r,
    };
    let url = format!("https://api.elevenlabs.io/v1/text-to-speech/{voice_id}");
    let body = tts_body(&req.text, req.stability.unwrap_or(0.5), req.similarity_boost.unwrap_or(0.75));

    let res = match state.http.post(&url)
        .header("xi-api-key", &api_key)
        .header("Accept", "audio/mpeg")
        .json(&body)
        .send().await
    {
        Ok(r) => r,
        Err(e) => { tracing::error!("ElevenLabs request failed: {e}"); return StatusCode::BAD_GATEWAY.into_response(); }
    };

    if !res.status().is_success() {
        tracing::error!("ElevenLabs error: {}", res.status());
        return StatusCode::BAD_GATEWAY.into_response();
    }

    let audio_bytes = match res.bytes().await {
        Ok(b) => b,
        Err(e) => { tracing::error!("Failed to read ElevenLabs response: {e}"); return StatusCode::BAD_GATEWAY.into_response(); }
    };

    ([(axum::http::header::CONTENT_TYPE, "audio/mpeg")], audio_bytes).into_response()
}

/// ストリーミングTTS（ElevenLabsのchunked streamをそのままプロキシ）
pub async fn synthesize_stream(
    State(state): State<AppState>,
    Json(req): Json<TtsRequest>,
) -> Response {
    let (voice_id, api_key) = match voice_and_key(req.voice_id) {
        Ok(v) => v,
        Err(r) => return r,
    };
    let url = format!("https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream");
    let body = tts_body(&req.text, req.stability.unwrap_or(0.5), req.similarity_boost.unwrap_or(0.75));

    let res = match state.http.post(&url)
        .header("xi-api-key", &api_key)
        .header("Accept", "audio/mpeg")
        .json(&body)
        .send().await
    {
        Ok(r) => r,
        Err(e) => { tracing::error!("ElevenLabs stream request failed: {e}"); return StatusCode::BAD_GATEWAY.into_response(); }
    };

    if !res.status().is_success() {
        tracing::error!("ElevenLabs stream error: {}", res.status());
        return StatusCode::BAD_GATEWAY.into_response();
    }

    let stream = res.bytes_stream();
    Response::builder()
        .header(axum::http::header::CONTENT_TYPE, "audio/mpeg")
        .body(Body::from_stream(stream))
        .unwrap()
}
