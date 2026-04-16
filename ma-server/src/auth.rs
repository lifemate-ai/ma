use axum::{
    extract::{Request, State},
    http::{StatusCode, header},
    middleware::Next,
    response::Response,
};
use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Clone, Debug)]
pub enum AuthConfig {
    Disabled { claims: Claims },
    Cognito(CognitoConfig),
}

#[derive(Clone, Debug)]
pub struct CognitoConfig {
    pub user_pool_id: String,
    pub region: String,
    pub client_id: String,
}

impl CognitoConfig {
    fn from_env() -> anyhow::Result<Self> {
        Ok(Self {
            user_pool_id: std::env::var("COGNITO_USER_POOL_ID")?,
            region: std::env::var("COGNITO_REGION")?,
            client_id: std::env::var("COGNITO_CLIENT_ID")?,
        })
    }

    fn issuer(&self) -> String {
        format!(
            "https://cognito-idp.{}.amazonaws.com/{}",
            self.region, self.user_pool_id
        )
    }

    fn jwks_url(&self) -> String {
        format!("{}/.well-known/jwks.json", self.issuer())
    }
}

impl AuthConfig {
    pub fn from_env() -> anyhow::Result<Self> {
        let mode = std::env::var("AUTH_MODE").unwrap_or_else(|_| "cognito".to_string());
        match mode.as_str() {
            "disabled" => Ok(Self::Disabled {
                claims: Claims {
                    sub: std::env::var("DEV_AUTH_SUB")
                        .unwrap_or_else(|_| "local-dev-user".to_string()),
                    email: std::env::var("DEV_AUTH_EMAIL").ok(),
                    exp: u64::MAX,
                    iss: "komorebi/dev".to_string(),
                },
            }),
            "cognito" => Ok(Self::Cognito(CognitoConfig::from_env()?)),
            other => anyhow::bail!("unsupported AUTH_MODE: {other}"),
        }
    }
}

/// Cognitoから取得したJWKsをキャッシュ
#[derive(Clone)]
pub struct JwkCache {
    inner: Arc<RwLock<Option<JwkSet>>>,
}

impl JwkCache {
    pub fn new() -> Self {
        JwkCache { inner: Arc::new(RwLock::new(None)) }
    }

    pub async fn get_or_fetch(
        &self,
        http: &reqwest::Client,
        config: &CognitoConfig,
    ) -> anyhow::Result<JwkSet> {
        {
            let r = self.inner.read().await;
            if let Some(ref cached) = *r {
                return Ok(cached.clone());
            }
        }
        let url = config.jwks_url();
        let jwks: JwkSet = http.get(&url).send().await?.json().await?;
        *self.inner.write().await = Some(jwks.clone());
        Ok(jwks)
    }
}

#[derive(Clone, Debug, Deserialize)]
pub struct JwkSet {
    pub keys: Vec<Jwk>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct Jwk {
    pub kid: String,
    pub n: String,
    pub e: String,
    #[allow(dead_code)]
    pub alg: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: String,
    pub email: Option<String>,
    pub exp: u64,
    pub iss: String,
}

/// JWTを検証してsubを返す
pub fn verify_token(token: &str, jwks: &JwkSet, config: &CognitoConfig) -> anyhow::Result<Claims> {
    let header = decode_header(token)?;
    let kid = header.kid.ok_or_else(|| anyhow::anyhow!("no kid in header"))?;

    let jwk = jwks.keys.iter().find(|k| k.kid == kid)
        .ok_or_else(|| anyhow::anyhow!("no matching key"))?;

    let decoding_key = DecodingKey::from_rsa_components(&jwk.n, &jwk.e)?;

    let issuer = config.issuer();
    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_issuer(&[issuer.as_str()]);
    validation.set_audience(&[config.client_id.as_str()]);
    // token_useクレームの検証はskip（access tokenとid tokenの両方に対応）
    validation.set_required_spec_claims(&["sub", "exp"]);

    let data = decode::<Claims>(token, &decoding_key, &validation)?;
    Ok(data.claims)
}

/// Axumミドルウェア: Authorizationヘッダを検証してrequest extensionにsubを設定
pub async fn auth_middleware(
    State(state): State<crate::AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // 認証不要エンドポイントはスキップ
    let path = request.uri().path();
    if path == "/health" || !path.starts_with("/api/") {
        return Ok(next.run(request).await);
    }

    if let AuthConfig::Disabled { claims } = &state.auth_config {
        request.extensions_mut().insert(claims.clone());
        return Ok(next.run(request).await);
    }

    let token = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let AuthConfig::Cognito(config) = &state.auth_config else {
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    };

    let jwks = state.jwk_cache.get_or_fetch(&state.http, config).await.map_err(|e| {
        tracing::error!("JWK fetch error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let claims = verify_token(token, &jwks, config).map_err(|e| {
        tracing::warn!("JWT verify failed: {e}");
        StatusCode::UNAUTHORIZED
    })?;

    request.extensions_mut().insert(claims.clone());
    Ok(next.run(request).await)
}
