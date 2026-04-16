import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const originalFetch = globalThis.fetch

describe('auth config', () => {
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

  it('returns true immediately when auth mode is disabled', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'disabled')

    const { ensureAuth } = await import('../auth')
    await expect(ensureAuth()).resolves.toBe(true)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('migrates legacy token storage keys', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'disabled')
    sessionStorage.setItem('ma_id_token', 'legacy-id-token')
    localStorage.setItem('ma_refresh_token', 'legacy-refresh-token')

    const { getIdToken } = await import('../auth')

    expect(getIdToken()).toBe('legacy-id-token')
    expect(sessionStorage.getItem('komorebi_id_token')).toBe('legacy-id-token')
    expect(sessionStorage.getItem('ma_id_token')).toBeNull()
    expect(localStorage.getItem('ma_refresh_token')).toBe('legacy-refresh-token')
  })
})
