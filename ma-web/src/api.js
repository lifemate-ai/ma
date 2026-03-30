import { getIdToken } from './auth';
const BASE = '/api';
function authHeaders() {
    const token = getIdToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
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
    const res = await fetch(`${BASE}/companion/greet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ ...req, time_of_day: timeOfDay() }),
    });
    if (!res.ok)
        return '静かに、始めましょう。';
    const data = await res.json();
    return data.text;
}
export async function guide(req) {
    const res = await fetch(`${BASE}/companion/guide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(req),
    });
    if (!res.ok)
        return '';
    const data = await res.json();
    return data.text;
}
export async function closeSession(mode, duration_seconds) {
    const res = await fetch(`${BASE}/companion/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ mode, duration_seconds }),
    });
    if (!res.ok)
        return 'お疲れ様でした。';
    const data = await res.json();
    return data.text;
}
export async function loopBack(user_journal) {
    const res = await fetch(`${BASE}/companion/loop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ user_journal }),
    });
    if (!res.ok)
        return '';
    const data = await res.json();
    return data.text;
}
export async function tts(text) {
    const res = await fetch(`${BASE}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ text }),
    });
    if (!res.ok)
        return null;
    return res.arrayBuffer();
}
/** ストリーミングTTS用のfetch関数を返す（playAudioStreamに渡す） */
export function ttsStreamFetch(text) {
    return () => fetch(`${BASE}/tts/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ text }),
    });
}
export async function saveSession(duration_seconds, mode) {
    const res = await fetch(`${BASE}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ duration_seconds, mode }),
    }).catch(() => null);
    if (!res || !res.ok)
        return undefined;
    const data = await res.json().catch(() => null);
    return data?.id;
}
export async function saveJournal(opts) {
    await fetch(`${BASE}/journals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(opts),
    }).catch(() => { });
}
export async function getHistory() {
    const res = await fetch(`${BASE}/history`);
    if (!res.ok)
        return { sessions: [], journals: [] };
    return res.json();
}
export async function sbnrrStep(step) {
    const res = await fetch(`${BASE}/companion/sbnrr-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ step }),
    });
    if (!res.ok)
        return '';
    const data = await res.json();
    return data.text;
}
export async function saveCheckin(opts) {
    await fetch(`${BASE}/checkins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(opts),
    }).catch(() => { });
}
export async function saveObservation(opts) {
    const res = await fetch(`${BASE}/companion/observe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(opts),
    }).catch(() => null);
    if (!res || !res.ok)
        return undefined;
    const data = await res.json().catch(() => null);
    return data?.id;
}
export async function getUnifiedHistory() {
    const res = await fetch(`${BASE}/history/unified`, { headers: authHeaders() }).catch(() => null);
    if (!res || !res.ok)
        return { entries: [] };
    return res.json();
}
export async function getCurriculumStatus() {
    const res = await fetch(`${BASE}/curriculum/status`, { headers: authHeaders() }).catch(() => null);
    if (!res || !res.ok)
        return null;
    return res.json();
}
export async function getInsights() {
    const res = await fetch(`${BASE}/insights`, { headers: authHeaders() }).catch(() => null);
    if (!res || !res.ok)
        return [];
    const data = await res.json();
    return data.insights;
}
