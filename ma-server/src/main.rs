mod companion;
mod tts;
mod journal;
mod curriculum;
mod insights;
mod recommendations;
mod auth;
mod profile;

use std::sync::Arc;
use axum::{Router, routing::{get, post}, http::{StatusCode, Uri, header}, response::Response, body::Body, middleware};
use tower_http::cors::{CorsLayer, Any};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use rust_embed::RustEmbed;

// ── 埋め込みフロントエンド ────────────────────────────────────────

#[derive(RustEmbed)]
#[folder = "../ma-web/dist/"]
struct WebAssets;

// ── AppState ────────────────────────────────────────────────────

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<libsql::Database>,
    pub http: reqwest::Client,
    pub llm: Arc<dyn companion::CompanionLLM + Send + Sync>,
    pub jwk_cache: auth::JwkCache,
    pub auth_config: auth::AuthConfig,
}

// ── 静的ファイル配信 ─────────────────────────────────────────────

async fn serve_static(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    let path = if path.is_empty() { "index.html" } else { path };
    serve_file(path)
}

fn is_asset_like_path(path: &str) -> bool {
    path.rsplit('/').next().is_some_and(|segment| segment.contains('.'))
}

fn serve_file(path: &str) -> Response {
    match WebAssets::get(path) {
        Some(content) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            Response::builder()
                .header(header::CONTENT_TYPE, mime.as_ref())
                .header(header::CACHE_CONTROL, "public, max-age=3600")
                .body(Body::from(content.data.into_owned()))
                .unwrap()
        }
        None => {
            if is_asset_like_path(path) {
                return Response::builder()
                    .status(StatusCode::NOT_FOUND)
                    .body(Body::empty())
                    .unwrap();
            }
            // SPA fallback: index.html を返す
            match WebAssets::get("index.html") {
                Some(content) => Response::builder()
                    .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
                    .body(Body::from(content.data.into_owned()))
                    .unwrap(),
                None => Response::builder()
                    .status(StatusCode::NOT_FOUND)
                    .body(Body::empty())
                    .unwrap(),
            }
        }
    }
}

async fn health() -> &'static str { "ok" }

// ── アプリ構築 ───────────────────────────────────────────────────

async fn build_app() -> Router {
    let http = reqwest::Client::new();
    let llm = companion::make_llm(http.clone());

    let db = libsql::Builder::new_remote(
        std::env::var("TURSO_URL").expect("TURSO_URL not set"),
        std::env::var("TURSO_TOKEN").unwrap_or_default(),
    )
    .build()
    .await
    .expect("Failed to connect to Turso");

    // マイグレーション: 起動時に1回
    {
        let conn = db.connect().expect("DB connect failed");
        journal::migrate(&conn).await.expect("Migration failed");
        profile::migrate(&conn).await.expect("Profile migration failed");
        companion::migrate(&conn).await.expect("Companion migration failed");
    }

    let state = AppState {
        db: Arc::new(db),
        http,
        llm,
        jwk_cache: auth::JwkCache::new(),
        auth_config: auth::AuthConfig::from_env().expect("Invalid auth configuration"),
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/health", get(health))
        .route("/api/companion/greet",  post(companion::greet))
        .route("/api/companion/guide",  post(companion::guide))
        .route("/api/companion/close",  post(companion::close_session))
        .route("/api/companion/loop",   post(companion::loop_back))
        .route("/api/companion/sbnrr-step", post(companion::sbnrr_step))
        .route("/api/companion/observe", post(companion::observe))
        .route("/api/tts",              post(tts::synthesize))
        .route("/api/tts/stream",       post(tts::synthesize_stream))
        .route("/api/sessions",         post(journal::save_session))
        .route("/api/session-precheck", post(journal::save_session_precheck))
        .route("/api/session-postcheck", post(journal::save_session_postcheck))
        .route("/api/session-events",   post(journal::save_session_event))
        .route("/api/journals",         post(journal::save_journal))
        .route("/api/history",          get(journal::get_history))
        .route("/api/history/unified",  get(journal::get_unified_history))
        .route("/api/checkins",         post(journal::save_checkin))
        .route("/api/recommendation-log", post(journal::save_recommendation_log))
        .route("/api/profile/preferences", get(profile::get_preferences).post(profile::save_preferences))
        .route("/api/profile/goals", get(profile::get_goals).post(profile::save_goals))
        .route("/api/data/clear", post(profile::clear_user_data))
        .route("/api/curriculum/status", get(curriculum::get_status))
        .route("/api/recommendations", get(recommendations::get_recommendations))
        .route("/api/insights",         get(insights::get_insights))
        .fallback(serve_static)
        .layer(middleware::from_fn_with_state(state.clone(), auth::auth_middleware))
        .layer(cors)
        .with_state(state)
}

// ── エントリポイント ─────────────────────────────────────────────

#[cfg(feature = "lambda")]
#[tokio::main]
async fn main() -> Result<(), lambda_http::Error> {
    dotenvy::dotenv().ok();
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "ma_server=info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let app = build_app().await;
    lambda_http::run(app).await
}

#[cfg(not(feature = "lambda"))]
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "ma_server=debug,tower_http=debug".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let app = build_app().await;
    let addr = std::env::var("LISTEN_ADDR").unwrap_or_else(|_| "0.0.0.0:3001".to_string());
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("ma-server listening on {addr}");
    axum::serve(listener, app).await?;
    Ok(())
}
