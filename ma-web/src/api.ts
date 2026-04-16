import { ensureAuth, getIdToken, isAuthEnabled } from './auth'

const BASE = '/api'

interface FetchOptions {
  auth?: boolean
  retryOnUnauthorized?: boolean
}

function withAuthHeaders(headers?: HeadersInit, auth = true): Headers {
  const resolved = new Headers(headers)
  if (!auth) return resolved

  const token = getIdToken()
  if (token) {
    resolved.set('Authorization', `Bearer ${token}`)
  }
  return resolved
}

async function apiFetch(
  path: string,
  init: RequestInit = {},
  options: FetchOptions = {},
): Promise<Response | null> {
  const { auth = true, retryOnUnauthorized = true } = options
  const request = { ...init }
  request.headers = withAuthHeaders(init.headers, auth)

  let response = await fetch(`${BASE}${path}`, request).catch(() => null)
  if (
    response?.status === 401 &&
    auth &&
    retryOnUnauthorized &&
    isAuthEnabled()
  ) {
    const refreshed = await ensureAuth().catch(() => false)
    if (!refreshed) return response

    request.headers = withAuthHeaders(init.headers, auth)
    response = await fetch(`${BASE}${path}`, request).catch(() => null)
  }

  return response
}

async function apiJson<T>(
  path: string,
  init: RequestInit = {},
  options: FetchOptions = {},
): Promise<T | null> {
  const response = await apiFetch(path, init, options)
  if (!response || !response.ok) return null
  return response.json()
}

function jsonRequest(body: unknown, headers?: HeadersInit): RequestInit {
  return {
    method: 'POST',
    headers: new Headers({
      'Content-Type': 'application/json',
      ...(headers ? Object.fromEntries(new Headers(headers).entries()) : {}),
    }),
    body: JSON.stringify(body),
  }
}

export type CompanionMode =
  | 'yasashii'
  | 'motto_yasashii'
  | 'body_scan'
  | 'sbnrr'
  | 'emotion_mapping'
  | 'gratitude'
  | 'compassion'
  | 'checkin'

export type SessionMode =
  | CompanionMode
  | 'breathing_space'
  | 'self_compassion_break'
  | 'stress_reset'
  | 'sleep_winddown'

export interface GreetRequest {
  user_message?: string
  time_of_day: 'morning' | 'afternoon' | 'evening' | 'night'
  sessions_total: number
  days_since_last?: number
}

export interface GuideRequest {
  mode: CompanionMode
  elapsed_seconds: number
  phase: 'open' | 'mid' | 'close'
}

export interface SessionEventRequest {
  session_id: string
  event_type: string
  event_time_offset_ms: number
  payload?: Record<string, unknown>
}

export interface RecommendationAcceptanceRequest {
  recommended_protocol: string
  rationale: string
  input_snapshot?: Record<string, unknown>
  accepted_bool: boolean
  session_id?: string
  confidence?: number
}

export interface UserPreferences {
  use_contexts: string[]
  primary_goal?: string | null
  preferred_durations: number[]
  preferred_voice_density: 'low' | 'medium' | 'high'
  eyes_open_preference: 'open' | 'closed' | 'any'
  posture_preferences: string[]
  favorite_protocols: string[]
  watch_opt_in: boolean
  onboarding_completed: boolean
}

export interface UserGoals {
  stress: number
  focus: number
  sleep: number
  kindness: number
  emotional_regulation: number
  general_presence: number
}

export interface SessionPrecheckRequest {
  session_id: string
  stress?: number
  agitation?: number
  energy?: number
  sleepiness?: number
  body_tension?: number
  overwhelm?: number
  self_criticism?: number
  available_minutes?: number
  context_tag?: string
}

export interface SessionPostcheckRequest {
  session_id: string
  calm_delta_self_report?: number
  presence_delta?: number
  self_kindness_delta?: number
  burden?: number
  too_activated: boolean
  too_sleepy: boolean
  repeat_intent?: number
}

export interface TextResponse { text: string }

export function defaultUserPreferences(): UserPreferences {
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
  }
}

export function defaultUserGoals(): UserGoals {
  return {
    stress: 0,
    focus: 0,
    sleep: 0,
    kindness: 0,
    emotional_regulation: 0,
    general_presence: 0,
  }
}

function timeOfDay(): GreetRequest['time_of_day'] {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  if (h < 21) return 'evening'
  return 'night'
}

export async function greet(req: Omit<GreetRequest, 'time_of_day'>): Promise<string> {
  const data = await apiJson<TextResponse>(
    '/companion/greet',
    jsonRequest({ ...req, time_of_day: timeOfDay() }),
  )
  if (!data) return '静かに、始めましょう。'
  return data.text
}

export async function guide(req: GuideRequest): Promise<string> {
  const data = await apiJson<TextResponse>('/companion/guide', jsonRequest(req))
  if (!data) return ''
  return data.text
}

export async function closeSession(mode: CompanionMode, duration_seconds: number): Promise<string> {
  const data = await apiJson<TextResponse>(
    '/companion/close',
    jsonRequest({ mode, duration_seconds }),
  )
  if (!data) return 'お疲れ様でした。'
  return data.text
}

export async function loopBack(user_journal: string): Promise<string> {
  const data = await apiJson<TextResponse>(
    '/companion/loop',
    jsonRequest({ user_journal }),
  )
  if (!data) return ''
  return data.text
}

