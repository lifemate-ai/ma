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

const POOL_ID: &str = "ap-northeast-1_J7feAUlQE";
const REGION: &str = "ap-northeast-1";

/// Cognitoから取得したJWKsをキャッシュ
#[derive(Clone)]
pub struct JwkCache {
    inner: Arc<RwLock<Option<JwkSet>>>,
}

impl JwkCache {
    pub fn new() -> Self {
        JwkCache { inner: Arc::new(RwLock::new(None)) }
    }

    pub async fn get_or_fetch(&self, http: &reqwest::Client) -> anyhow::Result<JwkSet> {
        {
            let r = self.inner.read().await;
            if let Some(ref cached) = *r {
                return Ok(cached.clone());
            }
        }
        let url = format!(
            "https://cognito-idp.{REGION}.amazonaws.com/{POOL_ID}/.well-known/jwks.json"
        );
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
pub fn verify_token(token: &str, jwks: &JwkSet) -> anyhow::Result<Claims> {
    let header = decode_header(token)?;
    let kid = header.kid.ok_or_else(|| anyhow::anyhow!("no kid in header"))?;

    let jwk = jwks.keys.iter().find(|k| k.kid == kid)
        .ok_or_else(|| anyhow::anyhow!("no matching key"))?;

    let decoding_key = DecodingKey::from_rsa_components(&jwk.n, &jwk.e)?;

    let expected_iss = format!(
        "https://cognito-idp.{REGION}.amazonaws.com/{POOL_ID}"
    );

    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_issuer(&[&expected_iss]);
    validation.set_audience(&["3h75pqomji3bjcsg4vg04h5fd3"]);
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

    let token = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let jwks = state.jwk_cache.get_or_fetch(&state.http).await.map_err(|e| {
        tracing::error!("JWK fetch error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let claims = verify_token(token, &jwks).map_err(|e| {
        tracing::warn!("JWT verify failed: {e}");
        StatusCode::UNAUTHORIZED
    })?;

    request.extensions_mut().insert(claims.clone());
    Ok(next.run(request).await)
}
