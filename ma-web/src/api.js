import { ensureAuth, getIdToken, isAuthEnabled } from './auth';
const BASE = '/api';
function withAuthHeaders(headers, auth = true) {
    const resolved = new Headers(headers);
    if (!auth)
        return resolved;
    const token = getIdToken();
    if (token) {
        resolved.set('Authorization', `Bearer ${token}`);
    }
    return resolved;
}
async function apiFetch(path, init = {}, options = {}) {
    const { auth = true, retryOnUnauthorized = true } = options;
    const request = { ...init };
    request.headers = withAuthHeaders(init.headers, auth);
    let response = await fetch(`${BASE}${path}`, request).catch(() => null);
    if (response?.status === 401 &&
        auth &&
        retryOnUnauthorized &&
        isAuthEnabled()) {
        const refreshed = await ensureAuth().catch(() => false);
        if (!refreshed)
            return response;
        request.headers = withAuthHeaders(init.headers, auth);
        response = await fetch(`${BASE}${path}`, request).catch(() => null);
    }
    return response;
}
async function apiJson(path, init = {}, options = {}) {
    const response = await apiFetch(path, init, options);
    if (!response || !response.ok)
        return null;
    return response.json();
}
function jsonRequest(body, headers) {
    return {
        method: 'POST',
        headers: new Headers({
            'Content-Type': 'application/json',
            ...(headers ? Object.fromEntries(new Headers(headers).entries()) : {}),
        }),
        body: JSON.stringify(body),
    };
}
export function defaultUserPreferences() {
    return {
        use_contexts: [],
        primary_goal: null,
        preferred_durations: [2, 3, 5],
        preferred_voice_density: 'medium',
        eyes_open_preference: 'any',
        posture_preferences: [],
        favorite_protocols: [],
        watch_opt_in: false,
        onboarding_completed: false,
    };
}
export function defaultUserGoals() {
    return {
        stress: 0,
        focus: 0,
        sleep: 0,
        kindness: 0,
        emotional_regulation: 0,
        general_presence: 0,
    };
}
function timeOfDay() {
    const h = new Date().getHours();
    if (h < 12)
        return 'morning';
    if (h < 17)
        return 'afternoon';
    if (h < 21)
        return 'evening';
    return 'night';
}
export async function greet(req) {
    const data = await apiJson('/companion/greet', jsonRequest({ ...req, time_of_day: timeOfDay() }));
    if (!data)
        return '静かに、始めましょう。';
    return data.text;
}
export async function guide(req) {
    const data = await apiJson('/companion/guide', jsonRequest(req));
    if (!data)
        return '';
    return data.text;
}
export async function closeSession(mode, duration_seconds) {
    const data = await apiJson('/companion/close', jsonRequest({ mode, duration_seconds }));
    if (!data)
        return 'お疲れ様でした。';
    return data.text;
}
export async function loopBack(user_journal) {
    const data = await apiJson('/companion/loop', jsonRequest({ user_journal }));
    if (!data)
        return '';
    return data.text;
}
export async function tts(text) {
    const response = await apiFetch('/tts', jsonRequest({ text }));
    if (!response || !response.ok)
        return null;
    return response.arrayBuffer();
}
/** ストリーミングTTS用のfetch関数を返す（playAudioStreamに渡す） */
export function ttsStreamFetch(text) {
    return async () => {
        const response = await apiFetch('/tts/stream', jsonRequest({ text }));
        if (!response) {
            throw new Error('stream fetch failed');
        }
        return response;
    };
}
export function createSessionId() {
    return crypto.randomUUID();
}
export async function saveSession(duration_seconds, mode, session_id) {
    const data = await apiJson('/sessions', jsonRequest({ duration_seconds, mode, session_id }));
    return data?.id;
}
export async function saveSessionPrecheck(req) {
    await apiFetch('/session-precheck', jsonRequest(req));
}
export async function saveSessionPostcheck(req) {
    await apiFetch('/session-postcheck', jsonRequest(req));
}
export async function saveSessionEvent(req) {
    await apiFetch('/session-events', jsonRequest({
        session_id: req.session_id,
        event_type: req.event_type,
        event_time_offset_ms: req.event_time_offset_ms,
        payload_json: req.payload ?? null,
    }));
}
export async function logRecommendationAcceptance(req) {
    await apiFetch('/recommendation-log', jsonRequest({
        recommended_protocol: req.recommended_protocol,
        rationale: req.rationale,
        input_snapshot_json: req.input_snapshot ?? null,
        accepted_bool: req.accepted_bool,
        session_id: req.session_id,
        confidence: req.confidence,
    }));
}
export async function saveJournal(opts) {
    await apiFetch('/journals', jsonRequest(opts));
}
export async function getHistory() {
    const data = await apiJson('/history', undefined, { auth: true });
    return data ?? { sessions: [], journals: [] };
}
export async function getUserPreferences() {
    const data = await apiJson('/profile/preferences');
    return data ?? defaultUserPreferences();
}
export async function saveUserPreferences(preferences) {
    const data = await apiJson('/profile/preferences', jsonRequest(preferences));
    return data ?? preferences;
}
export async function getUserGoals() {
    const data = await apiJson('/profile/goals');
    return data ?? defaultUserGoals();
}
export async function saveUserGoals(goals) {
    const data = await apiJson('/profile/goals', jsonRequest(goals));
    return data ?? goals;
}
export async function clearUserData(scope) {
    await apiFetch('/data/clear', jsonRequest({ scope }));
}
export async function sbnrrStep(step) {
    const data = await apiJson('/companion/sbnrr-step', jsonRequest({ step }));
    if (!data)
        return '';
    return data.text;
}
export async function saveCheckin(opts) {
    await apiFetch('/checkins', jsonRequest(opts));
}
export async function saveObservation(opts) {
    const data = await apiJson('/companion/observe', jsonRequest(opts));
    return data?.id;
}
export async function getUnifiedHistory() {
    const data = await apiJson('/history/unified');
    return data ?? { entries: [] };
}
export async function getCurriculumStatus() {
    return apiJson('/curriculum/status');
}
export async function getInsights() {
    const data = await apiJson('/insights');
    if (!data)
        return [];
    return data.insights;
}
export async function getRecommendations(query) {
    const params = new URLSearchParams();
    Object.entries(query ?? {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            params.set(key, String(value));
        }
    });
    const suffix = params.size > 0 ? `?${params.toString()}` : '';
    const data = await apiJson(`/recommendations${suffix}`);
    return data?.recommendations ?? [];
}
