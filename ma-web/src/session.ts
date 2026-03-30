import { playBell, playDecoded, decodeBuffer, resumeAudio, stopCurrentAudio } from './audio'
import { greet, guide, closeSession, tts, saveSession, saveObservation, SessionMode, getCurriculumStatus } from './api'
import { getStats, recordSession, daysSinceLast } from './store'
import { mountSbnrr } from './modes/sbnrr'
import { mountEmotionMapping } from './modes/emotion-mapping'
import { mountGratitude } from './modes/gratitude'
import { mountCompassion } from './modes/compassion'
import { mountCheckin } from './modes/checkin'
import { speakText, toDisplayText } from './voice-guidance'

type Phase = 'idle' | 'greeting' | 'running' | 'extending' | 'closing' | 'journal'

interface SessionState {
  mode: SessionMode
  startedAt: number
  elapsed: number
  phase: Phase
  targetDuration: number
}

const BASE_DURATION = 120 // 2分 (秒)
const EXTENSION = 120     // 延長単位 (秒)
const WATCH_INITIAL_DELAY_MS = 8000
const WATCH_INTERVAL_MS = 45000

// ── ボディスキャン キューシーケンス ─────────────────────────────

const BODY_SCAN_CUES = [
  { at: 0,   text: '[calm][gently][slowly] 楽な姿勢で、目を閉じてください。[pause] まず足の裏に注意を向けます。' },
  { at: 15,  text: '[calm][softly] 足首とふくらはぎへ。[pause] どんな感覚があっても、ただ気づくだけ。' },
  { at: 30,  text: '[calm][gently] 膝から太ももへ。[pause] 重さや温もりを感じてみて。' },
  { at: 45,  text: '[calm][softly][slowly] お腹と腰へ。[pause] 息と一緒に、ゆっくり動いている。' },
  { at: 60,  text: '[calm][gently] 胸と背中へ。[pause] 呼吸で広がり、縮む感覚。' },
  { at: 75,  text: '[calm][softly] 両手の指先から腕へ。[pause] じんわりした感覚を、ただ感じて。' },
  { at: 90,  text: '[calm][gently][slowly] 肩と首へ。[pause] 緊張があれば、そっと手放す。' },
  { at: 105, text: '[calm][softly] 顔から頭のてっぺんへ。[pause] 体全体をひとつとして感じて。' },
]

