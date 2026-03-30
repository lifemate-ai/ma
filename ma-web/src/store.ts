/** セッション統計をlocalStorageで管理（Tursoと二重保持） */

interface LocalStats {
  sessionsTotal: number
  lastSessionDate: string | null // ISO date string
}

const KEY = 'ma:stats'

export function getStats(): LocalStats {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { sessionsTotal: 0, lastSessionDate: null }
}

export function recordSession() {
  const stats = getStats()
  stats.sessionsTotal++
  stats.lastSessionDate = new Date().toISOString()
  localStorage.setItem(KEY, JSON.stringify(stats))
}

export function daysSinceLast(): number | undefined {
  const stats = getStats()
  if (!stats.lastSessionDate) return undefined
  const last = new Date(stats.lastSessionDate)
  const now = new Date()
  const diff = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24))
  return diff
}
