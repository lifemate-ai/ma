import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../api', () => ({
  tts: vi.fn(async () => new ArrayBuffer(8)),
  ttsStreamFetch: vi.fn(),
  saveSession: vi.fn(async () => 'session-c1'),
}))

vi.mock('../../audio', () => ({
  playAudioBuffer: vi.fn(async () => {}),
  playAudioStream: vi.fn(async () => {}),
  playBell: vi.fn(),
  stopCurrentAudio: vi.fn(),
}))

import { mountCompassion, COMPASSION_PHASES } from '../compassion'
import { tts } from '../../api'
import { playAudioBuffer } from '../../audio'

describe('Compassion (Loving-Kindness) mode', () => {
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

  it('exports COMPASSION_PHASES with 4 phases', () => {
    expect(COMPASSION_PHASES).toHaveLength(4)
    expect(COMPASSION_PHASES.map(p => p.key)).toEqual(['self', 'loved', 'neutral', 'difficult'])
  })

  it('renders initial UI with title and start button', () => {
    mountCompassion(container, onDone)

    expect(container.querySelector('.compassion-screen')).not.toBeNull()
    expect(container.querySelector('.compassion-title')?.textContent).toContain('慈悲')
    expect(container.querySelector('#compassion-start-btn')).not.toBeNull()
  })

  it('shows first phase after clicking start', async () => {
    mountCompassion(container, onDone)

    const startBtn = container.querySelector('#compassion-start-btn') as HTMLButtonElement
    startBtn.click()
    await vi.advanceTimersByTimeAsync(100)

    const phaseEl = container.querySelector('#compassion-phase-label')
    expect(phaseEl?.textContent).toContain('自分')
  })

  it('plays TTS for each phrase in a phase', async () => {
    mountCompassion(container, onDone)

    const startBtn = container.querySelector('#compassion-start-btn') as HTMLButtonElement
    startBtn.click()
    await vi.advanceTimersByTimeAsync(100)

    // Should have called tts for the first phrase
    expect(tts).toHaveBeenCalled()
  })

  it('advances through all 4 phases and calls onDone', async () => {
    mountCompassion(container, onDone)

    const startBtn = container.querySelector('#compassion-start-btn') as HTMLButtonElement
    startBtn.click()

    // 4 phases, ~30s each = 120s total
    await vi.advanceTimersByTimeAsync(130_000)

    expect(onDone).toHaveBeenCalled()
  })

  it('has a cancel button', async () => {
    mountCompassion(container, onDone)

    const startBtn = container.querySelector('#compassion-start-btn') as HTMLButtonElement
    startBtn.click()
    await vi.advanceTimersByTimeAsync(100)

    const cancelBtn = container.querySelector('#compassion-cancel-btn') as HTMLButtonElement
    expect(cancelBtn).not.toBeNull()
    cancelBtn.click()

    expect(onDone).toHaveBeenCalledWith(undefined)
  })

  it('displays the current phrase text (without audio tags)', async () => {
    mountCompassion(container, onDone)

    const startBtn = container.querySelector('#compassion-start-btn') as HTMLButtonElement
    startBtn.click()
    await vi.advanceTimersByTimeAsync(100)

    const phraseEl = container.querySelector('#compassion-phrase-text')
    expect(phraseEl).not.toBeNull()
    // Should not contain audio tags like [calm]
    expect(phraseEl?.textContent).not.toContain('[')
    expect(phraseEl?.textContent).toContain('幸せ')
  })
})
