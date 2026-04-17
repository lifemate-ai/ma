import './ui.css'
import { mountSession } from './session'
import { mountJournal } from './journal'
import { mountHistory } from './history'
import { ensureAuth, isAuthConfigured, isAuthEnabled } from './auth'
import { getUserGoals, getUserPreferences, UserGoals, UserPreferences } from './api'
import { mountOnboarding } from './onboarding'
import { cleanupDevServiceWorkers } from './dev-sw-cleanup'

type View = 'session' | 'journal' | 'history' | 'onboarding'

const app = document.getElementById('app')!
let cachedPreferences: UserPreferences | null = null
let cachedGoals: UserGoals | null = null

function renderBootIssue(title: string, detail: string) {
  app.innerHTML = `
    <div class="onboarding-screen">
      <div class="simple-practice-card">
        <div class="simple-practice-eyebrow">startup issue</div>
        <div class="simple-practice-title">${title}</div>
        <div class="simple-practice-subtitle">${detail}</div>
      </div>
    </div>
  `
}

function render(view: View, opts?: { sessionId?: string; editing?: boolean }) {
  app.innerHTML = ''
  if (view === 'onboarding') {
    mountOnboarding(app, {
      initialPreferences: cachedPreferences ?? undefined,
      initialGoals: cachedGoals ?? undefined,
      editing: opts?.editing,
      onDone: async () => {
        cachedPreferences = await getUserPreferences().catch(() => cachedPreferences)
        cachedGoals = await getUserGoals().catch(() => cachedGoals)
        render('session')
      },
    })
  } else if (view === 'session') {
    mountSession(app, cachedPreferences ?? undefined, cachedGoals ?? undefined, (sessionId) => {
      render('journal', { sessionId })
    }, () => render('history'))
  } else if (view === 'journal') {
    mountJournal(app, opts?.sessionId, () => {
      render('session')
    })
  } else if (view === 'history') {
    mountHistory(app, () => render('session'), () => render('onboarding', { editing: true }))
  }
}

// アプリ起動: 認証確認してからrender
cleanupDevServiceWorkers().finally(() => ensureAuth().then(async ok => {
  if (!ok) {
    if (isAuthEnabled() && !isAuthConfigured()) {
      renderBootIssue(
        '認証設定が見つかりません',
        'local 開発では repo root の .env から VITE_AUTH_MODE=disabled を読む想定です。dev server を再起動してもう一度開いてください。',
      )
    }
    return
  }
  cachedPreferences = await getUserPreferences().catch(() => null)
  cachedGoals = await getUserGoals().catch(() => null)
  if (!cachedPreferences?.onboarding_completed) {
    render('onboarding')
    return
  }
  render('session')
  // ok=falseはリダイレクト中なので何もしない
}))
