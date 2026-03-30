import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sbnrrStep, saveCheckin, saveObservation } from '../../api'

// We test the new API functions with mocked global fetch

const originalFetch = globalThis.fetch

describe('API extensions', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('sbnrrStep sends correct request and returns text', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'stop guidance' }),
    })

    const result = await sbnrrStep('stop')

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/companion/sbnrr-step',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ step: 'stop' }),
      })
    )
    expect(result).toBe('stop guidance')
  })

  it('sbnrrStep returns empty string on error', async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: false })

    const result = await sbnrrStep('invalid')

    expect(result).toBe('')
  })

  it('saveCheckin sends correct request', async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: true })

    await saveCheckin({
      emotion: '穏やか',
      body_state: '肩が軽い',
      intention: '集中する',
    })

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/checkins',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          emotion: '穏やか',
          body_state: '肩が軽い',
          intention: '集中する',
        }),
      })
    )
  })

  it('saveCheckin does not throw on network error', async () => {
    (globalThis.fetch as any).mockRejectedValue(new Error('network error'))

    // Should not throw
    await expect(saveCheckin({
      emotion: 'test',
      body_state: 'test',
      intention: 'test',
    })).resolves.toBeUndefined()
  })

  it('saveObservation sends correct request and returns id', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'obs-1' }),
    })

    const result = await saveObservation({
      source: 'camera',
      summary: '肩の力が少し抜けて、姿勢が前より落ち着いて見える',
    })

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/companion/observe',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          source: 'camera',
          summary: '肩の力が少し抜けて、姿勢が前より落ち着いて見える',
        }),
      })
    )
    expect(result).toBe('obs-1')
  })

  it('saveObservation returns undefined on error', async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: false })

    await expect(saveObservation({
      source: 'camera',
      summary: 'test observation',
    })).resolves.toBeUndefined()
  })

  it('saveObservation can send image payload without summary', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'obs-2' }),
    })

    const result = await saveObservation({
      source: 'browser_camera',
      image_data_url: 'data:image/jpeg;base64,abc',
    })

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/companion/observe',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          source: 'browser_camera',
          image_data_url: 'data:image/jpeg;base64,abc',
        }),
      })
    )
    expect(result).toBe('obs-2')
  })
})
