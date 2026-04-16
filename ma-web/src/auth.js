const AUTH_MODE = import.meta.env.VITE_AUTH_MODE ?? 'cognito';
const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN ?? '';
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID ?? '';
const REDIRECT_URI = import.meta.env.VITE_COGNITO_REDIRECT_URI ?? window.location.origin + '/';
const TOKEN_KEY = 'komorebi_id_token';
const LEGACY_TOKEN_KEY = 'ma_id_token';
const REFRESH_KEY = 'komorebi_refresh_token';
const LEGACY_REFRESH_KEY = 'ma_refresh_token';
function isCognitoConfigured() {
    return Boolean(COGNITO_DOMAIN && CLIENT_ID && REDIRECT_URI);
}
export function isAuthEnabled() {
    return AUTH_MODE !== 'disabled';
}
function readWithMigration(storage, key, legacyKey) {
    const current = storage.getItem(key);
    if (current)
        return current;
    const legacy = storage.getItem(legacyKey);
    if (!legacy)
        return null;
    storage.setItem(key, legacy);
    storage.removeItem(legacyKey);
    return legacy;
}
// ── PKCE helpers ────────────────────────────────────────────────
function randomBase64url(len) {
    const buf = crypto.getRandomValues(new Uint8Array(len));
    return btoa(String.fromCharCode(...buf))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
async function sha256Base64url(plain) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(hash)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
// ── Token storage ────────────────────────────────────────────────
export function getIdToken() {
    return readWithMigration(sessionStorage, TOKEN_KEY, LEGACY_TOKEN_KEY);
}
function saveTokens(idToken, refreshToken) {
    sessionStorage.setItem(TOKEN_KEY, idToken);
    sessionStorage.removeItem(LEGACY_TOKEN_KEY);
    if (refreshToken)
        localStorage.setItem(REFRESH_KEY, refreshToken);
    localStorage.removeItem(LEGACY_REFRESH_KEY);
}
function clearTokens() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(LEGACY_TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(LEGACY_REFRESH_KEY);
}
function isTokenExpired(token) {
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return Date.now() / 1000 > payload.exp - 60; // 60秒前から期限切れ扱い
    }
    catch {
        return true;
    }
}
// ── Auth flow ────────────────────────────────────────────────────
export async function redirectToLogin() {
    if (!isCognitoConfigured())
        return;
    const verifier = randomBase64url(64);
    const challenge = await sha256Base64url(verifier);
    sessionStorage.setItem('pkce_verifier', verifier);
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: 'openid email profile',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        identity_provider: 'Google',
    });
    window.location.href = `${COGNITO_DOMAIN}/oauth2/authorize?${params}`;
}
async function exchangeCode(code) {
    if (!isCognitoConfigured())
        return false;
    const verifier = sessionStorage.getItem('pkce_verifier');
    if (!verifier)
        return false;
    sessionStorage.removeItem('pkce_verifier');
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
    });
    const res = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    }).catch(() => null);
    if (!res || !res.ok)
        return false;
    const data = await res.json();
    saveTokens(data.id_token, data.refresh_token);
    // URLからcodeを除去
    window.history.replaceState({}, '', REDIRECT_URI);
    return true;
}
async function refreshTokens() {
    if (!isCognitoConfigured())
        return false;
    const refresh = readWithMigration(localStorage, REFRESH_KEY, LEGACY_REFRESH_KEY);
    if (!refresh)
        return false;
    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: CLIENT_ID,
        refresh_token: refresh,
    });
    const res = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    }).catch(() => null);
    if (!res || !res.ok) {
        clearTokens();
        return false;
    }
    const data = await res.json();
    saveTokens(data.id_token, data.refresh_token);
    return true;
}
/**
 * 起動時に呼ぶ。ログイン済みならtrue、未ログインならCognito Hosted UIにリダイレクト。
 * コールバックのcodeを処理してトークンを保存する。
 */
export async function ensureAuth() {
    if (!isAuthEnabled())
        return true;
    if (!isCognitoConfigured()) {
        console.error('Cognito auth is enabled but VITE_COGNITO_* config is missing');
        return false;
    }
    // コールバック処理
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
        return exchangeCode(code);
    }
    // 既存トークンチェック
    const token = getIdToken();
    if (token) {
        if (!isTokenExpired(token))
            return true;
        // 期限切れ → リフレッシュ試行
        if (await refreshTokens())
            return true;
    }
    // 未ログイン → リダイレクト（この関数はreturnしない）
    await redirectToLogin();
    return false;
}
export function logout() {
    clearTokens();
    if (!isAuthEnabled() || !isCognitoConfigured())
        return;
    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        logout_uri: REDIRECT_URI,
    });
    window.location.href = `${COGNITO_DOMAIN}/logout?${params}`;
}
