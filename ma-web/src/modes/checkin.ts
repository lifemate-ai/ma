import { saveCheckin } from '../api'
import { stopCurrentAudio } from '../audio'
import { speakText } from '../voice-guidance'

export interface CheckinQuestion {
  key: string
  label: string
  spoken: string
}

export const CHECKIN_QUESTIONS: CheckinQuestion[] = [
  { key: 'emotion', label: '今の感情は？', spoken: '今の感情は、どんな感じですか？' },
  { key: 'body_state', label: '体の状態は？', spoken: '体の状態は、どうですか？' },
  { key: 'intention', label: '今日の意図は？', spoken: '今日の意図を、ひとことで置いてみましょう。' },
]

export function mountCheckin(container: HTMLElement, onDone: (sessionId?: string) => void) {
  let currentIndex = 0
  const answers: string[] = []

  container.innerHTML = `
    <div class="checkin-screen">
      <div class="simple-practice-card">
        <div class="simple-practice-eyebrow">check-in</div>
        <div class="checkin-title">チェックイン</div>
        <div id="checkin-counter" class="checkin-counter">${currentIndex + 1} / ${CHECKIN_QUESTIONS.length}</div>
        <div id="checkin-question" class="checkin-question">${CHECKIN_QUESTIONS[0].label}</div>
        <input type="text" id="checkin-input" class="checkin-input" placeholder="ひとことで..." />
        <div class="simple-practice-actions">
          <button class="mode-btn" id="checkin-next-btn">次へ</button>
          <button class="stop-btn" id="checkin-cancel-btn">やめる</button>
        </div>
      </div>
    </div>
  `

  const counterEl = container.querySelector('#checkin-counter') as HTMLElement
  const questionEl = container.querySelector('#checkin-question') as HTMLElement
  const input = container.querySelector('#checkin-input') as HTMLInputElement
  const nextBtn = container.querySelector('#checkin-next-btn') as HTMLButtonElement
  const cancelBtn = container.querySelector('#checkin-cancel-btn') as HTMLButtonElement

  speakCurrentQuestion().catch(() => {})

  cancelBtn.addEventListener('click', () => {
    stopCurrentAudio()
    onDone(undefined)
  })

  nextBtn.addEventListener('click', async () => {
    const text = input.value.trim()
    if (!text) return

    answers.push(text)
    currentIndex++

    if (currentIndex >= CHECKIN_QUESTIONS.length) {
      // All questions answered - save to DB
      await saveCheckin({
        emotion: answers[0],
        body_state: answers[1],
        intention: answers[2],
      }).catch(() => {})
      await speakText('今の自分の輪郭が、少し見えました。', 'closing', {
        preferStream: false,
      })
      onDone()
      return
    }

    // Show next question
    counterEl.textContent = `${currentIndex + 1} / ${CHECKIN_QUESTIONS.length}`
    questionEl.textContent = CHECKIN_QUESTIONS[currentIndex].label
    input.value = ''
    input.focus()
    await speakCurrentQuestion()
  })

  async function speakCurrentQuestion() {
    const question = CHECKIN_QUESTIONS[currentIndex]
    await speakText(question.spoken, 'prompt', { preferStream: false })
  }
}
