import { clearUserData, getUnifiedHistory, TimelineEntry } from './api'
import { formatRelativeDate, formatJapaneseDate, formatDuration, groupByDate } from './date-utils'
import { mountInsights } from './insights'
import { clearLocalStats } from './store'

const MODE_LABELS: Record<string, string> = {
  yasashii: 'やさしい呼吸',
  motto_yasashii: 'ただ座る',
  body_scan: 'ボディスキャン',
  sbnrr: 'SBNRR',
  breathing_space: 'Breathing Space',
  self_compassion_break: 'Self-Compassion Break',
  stress_reset: 'Stress Reset',
  sleep_winddown: 'Sleep Winddown',
  emotion_mapping: '感情マッピング',
  gratitude: '感謝',
  compassion: '慈悲の瞑想',
  checkin: 'チェックイン',
}

function modeLabel(mode: string): string {
  return MODE_LABELS[mode] ?? mode
}

function renderSessionEntry(entry: TimelineEntry): string {
  const data = entry.data as {
    mode: string
    duration_seconds: number
    journal?: { user_text: string; companion_loop?: string; mood_inferred?: string } | null
  }
  const time = formatJapaneseDate(entry.timestamp).split('）')[1] ?? ''
  const duration = formatDuration(data.duration_seconds)
  const mood = data.journal?.mood_inferred
  const borderColor = mood ? moodToColor(mood) : '#3a3830'

  const journalHtml = data.journal
    ? `<div class="entry-journal">${escapeHtml(truncate(data.journal.user_text, 60))}</div>
       ${data.journal.companion_loop ? `<div class="entry-loop">${escapeHtml(truncate(data.journal.companion_loop, 60))}</div>` : ''}`
    : ''

  return `
    <div class="timeline-entry session-entry" style="border-left-color: ${borderColor}">
      <div class="entry-header">
        <span class="entry-mode">${modeLabel(data.mode)}</span>
        <span class="entry-meta">${time} · ${duration}</span>
      </div>
      ${journalHtml}
    </div>
  `
}

function renderCheckinEntry(entry: TimelineEntry): string {
  const data = entry.data as { emotion: string; body_state: string; intention: string }
  const time = formatJapaneseDate(entry.timestamp).split('）')[1] ?? ''
  return `
    <div class="timeline-entry checkin-entry">
      <div class="entry-header">
        <span class="entry-mode">チェックイン</span>
        <span class="entry-meta">${time}</span>
      </div>
      <div class="entry-checkin">
        <span class="checkin-tag">${escapeHtml(data.emotion)}</span>
        <span class="checkin-body">${escapeHtml(truncate(data.body_state, 30))}</span>
      </div>
    </div>
  `
}

