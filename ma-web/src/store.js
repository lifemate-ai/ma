/** セッション統計をlocalStorageで管理（Tursoと二重保持） */
const KEY = 'ma:stats';
const NEXT_KEY = 'komorebi:stats';
function readStatsRaw() {
    const next = localStorage.getItem(NEXT_KEY);
    if (next)
        return next;
    const legacy = localStorage.getItem(KEY);
    if (!legacy)
        return null;
    localStorage.setItem(NEXT_KEY, legacy);
    localStorage.removeItem(KEY);
    return legacy;
}
export function getStats() {
    try {
        const raw = readStatsRaw();
        if (raw)
            return JSON.parse(raw);
    }
    catch { }
    return { sessionsTotal: 0, lastSessionDate: null };
}
export function recordSession() {
    const stats = getStats();
    stats.sessionsTotal++;
    stats.lastSessionDate = new Date().toISOString();
    localStorage.setItem(NEXT_KEY, JSON.stringify(stats));
    localStorage.removeItem(KEY);
}
export function daysSinceLast() {
    const stats = getStats();
    if (!stats.lastSessionDate)
        return undefined;
    const last = new Date(stats.lastSessionDate);
    const now = new Date();
    const diff = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
}
export function clearLocalStats() {
    localStorage.removeItem(KEY);
    localStorage.removeItem(NEXT_KEY);
}
