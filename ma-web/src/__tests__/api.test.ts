import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const originalFetch = globalThis.fetch

function makeToken(expOffsetSeconds = 3600): string {
  const payload = btoa(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + expOffsetSeconds,
  }))
  return `header.${payload}.signature`
}

describe('api wrapper', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    vi.resetModules()
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.unstubAllEnvs()
  })

  it('sends authorization headers to history endpoints', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'disabled')
    sessionStorage.setItem('komorebi_id_token', 'header.token.value')
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ sessions: [], journals: [], checkins: [] }),
    })

    const { getHistory } = await import('../api')
    await getHistory()

    const [, init] = (globalThis.fetch as any).mock.calls[0]
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer header.token.value')
  })

  it('retries once on 401 after rechecking auth state', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'cognito')
    vi.stubEnv('VITE_COGNITO_DOMAIN', 'https://example.auth.ap-northeast-1.amazoncognito.com')
    vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'client-id')
    vi.stubEnv('VITE_COGNITO_REDIRECT_URI', 'http://localhost:5173/')
    sessionStorage.setItem('komorebi_id_token', makeToken())

    ;(globalThis.fetch as any)
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ entries: [] }),
      })

    const { getUnifiedHistory } = await import('../api')
    await expect(getUnifiedHistory()).resolves.toEqual({ entries: [] })
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('serializes recommendation query parameters', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'disabled')
    sessionStorage.setItem('komorebi_id_token', 'header.token.value')
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        recommendations: [{
          protocol_id: 'breath_foundation',
          launch_mode: 'yasashii',
          title: '呼吸に戻る',
          duration_minutes: 2,
          rationale: '2分で始めやすいです。',
          confidence: 0.7,
          caution_note: null,
        }],
      }),
    })

    const { getRecommendations } = await import('../api')
    const data = await getRecommendations({ context: 'work_break', stress: 3, available_minutes: 2 })

    expect(data).toHaveLength(1)
    const [url] = (globalThis.fetch as any).mock.calls[0]
    expect(url).toContain('/api/recommendations?')
    expect(url).toContain('context=work_break')
    expect(url).toContain('stress=3')
    expect(url).toContain('available_minutes=2')
  })

  it('sends client session ids when saving sessions', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'disabled')
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'session-123' }),
    })

    const { saveSession } = await import('../api')
    const id = await saveSession(180, 'breathing_space', 'session-123')

    expect(id).toBe('session-123')
    const [, init] = (globalThis.fetch as any).mock.calls[0]
    expect(JSON.parse(init.body as string)).toMatchObject({
      duration_seconds: 180,
      mode: 'breathing_space',
      session_id: 'session-123',
    })
  })

  it('posts session events with payload json', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'disabled')
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => null,
    })

    const { saveSessionEvent } = await import('../api')
    await saveSessionEvent({
      session_id: 'session-123',
      event_type: 'cue_played',
      event_time_offset_ms: 42000,
      payload: { cue_id: 'anchor', protocol_id: 'breath_foundation' },
    })

    const [url, init] = (globalThis.fetch as any).mock.calls[0]
    expect(url).toBe('/api/session-events')
    expect(JSON.parse(init.body as string)).toMatchObject({
      session_id: 'session-123',
      event_type: 'cue_played',
      event_time_offset_ms: 42000,
      payload_json: {
        cue_id: 'anchor',
        protocol_id: 'breath_foundation',
      },
    })
  })

  it('loads and saves user preferences', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'disabled')
    ;(globalThis.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          use_contexts: ['work_break'],
          primary_goal: 'stress',
          preferred_durations: [2, 3, 5],
          preferred_voice_density: 'medium',
          eyes_open_preference: 'any',
          posture_preferences: ['sitting'],
          favorite_protocols: [],
          watch_opt_in: true,
          onboarding_completed: true,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          use_contexts: ['bedtime'],
          primary_goal: 'sleep',
          preferred_durations: [3, 5],
          preferred_voice_density: 'low',
          eyes_open_preference: 'closed',
          posture_preferences: ['lying'],
          favorite_protocols: [],
          watch_opt_in: false,
          onboarding_completed: true,
        }),
      })

    const { getUserPreferences, saveUserPreferences } = await import('../api')
    const current = await getUserPreferences()
    const saved = await saveUserPreferences({
      ...current,
      use_contexts: ['bedtime'],
      primary_goal: 'sleep',
      preferred_durations: [3, 5],
      preferred_voice_density: 'low',
      eyes_open_preference: 'closed',
      posture_preferences: ['lying'],
      watch_opt_in: false,
    })

    expect(current.watch_opt_in).toBe(true)
    expect(saved.primary_goal).toBe('sleep')
    const [url, init] = (globalThis.fetch as any).mock.calls[1]
    expect(url).toBe('/api/profile/preferences')
    expect(JSON.parse(init.body as string)).toMatchObject({
      primary_goal: 'sleep',
      preferred_durations: [3, 5],
      watch_opt_in: false,
    })
  })

  it('posts session precheck and postcheck payloads', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'disabled')
    ;(globalThis.fetch as any)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })

    const { saveSessionPrecheck, saveSessionPostcheck } = await import('../api')
    await saveSessionPrecheck({
      session_id: 'session-123',
      stress: 3,
      agitation: 2,
      available_minutes: 5,
      context_tag: 'work_break',
    })
    await saveSessionPostcheck({
      session_id: 'session-123',
      calm_delta_self_report: 3,
      presence_delta: 2,
      self_kindness_delta: 1,
      burden: 1,
      too_activated: false,
      too_sleepy: true,
      repeat_intent: 4,
    })

    expect((globalThis.fetch as any).mock.calls[0][0]).toBe('/api/session-precheck')
    expect(JSON.parse((globalThis.fetch as any).mock.calls[0][1].body as string)).toMatchObject({
      session_id: 'session-123',
      stress: 3,
      agitation: 2,
      available_minutes: 5,
      context_tag: 'work_break',
    })
    expect((globalThis.fetch as any).mock.calls[1][0]).toBe('/api/session-postcheck')
    expect(JSON.parse((globalThis.fetch as any).mock.calls[1][1].body as string)).toMatchObject({
      session_id: 'session-123',
      calm_delta_self_report: 3,
      too_sleepy: true,
      repeat_intent: 4,
    })
  })

  it('posts scoped clear-data requests', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'disabled')
    ;(globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => null,
    })

    const { clearUserData } = await import('../api')
    await clearUserData('observations')

    const [url, init] = (globalThis.fetch as any).mock.calls[0]
    expect(url).toBe('/api/data/clear')
    expect(JSON.parse(init.body as string)).toEqual({ scope: 'observations' })
  })
})
