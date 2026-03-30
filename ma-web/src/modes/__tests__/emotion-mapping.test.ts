import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../api', () => ({
  loopBack: vi.fn(async (text: string) => `reflected: ${text}`),
  tts: vi.fn(async () => null),
  ttsStreamFetch: vi.fn(),
}))

vi.mock('../../audio', () => ({
  playAudioBuffer: vi.fn(async () => {}),
  playAudioStream: vi.fn(async () => {}),
  stopCurrentAudio: vi.fn(),
}))

import { mountEmotionMapping, EMOTIONS } from '../emotion-mapping'
import { loopBack } from '../../api'

describe('Emotion Mapping mode', () => {
  let container: HTMLElement
  let onDone: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    container = document.createElement('div')
    onDone = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exports a list of emotions', () => {
    expect(EMOTIONS.length).toBeGreaterThan(0)
    expect(EMOTIONS).toContain('喜び')
    expect(EMOTIONS).toContain('怒り')
    expect(EMOTIONS).toContain('悲しみ')
  })

  it('renders emotion selection buttons', () => {
    mountEmotionMapping(container, onDone)

    const buttons = container.querySelectorAll('.emotion-btn')
    expect(buttons.length).toBe(EMOTIONS.length)
  })

  it('shows body location input after selecting emotion', () => {
    mountEmotionMapping(container, onDone)

    const firstBtn = container.querySelector('.emotion-btn') as HTMLButtonElement
    firstBtn.click()

    const bodyInput = container.querySelector('#body-location-input') as HTMLInputElement
    expect(bodyInput).not.toBeNull()
    expect(container.querySelector('#body-location-prompt')?.textContent).toContain('体のどこ')
  })

  it('calls loopBack API with emotion + body location', async () => {
    mountEmotionMapping(container, onDone)

    // Select emotion
    const firstBtn = container.querySelector('.emotion-btn') as HTMLButtonElement
    firstBtn.click()

    // Enter body location
    const bodyInput = container.querySelector('#body-location-input') as HTMLInputElement
    bodyInput.value = '胸'
    const sendBtn = container.querySelector('#body-send-btn') as HTMLButtonElement
    sendBtn.click()

    await new Promise(r => setTimeout(r, 10))

    expect(loopBack).toHaveBeenCalled()
    const callArg = (loopBack as any).mock.calls[0][0] as string
    expect(callArg).toContain('胸')
  })

  it('displays companion reflection after submit', async () => {
    mountEmotionMapping(container, onDone)

    const firstBtn = container.querySelector('.emotion-btn') as HTMLButtonElement
    firstBtn.click()

    const bodyInput = container.querySelector('#body-location-input') as HTMLInputElement
    bodyInput.value = '胸'
    const sendBtn = container.querySelector('#body-send-btn') as HTMLButtonElement
    sendBtn.click()

    await new Promise(r => setTimeout(r, 50))

    const reflectionEl = container.querySelector('#em-reflection')
    expect(reflectionEl?.textContent).toContain('reflected')
  })

  it('has a done button that calls onDone', async () => {
    mountEmotionMapping(container, onDone)

    const firstBtn = container.querySelector('.emotion-btn') as HTMLButtonElement
    firstBtn.click()

    const bodyInput = container.querySelector('#body-location-input') as HTMLInputElement
    bodyInput.value = '胸'
    const sendBtn = container.querySelector('#body-send-btn') as HTMLButtonElement
    sendBtn.click()

    await new Promise(r => setTimeout(r, 50))

    const doneBtn = container.querySelector('#em-done-btn') as HTMLButtonElement
    expect(doneBtn).not.toBeNull()
    doneBtn.click()

    expect(onDone).toHaveBeenCalled()
  })

  it('handles empty body location gracefully', () => {
    mountEmotionMapping(container, onDone)

    const firstBtn = container.querySelector('.emotion-btn') as HTMLButtonElement
    firstBtn.click()

    const bodyInput = container.querySelector('#body-location-input') as HTMLInputElement
    bodyInput.value = ''
    const sendBtn = container.querySelector('#body-send-btn') as HTMLButtonElement
    sendBtn.click()

    // Should not call API with empty input
    expect(loopBack).not.toHaveBeenCalled()
  })

  it('has a cancel/skip button visible from the start', () => {
    mountEmotionMapping(container, onDone)

    const cancelBtn = container.querySelector('#em-cancel-btn') as HTMLButtonElement
    expect(cancelBtn).not.toBeNull()
    cancelBtn.click()
    expect(onDone).toHaveBeenCalledWith(undefined)
  })
})
