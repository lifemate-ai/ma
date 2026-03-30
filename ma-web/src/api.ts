import { getIdToken } from './auth'

const BASE = '/api'

function authHeaders(): Record<string, string> {
  const token = getIdToken()
  return token ? { 'Authorization': `Bearer ${token}` } : {}
}

export type SessionMode = 'yasashii' | 'motto_yasashii' | 'body_scan' | 'sbnrr' | 'emotion_mapping' | 'gratitude' | 'compassion' | 'checkin'

export interface GreetRequest {
  user_message?: string
  time_of_day: 'morning' | 'afternoon' | 'evening' | 'night'
  sessions_total: number
  days_since_last?: number
}

export interface GuideRequest {
  mode: SessionMode
  elapsed_seconds: number
  phase: 'open' | 'mid' | 'close'
}

export interface TextResponse { text: string }

function timeOfDay(): GreetRequest['time_of_day'] {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  if (h < 21) return 'evening'
  return 'night'
}

export async function greet(req: Omit<GreetRequest, 'time_of_day'>): Promise<string> {
  const res = await fetch(`${BASE}/companion/greet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ ...req, time_of_day: timeOfDay() }),
  })
  if (!res.ok) return '静かに、始めましょう。'
  const data: TextResponse = await res.json()
  return data.text
}

export async function guide(req: GuideRequest): Promise<string> {
  const res = await fetch(`${BASE}/companion/guide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(req),
  })
  if (!res.ok) return ''
  const data: TextResponse = await res.json()
  return data.text
}

export async function closeSession(mode: SessionMode, duration_seconds: number): Promise<string> {
  const res = await fetch(`${BASE}/companion/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ mode, duration_seconds }),
  })
  if (!res.ok) return 'お疲れ様でした。'
  const data: TextResponse = await res.json()
  return data.text
}

export async function loopBack(user_journal: string): Promise<string> {
  const res = await fetch(`${BASE}/companion/loop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ user_journal }),
  })
  if (!res.ok) return ''
  const data: TextResponse = await res.json()
  return data.text
}

export async function tts(text: string): Promise<ArrayBuffer | null> {
  const res = await fetch(`${BASE}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) return null
  return res.arrayBuffer()
}

/** ストリーミングTTS用のfetch関数を返す（playAudioStreamに渡す） */
export function ttsStreamFetch(text: string): () => Promise<Response> {
  return () => fetch(`${BASE}/tts/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ text }),
  })
}

export async function saveSession(duration_seconds: number, mode: SessionMode): Promise<string | undefined> {
  const res = await fetch(`${BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ duration_seconds, mode }),
  }).catch(() => null)
  if (!res || !res.ok) return undefined
  const data = await res.json().catch(() => null)
  return data?.id as string | undefined
}

export async function saveJournal(opts: {
  session_id?: string
  user_text: string
  companion_loop?: string
  mood_inferred?: string
}) {
  await fetch(`${BASE}/journals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(opts),
  }).catch(() => {})
}

export async function getHistory() {
  const res = await fetch(`${BASE}/history`)
  if (!res.ok) return { sessions: [], journals: [] }
  return res.json()
}

export async function sbnrrStep(step: string): Promise<string> {
  const res = await fetch(`${BASE}/companion/sbnrr-step`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ step }),
  })
  if (!res.ok) return ''
  const data: TextResponse = await res.json()
  return data.text
}

export async function saveCheckin(opts: { emotion: string; body_state: string; intention: string }): Promise<void> {
  await fetch(`${BASE}/checkins`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(opts),
  }).catch(() => {})
}

export async function saveObservation(opts: { summary?: string; source?: string; image_data_url?: string }): Promise<string | undefined> {
  const res = await fetch(`${BASE}/companion/observe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(opts),
  }).catch(() => null)
  if (!res || !res.ok) return undefined
  const data = await res.json().catch(() => null)
  return data?.id as string | undefined
}

export interface TimelineEntry {
  entry_type: 'session' | 'checkin'
  timestamp: string
  data: Record<string, unknown>
}

export interface TimelineResponse {
  entries: TimelineEntry[]
}

export async function getUnifiedHistory(): Promise<TimelineResponse> {
  const res = await fetch(`${BASE}/history/unified`, { headers: authHeaders() }).catch(() => null)
  if (!res || !res.ok) return { entries: [] }
  return res.json()
}

export interface CurriculumStatus {
  current_week: number
  suggested_modes: string[]
  tried_modes: string[]
  total_sessions: number
}

export async function getCurriculumStatus(): Promise<CurriculumStatus | null> {
  const res = await fetch(`${BASE}/curriculum/status`, { headers: authHeaders() }).catch(() => null)
  if (!res || !res.ok) return null
  return res.json()
}

export interface Insight {
  text: string
  category: string
}

export async function getInsights(): Promise<Insight[]> {
  const res = await fetch(`${BASE}/insights`, { headers: authHeaders() }).catch(() => null)
  if (!res || !res.ok) return []
  const data: { insights: Insight[] } = await res.json()
  return data.insights
}
