import { loopBack, saveJournal } from './api'
import { speakText, toDisplayText } from './voice-guidance'

export function mountJournal(container: HTMLElement, sessionId: string | undefined, onDone: () => void) {
  container.innerHTML = `
    <div class="journal-screen">
      <div class="journal-prompt">今、どんな感じ？<br><span class="journal-hint">一言でいい。</span></div>
      <div class="input-area">
        <textarea id="journal-input" placeholder="今日は少し落ち着かなかった…" rows="3"></textarea>
        <button class="send-btn" id="send-btn">送る</button>
      </div>
      <div class="loop-area hidden" id="loop-area">
        <div class="loop-text" id="loop-text"></div>
        <div class="loop-confirm">
          <button class="confirm-btn yes" id="yes-btn">そう</button>
          <button class="confirm-btn no" id="no-btn">ちょっと違う</button>
        </div>
      </div>
      <button class="done-btn" id="done-btn">おわる</button>
    </div>
    <style>
      .journal-screen { height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; gap: 1.5rem; }
      .journal-prompt { font-size: 1.2rem; text-align: center; line-height: 1.8; color: #c8c4bc; }
      .journal-hint { font-size: 0.85rem; color: #5a5850; }
      .input-area { width: 100%; max-width: 360px; display: flex; flex-direction: column; gap: 0.75rem; }
      #journal-input { background: #222; border: 1px solid #3a3830; color: #e8e4dc; padding: 1rem; font-size: 1rem; font-family: inherit; resize: none; border-radius: 4px; outline: none; line-height: 1.7; }
      #journal-input:focus { border-color: #6a6458; }
      .send-btn { background: transparent; border: 1px solid #4a4840; color: #e8e4dc; padding: 0.75rem; cursor: pointer; border-radius: 4px; font-size: 0.95rem; }
      .send-btn:hover { border-color: #8a8478; }
      .loop-area { text-align: center; max-width: 320px; }
      .loop-text { font-size: 1rem; color: #c8c4bc; line-height: 1.8; margin-bottom: 1rem; }
      .loop-confirm { display: flex; gap: 1rem; justify-content: center; }
      .confirm-btn { background: transparent; border: 1px solid #4a4840; color: #e8e4dc; padding: 0.5rem 1.5rem; cursor: pointer; border-radius: 4px; }
      .confirm-btn:hover { border-color: #8a8478; }
      .done-btn { background: transparent; border: 1px solid #3a3830; color: #9a9488; font-size: 0.9rem; cursor: pointer; padding: 0.6rem 2rem; border-radius: 4px; }
      .hidden { display: none !important; }
    </style>
  `

  const sendBtn = container.querySelector('#send-btn') as HTMLButtonElement
  const inputEl = container.querySelector('#journal-input') as HTMLTextAreaElement
  const loopArea = container.querySelector('#loop-area') as HTMLElement
  const loopText = container.querySelector('#loop-text') as HTMLElement
  const doneBtn = container.querySelector('#done-btn') as HTMLButtonElement
  let userText = ''
  let loopResponse = ''
  let saved = false

  speakText('今、どんな感じですか。[pause] 一言で大丈夫です。', 'prompt', {
    preferStream: false,
  }).catch(() => {})

  sendBtn.addEventListener('click', async () => {
    userText = inputEl.value.trim()
    if (!userText) return
    sendBtn.disabled = true
    sendBtn.textContent = '…'
    inputEl.disabled = true

    // ルーピング: コンパニオンが言い換えて返す
    loopResponse = await loopBack(userText).catch(() => '')
    sendBtn.textContent = '送る'
    if (loopResponse) {
      loopText.textContent = toDisplayText(loopResponse)
      loopArea.classList.remove('hidden')
      await speakText(loopResponse, 'reflection')
    } else {
      // ループが取れなくてもジャーナルは保存
      await persistJournal(true)
      doneBtn.classList.remove('hidden')
    }
  })

  container.querySelector('#yes-btn')!.addEventListener('click', async () => {
    loopArea.classList.add('hidden')
    if (!saved) { saved = true; await persistJournal(true) }
  })

  container.querySelector('#no-btn')!.addEventListener('click', () => {
    // 再入力できるようにする
    loopArea.classList.add('hidden')
    inputEl.disabled = false
    sendBtn.disabled = false
    inputEl.focus()
  })

  doneBtn.addEventListener('click', async () => {
    if (userText && !saved) { saved = true; await persistJournal(false).catch(() => {}) }
    onDone()
  })

  async function persistJournal(confirmed: boolean) {
    await saveJournal({
      session_id: sessionId,
      user_text: userText,
      companion_loop: confirmed ? loopResponse : undefined,
    }).catch(() => {})
  }
}
