import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock api.ts
vi.mock('../../api', () => ({
  sbnrrStep: vi.fn(async (step: string) => `guidance for ${step}`),
  tts: vi.fn(async () => null),
  ttsStreamFetch: vi.fn(),
  saveSession: vi.fn(async () => 'session-123'),
}))

// Mock audio.ts
vi.mock('../../audio', () => ({
  playAudioBuffer: vi.fn(async () => {}),
  playAudioStream: vi.fn(async () => {}),
  playBell: vi.fn(),
  stopCurrentAudio: vi.fn(),
  resumeAudio: vi.fn(),
}))

import { mountSbnrr, SBNRR_STEPS } from '../sbnrr'
import { sbnrrStep } from '../../api'

describe('SBNRR mode', () => {
  let container: HTMLElement
  let onDone: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    container = document.createElement('div')
    onDone = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('exports SBNRR_STEPS with 5 steps', () => {
    expect(SBNRR_STEPS).toHaveLength(5)
    expect(SBNRR_STEPS.map(s => s.key)).toEqual(['stop', 'breathe', 'notice', 'reflect', 'respond'])
  })

  it('renders initial UI with step title and start button', () => {
    mountSbnrr(container, onDone)

    expect(container.querySelector('.sbnrr-screen')).not.toBeNull()
    expect(container.querySelector('.sbnrr-title')?.textContent).toContain('SBNRR')
    expect(container.querySelector('#sbnrr-start-btn')).not.toBeNull()
  })

  it('shows first step after start button click', async () => {
    mountSbnrr(container, onDone)

    const startBtn = container.querySelector('#sbnrr-start-btn') as HTMLButtonElement
    startBtn.click()

    // Allow async to resolve
    await vi.advanceTimersByTimeAsync(100)

    const stepEl = container.querySelector('#sbnrr-step-label')
    expect(stepEl?.textContent).toContain('止まる')
  })

  it('calls sbnrrStep API for each step', async () => {
    mountSbnrr(container, onDone)

    const startBtn = container.querySelector('#sbnrr-start-btn') as HTMLButtonElement
    startBtn.click()
    await vi.advanceTimersByTimeAsync(100)

    expect(sbnrrStep).toHaveBeenCalledWith('stop')
  })

  it('advances through steps with timers', async () => {
    mountSbnrr(container, onDone)

    const startBtn = container.querySelector('#sbnrr-start-btn') as HTMLButtonElement
    startBtn.click()
    await vi.advanceTimersByTimeAsync(100)

    // Step 1: stop (10s)
    expect(container.querySelector('#sbnrr-step-label')?.textContent).toContain('止まる')

    await vi.advanceTimersByTimeAsync(10_000)

    // Step 2: breathe (30s)
    expect(container.querySelector('#sbnrr-step-label')?.textContent).toContain('呼吸')
  })

  it('calls onDone after all steps complete', async () => {
    mountSbnrr(container, onDone)

    const startBtn = container.querySelector('#sbnrr-start-btn') as HTMLButtonElement
    startBtn.click()
    await vi.advanceTimersByTimeAsync(100)

    // Total: 10 + 30 + 30 + 30 + 20 = 120s
    await vi.advanceTimersByTimeAsync(120_000)

    expect(onDone).toHaveBeenCalled()
  })

  it('has a cancel button that calls onDone(undefined)', async () => {
    mountSbnrr(container, onDone)

    const startBtn = container.querySelector('#sbnrr-start-btn') as HTMLButtonElement
    startBtn.click()
    await vi.advanceTimersByTimeAsync(100)

    const cancelBtn = container.querySelector('#sbnrr-cancel-btn') as HTMLButtonElement
    expect(cancelBtn).not.toBeNull()
    cancelBtn.click()

    expect(onDone).toHaveBeenCalledWith(undefined)
  })

  it('displays step guidance text from API', async () => {
    mountSbnrr(container, onDone)

    const startBtn = container.querySelector('#sbnrr-start-btn') as HTMLButtonElement
    startBtn.click()
    await vi.advanceTimersByTimeAsync(100)

    const guideEl = container.querySelector('#sbnrr-guide-text')
    expect(guideEl?.textContent).toContain('guidance for stop')
  })

  it('shows countdown timer for current step', async () => {
    mountSbnrr(container, onDone)

    const startBtn = container.querySelector('#sbnrr-start-btn') as HTMLButtonElement
    startBtn.click()
    await vi.advanceTimersByTimeAsync(100)

    const timerEl = container.querySelector('#sbnrr-timer')
    expect(timerEl).not.toBeNull()
    // Initial timer for stop step (10s)
    expect(timerEl?.textContent).toBe('0:10')
  })
})
