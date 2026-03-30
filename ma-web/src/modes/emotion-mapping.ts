import { loopBack } from '../api'
import { stopCurrentAudio } from '../audio'
import { speakText, toDisplayText } from '../voice-guidance'

export const EMOTIONS = [
  '喜び', '悲しみ', '怒り', '不安', '恐れ',
  '驚き', '嫌悪', '期待', '穏やか', 'もやもや',
]

export function mountEmotionMapping(container: HTMLElement, onDone: (sessionId?: string) => void) {
  let selectedEmotion = ''

  container.innerHTML = `
    <div class="emotion-mapping-screen">
      <div class="em-title">感情をたどる</div>
      <div class="em-prompt" id="em-prompt">今、どんな感情がありますか？</div>
      <div class="em-emotions" id="em-emotions">
        ${EMOTIONS.map(e => `<button class="emotion-btn" data-emotion="${e}">${e}</button>`).join('')}
      </div>
      <div class="em-body-section hidden" id="em-body-section">
        <div id="body-location-prompt" class="em-prompt">その感情は、体のどこにありますか？</div>
        <input type="text" id="body-location-input" class="em-input" placeholder="例: 胸、お腹、肩..." />
        <button class="mode-btn" id="body-send-btn">送る</button>
      </div>
      <div class="em-reflection-section hidden" id="em-reflection-section">
        <div id="em-reflection" class="em-reflection"></div>
        <button class="mode-btn" id="em-done-btn">おわる</button>
      </div>
      <button class="stop-btn" id="em-cancel-btn">やめる</button>
    </div>
    <style>
      .emotion-mapping-screen { height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; gap: 1.5rem; }
      .em-title { font-size: 1.3rem; color: #e8e4dc; }
      .em-prompt { font-size: 1rem; color: #c8c4bc; text-align: center; }
      .em-emotions { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; max-width: 320px; }
      .emotion-btn { background: transparent; border: 1px solid #3a3830; color: #e8e4dc; padding: 0.5rem 1rem; cursor: pointer; border-radius: 4px; font-size: 0.9rem; }
      .emotion-btn:hover { border-color: #6a6458; background: #222; }
      .em-input { background: #222; border: 1px solid #3a3830; color: #e8e4dc; padding: 0.75rem; font-size: 1rem; border-radius: 4px; outline: none; width: 100%; max-width: 280px; }
      .em-input:focus { border-color: #6a6458; }
      .em-reflection { font-size: 1rem; color: #c8c4bc; text-align: center; max-width: 300px; line-height: 1.8; }
      .em-body-section, .em-reflection-section { display: flex; flex-direction: column; align-items: center; gap: 1rem; }
      .hidden { display: none !important; }
      .stop-btn { background: transparent; border: 1px solid #4a4840; color: #8a8478; font-size: 0.85rem; cursor: pointer; padding: 0.5rem 1.5rem; border-radius: 4px; }
      .mode-btn { background: transparent; border: 1px solid #4a4840; color: #e8e4dc; padding: 0.75rem 2rem; cursor: pointer; border-radius: 4px; font-size: 0.95rem; }
    </style>
  `

  const emotionsArea = container.querySelector('#em-emotions') as HTMLElement
  const bodySection = container.querySelector('#em-body-section') as HTMLElement
  const reflectionSection = container.querySelector('#em-reflection-section') as HTMLElement
  const reflectionEl = container.querySelector('#em-reflection') as HTMLElement
  const cancelBtn = container.querySelector('#em-cancel-btn') as HTMLButtonElement
  const doneBtn = container.querySelector('#em-done-btn') as HTMLButtonElement

  cancelBtn.addEventListener('click', () => {
    stopCurrentAudio()
    onDone(undefined)
  })

  doneBtn.addEventListener('click', () => {
    onDone()
  })

  // 開始時に最初の問いかけを音声で読む
  speakText('今、どんな感情がありますか？', 'prompt', { preferStream: false }).catch(() => {})

  // Emotion selection
  container.querySelectorAll('.emotion-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      selectedEmotion = (btn as HTMLElement).dataset.emotion ?? ''
      emotionsArea.classList.add('hidden')
      container.querySelector('#em-prompt')?.classList.add('hidden')
      bodySection.classList.remove('hidden')

      // 体の場所の問いかけを音声で読む
      await speakText('その感情は、体のどこにありますか？', 'prompt', { preferStream: false })
    })
  })

  // Body location submit
  const bodyInput = container.querySelector('#body-location-input') as HTMLInputElement
  const bodySendBtn = container.querySelector('#body-send-btn') as HTMLButtonElement

  bodySendBtn.addEventListener('click', async () => {
    const location = bodyInput.value.trim()
    if (!location) return

    bodySendBtn.disabled = true
    bodySendBtn.textContent = '...'

    const journalText = `感情: ${selectedEmotion}。体の場所: ${location}。`
    const reflection = await loopBack(journalText).catch(() => '')

    bodySection.classList.add('hidden')
    reflectionSection.classList.remove('hidden')
    reflectionEl.textContent = toDisplayText(reflection, '...')

    if (reflection) {
      await speakText(reflection, 'reflection', { preferStream: false })
    }
  })
}
