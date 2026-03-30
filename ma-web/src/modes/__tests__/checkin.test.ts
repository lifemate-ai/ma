import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../api', () => ({
  saveCheckin: vi.fn(async () => {}),
  tts: vi.fn(async () => null),
  ttsStreamFetch: vi.fn(),
}))

vi.mock('../../audio', () => ({
  playAudioBuffer: vi.fn(async () => {}),
  playAudioStream: vi.fn(async () => {}),
  stopCurrentAudio: vi.fn(),
}))

import { mountCheckin, CHECKIN_QUESTIONS } from '../checkin'
import { saveCheckin } from '../../api'

describe('Self-Awareness Check-in mode', () => {
  let container: HTMLElement
  let onDone: ReturnType<typeof vi.fn>

  beforeEach(() => {
    container = document.createElement('div')
    onDone = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exports CHECKIN_QUESTIONS with 3 questions', () => {
    expect(CHECKIN_QUESTIONS).toHaveLength(3)
  })

  it('renders first question with input', () => {
    mountCheckin(container, onDone)

    expect(container.querySelector('.checkin-screen')).not.toBeNull()
    expect(container.querySelector('#checkin-question')?.textContent).toContain('感情')
    expect(container.querySelector('#checkin-input')).not.toBeNull()
    expect(container.querySelector('#checkin-next-btn')).not.toBeNull()
  })

  it('shows question counter (1/3)', () => {
    mountCheckin(container, onDone)

    const counter = container.querySelector('#checkin-counter')
    expect(counter?.textContent).toContain('1')
    expect(counter?.textContent).toContain('3')
  })

  it('advances to second question after submit', () => {
    mountCheckin(container, onDone)

    const input = container.querySelector('#checkin-input') as HTMLInputElement
    const nextBtn = container.querySelector('#checkin-next-btn') as HTMLButtonElement

    input.value = '落ち着いている'
    nextBtn.click()

    const counter = container.querySelector('#checkin-counter')
    expect(counter?.textContent).toContain('2')
    expect(container.querySelector('#checkin-question')?.textContent).toContain('体')
  })

  it('advances to third question', () => {
    mountCheckin(container, onDone)

    const input = container.querySelector('#checkin-input') as HTMLInputElement
    const nextBtn = container.querySelector('#checkin-next-btn') as HTMLButtonElement

    input.value = '落ち着いている'
    nextBtn.click()

    input.value = '肩が軽い'
    nextBtn.click()

    const counter = container.querySelector('#checkin-counter')
    expect(counter?.textContent).toContain('3')
    expect(container.querySelector('#checkin-question')?.textContent).toContain('意図')
  })

  it('calls saveCheckin and onDone after all 3 questions', async () => {
    mountCheckin(container, onDone)

    const input = container.querySelector('#checkin-input') as HTMLInputElement
    const nextBtn = container.querySelector('#checkin-next-btn') as HTMLButtonElement

    input.value = '落ち着いている'
    nextBtn.click()

    input.value = '肩が軽い'
    nextBtn.click()

    input.value = '今日は集中する'
    nextBtn.click()

    await new Promise(r => setTimeout(r, 50))

    expect(saveCheckin).toHaveBeenCalledWith({
      emotion: '落ち着いている',
      body_state: '肩が軽い',
      intention: '今日は集中する',
    })
    expect(onDone).toHaveBeenCalled()
  })

  it('does not advance with empty input', () => {
    mountCheckin(container, onDone)

    const input = container.querySelector('#checkin-input') as HTMLInputElement
    const nextBtn = container.querySelector('#checkin-next-btn') as HTMLButtonElement

    input.value = ''
    nextBtn.click()

    const counter = container.querySelector('#checkin-counter')
    expect(counter?.textContent).toContain('1')
  })

  it('clears input between questions', () => {
    mountCheckin(container, onDone)

    const input = container.querySelector('#checkin-input') as HTMLInputElement
    const nextBtn = container.querySelector('#checkin-next-btn') as HTMLButtonElement

    input.value = '落ち着いている'
    nextBtn.click()

    expect(input.value).toBe('')
  })

  it('has a cancel button', () => {
    mountCheckin(container, onDone)

    const cancelBtn = container.querySelector('#checkin-cancel-btn') as HTMLButtonElement
    expect(cancelBtn).not.toBeNull()
    cancelBtn.click()
    expect(onDone).toHaveBeenCalledWith(undefined)
  })
})