export async function tts(text: string): Promise<ArrayBuffer | null> {
  const response = await apiFetch('/tts', jsonRequest({ text }))
  if (!response || !response.ok) return null
  return response.arrayBuffer()
}

/** ストリーミングTTS用のfetch関数を返す（playAudioStreamに渡す） */
export function ttsStreamFetch(text: string): () => Promise<Response> {
  return async () => {
    const response = await apiFetch('/tts/stream', jsonRequest({ text }))
    if (!response) {
      throw new Error('stream fetch failed')
    }
    return response
  }
}

export function createSessionId(): string {
  return crypto.randomUUID()
}

export async function saveSession(
  duration_seconds: number,
  mode: SessionMode,
  session_id?: string,
): Promise<string | undefined> {
  const data = await apiJson<{ id?: string }>(
    '/sessions',
    jsonRequest({ duration_seconds, mode, session_id }),
  )
  return data?.id as string | undefined
}

export async function saveSessionPrecheck(req: SessionPrecheckRequest): Promise<void> {
  await apiFetch('/session-precheck', jsonRequest(req))
}

export async function saveSessionPostcheck(req: SessionPostcheckRequest): Promise<void> {
  await apiFetch('/session-postcheck', jsonRequest(req))
}

export async function saveSessionEvent(req: SessionEventRequest): Promise<void> {
  await apiFetch('/session-events', jsonRequest({
    session_id: req.session_id,
    event_type: req.event_type,
    event_time_offset_ms: req.event_time_offset_ms,
    payload_json: req.payload ?? null,
  }))
}

export async function logRecommendationAcceptance(req: RecommendationAcceptanceRequest): Promise<void> {
  await apiFetch('/recommendation-log', jsonRequest({
    recommended_protocol: req.recommended_protocol,
    rationale: req.rationale,
    input_snapshot_json: req.input_snapshot ?? null,
    accepted_bool: req.accepted_bool,
    session_id: req.session_id,
    confidence: req.confidence,
  }))
}

export async function saveJournal(opts: {
  session_id?: string
  user_text: string
  companion_loop?: string
  mood_inferred?: string
}) {
  await apiFetch('/journals', jsonRequest(opts))
}

export async function getHistory() {
  const data = await apiJson('/history', undefined, { auth: true })
  return data ?? { sessions: [], journals: [] }
}

export async function getUserPreferences(): Promise<UserPreferences> {
  const data = await apiJson<UserPreferences>('/profile/preferences')
  return data ?? defaultUserPreferences()
}

export async function saveUserPreferences(preferences: UserPreferences): Promise<UserPreferences> {
  const data = await apiJson<UserPreferences>('/profile/preferences', jsonRequest(preferences))
  return data ?? preferences
}

export async function getUserGoals(): Promise<UserGoals> {
  const data = await apiJson<UserGoals>('/profile/goals')
  return data ?? defaultUserGoals()
}

export async function saveUserGoals(goals: UserGoals): Promise<UserGoals> {
  const data = await apiJson<UserGoals>('/profile/goals', jsonRequest(goals))
  return data ?? goals
}

export async function clearUserData(scope: 'all' | 'observations'): Promise<void> {
  await apiFetch('/data/clear', jsonRequest({ scope }))
}

export async function sbnrrStep(step: string): Promise<string> {
  const data = await apiJson<TextResponse>(
    '/companion/sbnrr-step',
    jsonRequest({ step }),
  )
  if (!data) return ''
  return data.text
}

export async function saveCheckin(opts: { emotion: string; body_state: string; intention: string }): Promise<void> {
  await apiFetch('/checkins', jsonRequest(opts))
}

export async function saveObservation(opts: { summary?: string; source?: string; image_data_url?: string }): Promise<string | undefined> {
  const data = await apiJson<{ id?: string }>(
    '/companion/observe',
    jsonRequest(opts),
  )
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
  const data = await apiJson<TimelineResponse>('/history/unified')
  return data ?? { entries: [] }
}

export interface CurriculumStatus {
  current_week: number
  suggested_modes: string[]
  tried_modes: string[]
  total_sessions: number
}

export async function getCurriculumStatus(): Promise<CurriculumStatus | null> {
  return apiJson<CurriculumStatus>('/curriculum/status')
}

export interface Insight {
  title: string
  summary: string
  category: string
  confidence: number
  sample_size: number
  next_step: string
}

export interface Recommendation {
  protocol_id: string
  launch_mode: SessionMode
  title: string
  duration_minutes: number
  rationale: string
  confidence: number
  caution_note?: string | null
}

export async function getInsights(): Promise<Insight[]> {
  const data = await apiJson<{ insights: Insight[] }>('/insights')
  if (!data) return []
  return data.insights
}

export async function getRecommendations(query?: {
  available_minutes?: number
  context?: string
  stress?: number
  agitation?: number
  energy?: number
  sleepiness?: number
  overwhelm?: number
  self_criticism?: number
}): Promise<Recommendation[]> {
  const params = new URLSearchParams()
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value))
    }
  })
  const suffix = params.size > 0 ? `?${params.toString()}` : ''
  const data = await apiJson<{ recommendations: Recommendation[] }>(`/recommendations${suffix}`)
  return data?.recommendations ?? []
}