function moodToColor(mood: string): string {
  const m = mood.toLowerCase()
  if (m.includes('穏') || m.includes('calm') || m.includes('peace')) return '#4a6858'
  if (m.includes('喜') || m.includes('happy') || m.includes('joy')) return '#6a5840'
  if (m.includes('悲') || m.includes('sad')) return '#4a4868'
  if (m.includes('不安') || m.includes('anxious')) return '#5a4848'
  return '#3a3830'
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function truncate(s: string, len: number): string {
  return s.length <= len ? s : s.slice(0, len) + '…'
}

export async function mountHistory(
  container: HTMLElement,
  onBack: () => void,
  onEditPreferences: () => void,
) {
  container.innerHTML = `
    <div class="history-screen">
      <div class="history-header">
        <button class="back-btn" id="back-btn">← 戻る</button>
        <span class="history-title">記録</span>
      </div>
      <div class="history-content" id="history-content">
        <div class="loading-text">読み込み中…</div>
      </div>
    </div>
    <style>
      .history-screen { min-height: 100vh; display: flex; flex-direction: column; padding: 0; }
      .history-header { display: flex; align-items: center; gap: 1rem; padding: 1.25rem 1.5rem; border-bottom: 1px solid #2a2820; }
      .back-btn { background: transparent; border: none; color: #7a7468; font-size: 0.85rem; cursor: pointer; padding: 0; font-family: inherit; }
      .back-btn:hover { color: #c8c4bc; }
      .history-title { font-size: 0.9rem; color: #5a5850; letter-spacing: 0.1em; }
      .history-content { flex: 1; overflow-y: auto; padding: 1.5rem; display: flex; flex-direction: column; align-items: center; }
      .history-inner { width: 100%; max-width: 320px; }
      .history-tools { display: grid; grid-template-columns: 1fr; gap: 0.6rem; margin-bottom: 1.5rem; }
      .history-tool-btn { background: transparent; border: 1px solid #3a3830; color: #d3cdc4; border-radius: 8px; padding: 0.75rem 0.9rem; font-size: 0.84rem; text-align: left; cursor: pointer; line-height: 1.6; }
      .history-tool-btn:hover { border-color: #62584a; }
      .history-tool-label { display: block; color: #ece7df; margin-bottom: 0.15rem; }
      .history-tool-note { display: block; color: #8a8478; font-size: 0.76rem; }
      .date-group { margin-bottom: 2rem; }
      .date-header { font-size: 0.75rem; color: #5a5850; letter-spacing: 0.1em; margin-bottom: 0.75rem; padding-bottom: 0.4rem; border-bottom: 1px solid #2a2820; }
      .timeline-entry { border-left: 2px solid #3a3830; padding: 0.75rem 0 0.75rem 1rem; margin-bottom: 0.75rem; }
      .entry-header { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; margin-bottom: 0.3rem; }
      .entry-mode { font-size: 0.85rem; color: #c8c4bc; }
      .entry-meta { font-size: 0.75rem; color: #5a5850; white-space: nowrap; }
      .entry-journal { font-size: 0.8rem; color: #8a8478; line-height: 1.6; margin-top: 0.3rem; }
      .entry-loop { font-size: 0.75rem; color: #6a6458; line-height: 1.5; margin-top: 0.2rem; font-style: italic; }
      .checkin-entry { border-left-color: #4a4860; }
      .entry-checkin { display: flex; gap: 0.5rem; align-items: center; margin-top: 0.2rem; }
      .checkin-tag { font-size: 0.75rem; color: #9a94c0; background: #2a2840; padding: 0.15rem 0.5rem; border-radius: 2px; }
      .checkin-body { font-size: 0.8rem; color: #7a7468; }
      .empty-text { color: #5a5850; font-size: 0.9rem; text-align: center; margin-top: 3rem; }
      .loading-text { color: #5a5850; font-size: 0.85rem; text-align: center; margin-top: 3rem; }
    </style>
  `

  container.querySelector('#back-btn')!.addEventListener('click', onBack)

  const contentEl = container.querySelector('#history-content') as HTMLElement
  const inner = document.createElement('div')
  inner.className = 'history-inner'

  // インサイトを上部に表示（非同期）
  mountInsights(inner)

  const toolsEl = document.createElement('div')
  toolsEl.className = 'history-tools'
  toolsEl.innerHTML = `
    <button class="history-tool-btn" id="edit-preferences-btn">
      <span class="history-tool-label">整え方を見直す</span>
      <span class="history-tool-note">時間、音声の頻度、camera の使い方を変えます。</span>
    </button>
    <button class="history-tool-btn" id="clear-observations-btn">
      <span class="history-tool-label">見守り記録だけ消す</span>
      <span class="history-tool-note">camera から残った observation だけを消します。</span>
    </button>
    <button class="history-tool-btn" id="clear-all-data-btn">
      <span class="history-tool-label">この端末の記録を消す</span>
      <span class="history-tool-note">session / journal / insight のもとになる記録を消します。</span>
    </button>
  `
  inner.appendChild(toolsEl)

  ;(toolsEl.querySelector('#edit-preferences-btn') as HTMLButtonElement).addEventListener('click', onEditPreferences)
  ;(toolsEl.querySelector('#clear-observations-btn') as HTMLButtonElement).addEventListener('click', async () => {
    if (!window.confirm('見守り記録だけを消しますか？')) return
    await clearUserData('observations').catch(() => undefined)
    window.location.reload()
  })
  ;(toolsEl.querySelector('#clear-all-data-btn') as HTMLButtonElement).addEventListener('click', async () => {
    if (!window.confirm('この端末の記録を消しますか？')) return
    await clearUserData('all').catch(() => undefined)
    clearLocalStats()
    window.location.reload()
  })

  const { entries } = await getUnifiedHistory()

  if (entries.length === 0) {
    const emptyEl = document.createElement('div')
    emptyEl.className = 'empty-text'
    emptyEl.textContent = 'まだ記録がありません'
    inner.appendChild(emptyEl)
    contentEl.innerHTML = ''
    contentEl.appendChild(inner)
    return
  }

  const grouped = groupByDate(entries, (e: TimelineEntry) => e.timestamp)

  for (const [dateKey, dayEntries] of grouped) {
    const headerDate = dayEntries[0] ? formatRelativeDate(dayEntries[0].timestamp) : dateKey
    const groupEl = document.createElement('div')
    groupEl.className = 'date-group'
    groupEl.innerHTML = `<div class="date-header">${headerDate}</div>`

    for (const entry of dayEntries) {
      const html = entry.entry_type === 'checkin'
        ? renderCheckinEntry(entry)
        : renderSessionEntry(entry)
      groupEl.innerHTML += html
    }

    inner.appendChild(groupEl)
  }

  contentEl.innerHTML = ''
  contentEl.appendChild(inner)
}
