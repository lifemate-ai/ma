import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../api', () => ({
  tts: vi.fn(async () => null),
  ttsStreamFetch: vi.fn(),
  saveSession: vi.fn(async () => 'session-g1'),
  saveJournal: vi.fn(async () => {}),
}))

vi.mock('../../store', () => ({
  recordSession: vi.fn(),
}))

vi.mock('../../audio', () => ({
  playAudioBuffer: vi.fn(async () => {}),
  playAudioStream: vi.fn(async () => {}),
  playBell: vi.fn(),
  stopCurrentAudio: vi.fn(),
}))

import { mountGratitude, GRATITUDE_ROUNDS } from '../gratitude'

describe('Gratitude mode', () => {
  let container: HTMLElement
  let onDone: ReturnType<typeof vi.fn>

  beforeEach(() => {
    container = document.createElement('div')
    onDone = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exports GRATITUDE_ROUNDS = 3', () => {
    expect(GRATITUDE_ROUNDS).toBe(3)
  })

  it('renders initial prompt and input', () => {
    mountGratitude(container, onDone)

    expect(container.querySelector('.gratitude-screen')).not.toBeNull()
    expect(container.querySelector('#gratitude-prompt')?.textContent).toContain('感謝')
    expect(container.querySelector('#gratitude-input')).not.toBeNull()
    expect(container.querySelector('#gratitude-send-btn')).not.toBeNull()
  })

  it('shows round counter (1/3)', () => {
    mountGratitude(container, onDone)

    const counter = container.querySelector('#gratitude-round')
    expect(counter?.textContent).toContain('1')
    expect(counter?.textContent).toContain('3')
  })

  it('advances to next round after submitting text', async () => {
    mountGratitude(container, onDone)

    const input = container.querySelector('#gratitude-input') as HTMLTextAreaElement
    const sendBtn = container.querySelector('#gratitude-send-btn') as HTMLButtonElement

    input.value = '家族に感謝'
    sendBtn.click()
    await new Promise(r => setTimeout(r, 50))

    const counter = container.querySelector('#gratitude-round')
    expect(counter?.textContent).toContain('2')
  })

  it('calls onDone after 3 rounds', async () => {
    mountGratitude(container, onDone)

    const input = container.querySelector('#gratitude-input') as HTMLTextAreaElement
    const sendBtn = container.querySelector('#gratitude-send-btn') as HTMLButtonElement

    for (let i = 0; i < 3; i++) {
      input.value = `感謝 ${i + 1}`
      sendBtn.click()
      await new Promise(r => setTimeout(r, 50))
    }

    expect(onDone).toHaveBeenCalled()
  })

  it('does not submit empty text', () => {
    mountGratitude(container, onDone)

    const input = container.querySelector('#gratitude-input') as HTMLTextAreaElement
    const sendBtn = container.querySelector('#gratitude-send-btn') as HTMLButtonElement

    input.value = ''
    sendBtn.click()

    // Round should still be 1
    const counter = container.querySelector('#gratitude-round')
    expect(counter?.textContent).toContain('1')
  })

  it('clears input after each round', async () => {
    mountGratitude(container, onDone)

    const input = container.querySelector('#gratitude-input') as HTMLTextAreaElement
    const sendBtn = container.querySelector('#gratitude-send-btn') as HTMLButtonElement

    input.value = '家族に感謝'
    sendBtn.click()
    await new Promise(r => setTimeout(r, 50))

    expect(input.value).toBe('')
  })

  it('has a skip/cancel button', () => {
    mountGratitude(container, onDone)

    const cancelBtn = container.querySelector('#gratitude-cancel-btn') as HTMLButtonElement
    expect(cancelBtn).not.toBeNull()
    cancelBtn.click()
    expect(onDone).toHaveBeenCalledWith(undefined)
  })
})