export function mountSession(
  container: HTMLElement,
  onDone: (sessionId?: string) => void,
  onHistory: () => void,
) {
  let state: SessionState | null = null
  let timer: number | null = null
  let currentSessionId: string | undefined
  let greetCancelled = false
  let midBellFired = false
  let sessionEnded = false
  let watchStream: MediaStream | null = null
  let watchEnabled = false
  let watchBusy = false
  let watchStartTimer: number | null = null
  let watchInterval: number | null = null

  // ── UI ─────────────────────────────────────────────────────

  container.innerHTML = `
    <div class="session-screen">
      <div class="greeting-area" id="greeting-text"></div>
      <div class="curriculum-hint" id="curriculum-hint"></div>
      <div class="watch-panel" id="watch-panel">
        <div class="watch-head">見守り</div>
        <div class="watch-status" id="watch-status">camera をつなぐと、そっと様子を見て companion memory に残せます。</div>
        <video class="watch-preview hidden" id="watch-preview" autoplay muted playsinline></video>
        <button class="watch-btn" id="watch-btn">見守りを有効にする</button>
      </div>
      <div class="mode-select" id="mode-select">
        <button class="mode-btn" data-mode="yasashii">
          <span class="mode-title">やさしい</span>
          <span class="mode-desc">呼吸に注意を向ける</span>
        </button>
        <button class="mode-btn" data-mode="motto_yasashii">
          <span class="mode-title">もっとやさしい</span>
          <span class="mode-desc">ただ、座る</span>
        </button>
        <button class="mode-btn" data-mode="body_scan">
          <span class="mode-title">体をめぐる</span>
          <span class="mode-desc">ボディスキャン</span>
        </button>
        <button class="mode-btn" data-mode="sbnrr">
          <span class="mode-title">SBNRR</span>
          <span class="mode-desc">止まる・呼吸・注意・反省・反応</span>
        </button>
        <button class="mode-btn" data-mode="emotion_mapping">
          <span class="mode-title">感情をたどる</span>
          <span class="mode-desc">感情マッピング</span>
        </button>
        <button class="mode-btn" data-mode="gratitude">
          <span class="mode-title">感謝する</span>
          <span class="mode-desc">感謝プラクティス</span>
        </button>
        <button class="mode-btn" data-mode="compassion">
          <span class="mode-title">思いを届ける</span>
          <span class="mode-desc">慈悲の瞑想</span>
        </button>
        <button class="mode-btn" data-mode="checkin">
          <span class="mode-title">チェックイン</span>
          <span class="mode-desc">今の自分を知る</span>
        </button>
      </div>
      <div class="running-area hidden" id="running-area">
        <div class="timer-display" id="timer-display">2:00</div>
        <div class="breath-circle-wrap" id="breath-circle-wrap">
          <div class="breath-circle"></div>
          <div class="breath-cue" id="breath-cue">吸って</div>
        </div>
        <div class="mode-hint" id="mode-hint"></div>
        <div class="running-guide" id="running-guide"></div>
        <button class="stop-btn" id="stop-btn">やめる</button>
      </div>
      <div class="extending-area hidden" id="extending-area">
        <div class="extending-text">続けますか？</div>
        <button class="extend-btn" id="extend-btn">もう少し</button>
        <button class="end-btn" id="end-btn">おわる</button>
      </div>
      <div class="closing-area hidden" id="closing-area">
        <div class="closing-text" id="closing-text"></div>
        <button class="journal-btn" id="journal-btn">振り返る</button>
        <button class="skip-btn" id="skip-btn">そのまま終わる</button>
        <button class="history-link" id="closing-history-link">記録を見る</button>
      </div>
    </div>
    <style>
      .session-screen { height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; gap: 2rem; }
      .greeting-area { font-size: 1.1rem; line-height: 1.8; text-align: center; color: #c8c4bc; max-width: 320px; min-height: 3em; }
      .watch-panel { width: 100%; max-width: 320px; border: 1px solid #302d27; border-radius: 8px; padding: 0.9rem 1rem; display: flex; flex-direction: column; gap: 0.65rem; background: rgba(22, 21, 19, 0.72); }
      .watch-head { font-size: 0.82rem; color: #a69a87; letter-spacing: 0.08em; text-transform: uppercase; }
      .watch-status { font-size: 0.8rem; line-height: 1.6; color: #8a8478; min-height: 2.6em; }
      .watch-preview { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 6px; border: 1px solid #3a3830; background: #111; }
      .watch-btn { align-self: flex-start; background: transparent; border: 1px solid #4a4840; color: #d9d3ca; padding: 0.55rem 0.9rem; cursor: pointer; border-radius: 999px; font-size: 0.82rem; }
      .watch-btn:hover { border-color: #8a8478; }
      .mode-select { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; width: 100%; max-width: 480px; }
      .mode-btn { background: transparent; border: 1px solid #3a3830; color: #e8e4dc; padding: 0.9rem 1rem; cursor: pointer; text-align: left; transition: border-color 0.2s, background 0.2s; border-radius: 4px; }
      .mode-btn:hover { border-color: #6a6458; background: #222; }
      .mode-title { display: block; font-size: 0.95rem; margin-bottom: 0.2rem; }
      .mode-desc { display: block; font-size: 0.7rem; color: #7a7468; }
      .running-area { display: flex; flex-direction: column; align-items: center; gap: 1.5rem; }
      .timer-display { font-size: 2.5rem; color: #c8c4bc; letter-spacing: 0.05em; font-variant-numeric: tabular-nums; }
      .breath-circle-wrap { position: relative; width: 140px; height: 140px; display: flex; align-items: center; justify-content: center; }
      .breath-circle { position: absolute; inset: 0; border-radius: 50%; border: 2px solid #9a9488; background: radial-gradient(circle, #3a3830 0%, transparent 70%); animation: breathe 4s ease-in-out infinite; }
      @keyframes breathe { 0%,100% { transform: scale(1); opacity: 0.6; box-shadow: 0 0 8px #4a4840; } 50% { transform: scale(1.18); opacity: 1; box-shadow: 0 0 24px #7a7468; } }
      .breath-cue { position: relative; font-size: 0.85rem; color: #c8c4bc; letter-spacing: 0.1em; pointer-events: none; transition: opacity 0.6s ease-in-out; }
      .mode-hint { font-size: 0.8rem; color: #6a6458; text-align: center; max-width: 260px; line-height: 1.6; }
      .running-guide { font-size: 1rem; color: #c8c4bc; text-align: center; max-width: 280px; line-height: 1.8; min-height: 2em; }
      .body-scan-guide { font-size: 1.05rem; color: #c8c4bc; text-align: center; max-width: 300px; line-height: 1.9; min-height: 4em; transition: opacity 0.5s; }
      .stop-btn { background: transparent; border: 1px solid #4a4840; color: #8a8478; font-size: 0.85rem; cursor: pointer; margin-top: 0.5rem; padding: 0.5rem 1.5rem; border-radius: 4px; }
      .stop-btn:hover { border-color: #8a8478; color: #c8c4bc; }
      .curriculum-hint { font-size: 0.8rem; color: #6a6458; text-align: center; min-height: 1.2em; }
      .curriculum-hint .suggested { color: #8a8070; }
      .mode-btn.suggested { border-color: #5a5448; }
      .mode-btn.suggested .mode-title::after { content: ' ·'; color: #7a7060; }
      .extending-area { display: flex; flex-direction: column; align-items: center; gap: 1.5rem; }
      .extending-text { font-size: 1rem; color: #c8c4bc; }
      .extend-btn { background: transparent; border: 1px solid #4a4840; color: #e8e4dc; padding: 0.75rem 2rem; cursor: pointer; border-radius: 4px; font-size: 0.95rem; }
      .extend-btn:hover { border-color: #8a8478; }
      .end-btn { background: transparent; border: none; color: #5a5850; font-size: 0.8rem; cursor: pointer; }
      .closing-area { display: flex; flex-direction: column; align-items: center; gap: 1.5rem; }
      .closing-text { font-size: 1rem; color: #c8c4bc; text-align: center; max-width: 300px; line-height: 1.8; }
      .journal-btn { background: transparent; border: 1px solid #4a4840; color: #e8e4dc; padding: 0.75rem 2rem; cursor: pointer; border-radius: 4px; font-size: 0.95rem; }
      .journal-btn:hover { border-color: #8a8478; }
      .skip-btn { background: transparent; border: none; color: #5a5850; font-size: 0.8rem; cursor: pointer; }
      .history-link { background: transparent; border: none; color: #4a4840; font-size: 0.75rem; cursor: pointer; }
      .history-link:hover { color: #7a7468; }
      .mode-area-bottom { margin-top: 0.5rem; text-align: center; }
      .history-btn { background: transparent; border: none; color: #4a4840; font-size: 0.75rem; cursor: pointer; }
      .history-btn:hover { color: #7a7468; }
      .hidden { display: none !important; }
    </style>
  `

  // ── 履歴リンク ───────────────────────────────────────────────

  const modeSelectEl = container.querySelector('#mode-select') as HTMLElement
  const historyDiv = document.createElement('div')
  historyDiv.className = 'mode-area-bottom'
  historyDiv.innerHTML = '<button class="history-btn" id="history-btn">記録を見る</button>'
  modeSelectEl.after(historyDiv)
  historyDiv.querySelector('#history-btn')!.addEventListener('click', () => {
    greetCancelled = true
    stopCurrentAudio()
    disableWatch()
    onHistory()
  })

  const watchStatusEl = container.querySelector('#watch-status') as HTMLElement
  const watchPreviewEl = container.querySelector('#watch-preview') as HTMLVideoElement
  const watchBtnEl = container.querySelector('#watch-btn') as HTMLButtonElement

  watchBtnEl.addEventListener('click', async () => {
    if (watchEnabled) {
      disableWatch()
      return
    }
    await enableWatch()
  })

  // ── カリキュラム提案 ──────────────────────────────────────────

  const curriculumHintEl = container.querySelector('#curriculum-hint') as HTMLElement
  getCurriculumStatus().then(status => {
    if (!status || status.suggested_modes.length === 0) return
    const MODE_LABELS: Record<string, string> = {
      yasashii: 'やさしい呼吸', motto_yasashii: 'ただ座る',
      body_scan: 'ボディスキャン', sbnrr: 'SBNRR',
      emotion_mapping: '感情マッピング', gratitude: '感謝',
      compassion: '慈悲の瞑想', checkin: 'チェックイン',
    }
    const labels = status.suggested_modes.map(m => MODE_LABELS[m] ?? m).join(' · ')
    curriculumHintEl.innerHTML = `<span class="suggested">今週のおすすめ: ${labels}</span>`
    // 該当ボタンをハイライト
    status.suggested_modes.forEach(mode => {
      const btn = container.querySelector(`[data-mode="${mode}"]`)
      btn?.classList.add('suggested')
    })
  }).catch(() => {})

  // ── 挨拶を非同期で取得・表示 ─────────────────────────────────

  const greetingEl = container.querySelector('#greeting-text') as HTMLElement
  const stats = getStats()
  greet({ sessions_total: stats.sessionsTotal, days_since_last: daysSinceLast() })
    .then(async text => {
      greetingEl.textContent = toDisplayText(text, '静かに、始めましょう。')
      await speakText(text, 'greeting', { isCancelled: () => greetCancelled })
    })
    .catch(() => { greetingEl.textContent = '静かに、始めましょう。' })

  // ── モード選択 ───────────────────────────────────────────────

  container.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      resumeAudio()
      greetCancelled = true
      stopCurrentAudio()
      const mode = (btn as HTMLElement).dataset.mode as SessionMode
      startSession(mode)
    })
  })

  // ── 中断ボタン ───────────────────────────────────────────────

  container.querySelector('#stop-btn')!.addEventListener('click', () => {
    if (sessionEnded) return
    sessionEnded = true
    stopCurrentAudio()
    disableWatch()
    if (timer) clearInterval(timer)
    const ra = container.querySelector('#running-area') as any
    if (ra?._cueTimer) clearInterval(ra._cueTimer)
    onDone(undefined)
  })

  // ── セッション開始 ───────────────────────────────────────────

  async function startSession(mode: SessionMode) {
    // SIY modes use their own UI, so delegate to dedicated modules
    const siyModes: Record<string, (c: HTMLElement, done: (id?: string) => void) => void> = {
      sbnrr: mountSbnrr,
      emotion_mapping: mountEmotionMapping,
      gratitude: mountGratitude,
      compassion: mountCompassion,
      checkin: mountCheckin,
    }

    if (mode in siyModes) {
      disableWatch()
      container.innerHTML = ''
      siyModes[mode](container, onDone)
      return
    }

    state = { mode, startedAt: Date.now(), elapsed: 0, phase: 'greeting', targetDuration: BASE_DURATION }

    container.querySelector('#mode-select')!.classList.add('hidden')
    const runningArea = container.querySelector('#running-area')!
    runningArea.classList.remove('hidden')

    const guideEl = container.querySelector('#running-guide') as HTMLElement
    const timerEl = container.querySelector('#timer-display') as HTMLElement

    startWatchLoop()

    if (mode === 'body_scan') {
      await startBodyScan(guideEl, timerEl)
    } else {
      await startBreathingSession(mode, guideEl, timerEl)
    }
  }

  // ── 呼吸モード（やさしい / もっとやさしい） ──────────────────

  async function startBreathingSession(mode: SessionMode, guideEl: HTMLElement, timerEl: HTMLElement) {
    const modeHints: Record<string, string> = {
      yasashii: '鼻から息を吸い、口からゆっくり吐く。呼吸に注意を向けるだけでいい。',
      motto_yasashii: '何もしなくていい。ただ、ここに座っているだけ。',
    }
    const hintEl = container.querySelector('#mode-hint') as HTMLElement
    hintEl.textContent = modeHints[mode] ?? ''

    const cueEl = container.querySelector('#breath-cue') as HTMLElement
    const cueDisplays = mode === 'motto_yasashii' ? ['ここに', 'いる'] : ['吸って', '吐いて']
    const cueTtsTexts = mode === 'yasashii'
      ? ['[calm][gently] 吸って', '[calm][gently] 吐いて']
      : null // motto_yasashii は無音

    // yasashii のみ: 呼吸キューTTSをオープニングガイドと並行してプリフェッチ・デコード
    const cueDecodedPromises: Promise<AudioBuffer | null>[] = cueTtsTexts
      ? cueTtsTexts.map(t => tts(t).then(buf => buf ? decodeBuffer(buf) : null).catch(() => null))
      : [Promise.resolve(null), Promise.resolve(null)]

    let cueIdx = 0
    let isGuideActive = true

    const switchCue = () => {
      cueEl.style.opacity = '0'
      setTimeout(async () => {
        cueIdx = (cueIdx + 1) % 2
        cueEl.textContent = cueDisplays[cueIdx]
        cueEl.style.opacity = '1'
        // ガイド再生中・セッション終了後はスキップ
        if (!isGuideActive && !sessionEnded && cueTtsTexts) {
          const decoded = await cueDecodedPromises[cueIdx]
          if (decoded && !isGuideActive && !sessionEnded) playDecoded(decoded)
        }
      }, 600)
    }
    const cueTimer = window.setInterval(switchCue, 4000)
    ;(container.querySelector('#running-area') as any)._cueTimer = cueTimer

    // オープニングガイダンス（TTS プリフェッチと並行）
    const openGuide = await guide({ mode, elapsed_seconds: 0, phase: 'open' }).catch(() => '')
    if (openGuide) {
      guideEl.textContent = toDisplayText(openGuide)
      await speakText(openGuide, 'guide', { isCancelled: () => sessionEnded })
    }
    isGuideActive = false

    state!.phase = 'running'
    state!.startedAt = Date.now()

    timer = window.setInterval(async () => {
      if (!state) return
      state.elapsed = Math.floor((Date.now() - state.startedAt) / 1000)
      updateTimerDisplay(timerEl, state.elapsed)

      if (state.elapsed >= 60 && !midBellFired) {
        midBellFired = true
        isGuideActive = true
        playBell('mid')
        const midGuide = await guide({ mode, elapsed_seconds: 60, phase: 'mid' }).catch(() => '')
        if (!sessionEnded && midGuide) {
          guideEl.textContent = toDisplayText(midGuide)
          await speakText(midGuide, 'guide', { isCancelled: () => sessionEnded })
        }
        isGuideActive = false
      }

      if (state.elapsed >= state.targetDuration && !sessionEnded) {
        await showExtendPrompt(timerEl)
      }
    }, 1000)
  }

  // ── ボディスキャンモード ─────────────────────────────────────

  async function startBodyScan(guideEl: HTMLElement, timerEl: HTMLElement) {
    // 呼吸円を隠してボディスキャン用テキストエリアに
    const circleWrap = container.querySelector('#breath-circle-wrap') as HTMLElement
    circleWrap.classList.add('hidden')
    guideEl.className = 'body-scan-guide'

    const hintEl = container.querySelector('#mode-hint') as HTMLElement
    hintEl.textContent = ''

    stopCurrentAudio() // 挨拶音声が再生中なら止める

    state!.phase = 'running'
    state!.startedAt = Date.now()

    let nextCueIdx = 0
    let cueInProgress = false

    timer = window.setInterval(async () => {
      if (!state) return
      state.elapsed = Math.floor((Date.now() - state.startedAt) / 1000)
      updateTimerDisplay(timerEl, state.elapsed)

      // 次のキューをオンデマンドでストリーミング再生
      if (!cueInProgress && nextCueIdx < BODY_SCAN_CUES.length &&
          state.elapsed >= BODY_SCAN_CUES[nextCueIdx].at && !sessionEnded) {
        cueInProgress = true
        const idx = nextCueIdx++
        const cue = BODY_SCAN_CUES[idx]

        // テキストは即表示（音声タグを除去）
        const displayText = toDisplayText(cue.text)
        guideEl.style.opacity = '0'
        setTimeout(() => {
          guideEl.textContent = displayText
          guideEl.style.opacity = '1'
        }, 300)

        if (!sessionEnded) {
          await speakText(cue.text, 'guide', { isCancelled: () => sessionEnded })
        }
        cueInProgress = false
      }

      if (state.elapsed >= state.targetDuration && !sessionEnded) {
        await showExtendPrompt(timerEl)
      }
    }, 1000)
  }

  // ── 延長プロンプト ───────────────────────────────────────────

  async function showExtendPrompt(timerEl: HTMLElement) {
    if (!state || sessionEnded) return
    state.phase = 'extending'
    clearInterval(timer!)

    playBell('mid')

    const runningArea = container.querySelector('#running-area')!
    const extendingArea = container.querySelector('#extending-area')!
    runningArea.classList.add('hidden')
    extendingArea.classList.remove('hidden')
    speakText('もう少し続けますか。[pause] ここで終えても大丈夫です。', 'transition', {
      isCancelled: () => sessionEnded,
    }).catch(() => {})

    let autoEndTimer = window.setTimeout(() => {
      doEnd()
    }, 10000)

    const extendBtn = extendingArea.querySelector('#extend-btn')!
    const endBtn = extendingArea.querySelector('#end-btn')!

    function doExtend() {
      clearTimeout(autoEndTimer)
      extendingArea.classList.add('hidden')
      runningArea.classList.remove('hidden')
      state!.targetDuration += EXTENSION
      state!.phase = 'running'
      state!.startedAt = Date.now() - state!.elapsed * 1000
      updateTimerDisplay(timerEl, state!.elapsed)
      timer = window.setInterval(async () => {
        if (!state) return
        state.elapsed = Math.floor((Date.now() - state.startedAt) / 1000)
        updateTimerDisplay(timerEl, state.elapsed)
        if (state.elapsed >= state.targetDuration && !sessionEnded) {
          await showExtendPrompt(timerEl)
        }
      }, 1000)
    }

    function doEnd() {
      clearTimeout(autoEndTimer)
      extendBtn.removeEventListener('click', doExtend)
      endBtn.removeEventListener('click', doEnd)
      sessionEnded = true
      stopWatchLoop()
      extendingArea.classList.add('hidden')
      endSession()
    }

    extendBtn.addEventListener('click', doExtend, { once: true })
    endBtn.addEventListener('click', doEnd, { once: true })
  }

  // ── タイマー表示更新 ─────────────────────────────────────────

  function updateTimerDisplay(el: HTMLElement, elapsed: number) {
    const target = state?.targetDuration ?? BASE_DURATION
    const remaining = Math.max(0, target - elapsed)
    const m = Math.floor(remaining / 60)
    const s = remaining % 60
    el.textContent = `${m}:${String(s).padStart(2, '0')}`
  }

  function updateWatchStatus(text: string) {
    watchStatusEl.textContent = text
  }

  async function enableWatch() {
    if (watchEnabled) return
    if (!navigator.mediaDevices?.getUserMedia) {
      updateWatchStatus('この環境では camera を使えません。')
      return
    }
    try {
      watchStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 320 },
          height: { ideal: 240 },
        },
        audio: false,
      })
      watchPreviewEl.srcObject = watchStream
      watchPreviewEl.classList.remove('hidden')
      await watchPreviewEl.play().catch(() => {})
      watchEnabled = true
      watchBtnEl.textContent = '見守りを止める'
      updateWatchStatus('見守りを有効にしました。落ち着いた頃に、そっと様子を受け取ります。')
      if (state?.phase === 'running') startWatchLoop()
    } catch {
      updateWatchStatus('camera の許可が取れませんでした。')
    }
  }

  function disableWatch() {
    stopWatchLoop()
    watchEnabled = false
    watchBusy = false
    watchBtnEl.textContent = '見守りを有効にする'
    if (watchStream) {
      watchStream.getTracks().forEach(track => track.stop())
      watchStream = null
    }
    watchPreviewEl.pause()
    watchPreviewEl.srcObject = null
    watchPreviewEl.classList.add('hidden')
    updateWatchStatus('camera をつなぐと、そっと様子を見て companion memory に残せます。')
  }

  function stopWatchLoop() {
    if (watchStartTimer) {
      clearTimeout(watchStartTimer)
      watchStartTimer = null
    }
    if (watchInterval) {
      clearInterval(watchInterval)
      watchInterval = null
    }
  }

  function startWatchLoop() {
    if (!watchEnabled || !watchStream) return
    stopWatchLoop()
    watchStartTimer = window.setTimeout(() => {
      captureObservation()
      watchInterval = window.setInterval(() => {
        captureObservation()
      }, WATCH_INTERVAL_MS)
    }, WATCH_INITIAL_DELAY_MS)
  }

  async function captureObservation() {
    if (!watchEnabled || !watchStream || watchBusy || sessionEnded || state?.phase !== 'running') return
    const imageDataUrl = captureFrame(watchPreviewEl)
    if (!imageDataUrl) return
    watchBusy = true
    try {
      const observationId = await saveObservation({
        source: 'browser_camera',
        image_data_url: imageDataUrl,
      })
      if (observationId) {
        updateWatchStatus('いまの様子を、静かに受け取りました。')
      }
    } catch {
      updateWatchStatus('見守りの送信に失敗しました。')
    } finally {
      watchBusy = false
    }
  }

  function captureFrame(video: HTMLVideoElement): string | null {
    const width = video.videoWidth
    const height = video.videoHeight
    if (!width || !height) return null
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, width, height)
    return canvas.toDataURL('image/jpeg', 0.72)
  }

  // ── セッション終了 ───────────────────────────────────────────

  async function endSession() {
    if (!state) return
    state.phase = 'closing'
    stopCurrentAudio()
    disableWatch()
    const runningArea = container.querySelector('#running-area') as any
    if (runningArea?._cueTimer) clearInterval(runningArea._cueTimer)
    playBell('end')

    const duration = state.elapsed
    const mode = state.mode
    recordSession()
    currentSessionId = await saveSession(duration, mode).catch(() => undefined)

    const closingEl = container.querySelector('#closing-text') as HTMLElement
    const closingArea = container.querySelector('#closing-area')!
    container.querySelector('#running-area')!.classList.add('hidden')
    closingArea.classList.remove('hidden')

    // ボタンのリスナーをAPIより先に付ける
    container.querySelector('#journal-btn')!.addEventListener('click', () => {
      disableWatch()
      onDone(currentSessionId)
    })
    container.querySelector('#skip-btn')!.addEventListener('click', () => {
      disableWatch()
      onDone(undefined)
    })
    container.querySelector('#closing-history-link')!.addEventListener('click', () => {
      disableWatch()
      onHistory()
    })

    const closingText = await closeSession(mode, duration).catch(() => 'ありがとうございました。')
    closingEl.textContent = toDisplayText(closingText, 'ありがとうございました。')
    await speakText(closingText, 'closing')
  }
}
