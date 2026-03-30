const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
function toJstDate(isoString) {
    const utcMs = new Date(isoString).getTime();
    return new Date(utcMs + JST_OFFSET_MS);
}
function jstDateKey(isoString) {
    const d = toJstDate(isoString);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
/** "3月9日（月）14:30" */
export function formatJapaneseDate(isoString) {
    const d = toJstDate(isoString);
    const month = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const weekday = WEEKDAYS[d.getUTCDay()];
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `${month}月${day}日（${weekday}）${hh}:${mm}`;
}
/** "今日" / "昨日" / "3日前" / fallback to formatJapaneseDate */
export function formatRelativeDate(isoString) {
    const todayKey = jstDateKey(new Date().toISOString());
    const targetKey = jstDateKey(isoString);
    const todayDate = new Date(todayKey);
    const targetDate = new Date(targetKey);
    const diffDays = Math.round((todayDate.getTime() - targetDate.getTime()) / 86400000);
    if (diffDays === 0)
        return '今日';
    if (diffDays === 1)
        return '昨日';
    if (diffDays >= 2 && diffDays <= 6)
        return `${diffDays}日前`;
    return formatJapaneseDate(isoString);
}
/** "2分" / "2分30秒" / "45秒" */
export function formatDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m === 0)
        return `${s}秒`;
    if (s === 0)
        return `${m}分`;
    return `${m}分${s}秒`;
}
/** Group items by JST calendar date key, preserving original order */
export function groupByDate(items, getTimestamp) {
    const map = new Map();
    for (const item of items) {
        const key = jstDateKey(getTimestamp(item));
        const existing = map.get(key);
        if (existing) {
            existing.push(item);
        }
        else {
            map.set(key, [item]);
        }
    }
    return map;
}
