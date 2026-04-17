import {
  defaultUserGoals,
  defaultUserPreferences,
  saveUserGoals,
  saveUserPreferences,
  UserGoals,
  UserPreferences,
} from './api'

interface OnboardingOptions {
  initialPreferences?: UserPreferences
  initialGoals?: UserGoals
  editing?: boolean
  onDone: () => void
}

const CONTEXT_OPTIONS = [
  ['morning', '朝'],
  ['work_break', '仕事の合間'],
  ['bedtime', '寝る前'],
  ['emotional_overwhelm', '感情が荒れた時'],
  ['general_reset', 'なんとなく整えたい'],
] as const

const PRIMARY_GOALS = [
  ['stress', 'stress relief'],
  ['grounding', 'grounding'],
  ['focus', 'focus'],
  ['kindness', 'self-kindness'],
  ['sleep', 'sleep wind-down'],
  ['regulation', 'emotional regulation'],
] as const

const DURATION_OPTIONS = [2, 3, 5, 10, 15] as const
const POSTURE_OPTIONS = [
  ['sitting', '座る'],
  ['standing', '立つ'],
  ['walking', '歩く'],
  ['lying', '横になる'],
] as const
const VOICE_OPTIONS = [
  ['low', '少なめ'],
  ['medium', 'ふつう'],
  ['high', '多め'],
] as const
const EYES_OPTIONS = [
  ['any', 'どちらでも'],
  ['open', '目を開けたい'],
  ['closed', '目を閉じたい'],
] as const

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value)
    ? values.filter(item => item !== value)
    : [...values, value]
}

function goalIntensity(primaryGoal: string | null | undefined, key: keyof UserGoals): number {
  if (!primaryGoal) return 0
  const mapping: Record<string, keyof UserGoals> = {
    stress: 'stress',
    grounding: 'general_presence',
    focus: 'focus',
    kindness: 'kindness',
    sleep: 'sleep',
    regulation: 'emotional_regulation',
  }
  return mapping[primaryGoal] === key ? 3 : 0
}

export function mountOnboarding(container: HTMLElement, options: OnboardingOptions) {
  const preferences: UserPreferences = {
    ...defaultUserPreferences(),
    ...options.initialPreferences,
  }
  const goals: UserGoals = {
    ...defaultUserGoals(),
    ...options.initialGoals,
  }
  const title = options.editing ? '整え方を見直す' : 'はじめに'

  container.innerHTML = `
    <div class="onboarding-screen">
      <div class="onboarding-card">
        <div class="onboarding-layout">
          <div class="onboarding-aside">
            <div class="session-kicker">personal calm profile</div>
            <div class="onboarding-title">${title}</div>
            <div class="onboarding-subtitle">無理なく戻りやすい形を、先に軽く決めます。ここで決めたことは、あとから何度でも見直せます。</div>
          </div>

          <div class="onboarding-form">
            <div class="onboarding-section">
              <div class="section-label">使いたい場面</div>
              <div class="chip-grid" id="context-options"></div>
            </div>

            <div class="onboarding-section">
              <div class="section-label">いちばん近い目的</div>
              <div class="chip-grid" id="goal-options"></div>
            </div>

            <div class="onboarding-section">
              <div class="section-label">ふだん取りやすい時間</div>
              <div class="chip-grid" id="duration-options"></div>
            </div>

            <div class="onboarding-section">
              <div class="section-label">姿勢の好み</div>
              <div class="chip-grid" id="posture-options"></div>
            </div>

            <div class="onboarding-section split">
              <div>
                <div class="section-label">音声の頻度</div>
                <div class="chip-grid" id="voice-options"></div>
              </div>
              <div>
                <div class="section-label">目の開け方</div>
                <div class="chip-grid" id="eyes-options"></div>
              </div>
            </div>

            <label class="watch-option">
              <input type="checkbox" id="watch-opt-in" ${preferences.watch_opt_in ? 'checked' : ''} />
              <span>見守り camera を使う</span>
            </label>
            <div class="watch-note">初期値は OFF です。session 中だけ使い、見える事実だけを扱います。内面は断定しません。</div>
            <div class="safety-note">強い不安や過覚醒がある日は、深掘りより grounding を優先します。つらくなったらいつでも止めて大丈夫です。</div>

            <div class="onboarding-actions">
              <button class="secondary-btn" id="onboarding-skip-btn">${options.editing ? '戻る' : 'あとで'}</button>
              <button class="primary-btn" id="onboarding-save-btn">保存する</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `

  const contextOptionsEl = container.querySelector('#context-options') as HTMLElement
  const goalOptionsEl = container.querySelector('#goal-options') as HTMLElement
  const durationOptionsEl = container.querySelector('#duration-options') as HTMLElement
  const postureOptionsEl = container.querySelector('#posture-options') as HTMLElement
  const voiceOptionsEl = container.querySelector('#voice-options') as HTMLElement
  const eyesOptionsEl = container.querySelector('#eyes-options') as HTMLElement

  function renderChips(
    root: HTMLElement,
    items: readonly (readonly [string, string])[],
    selectedValues: string[],
    onToggle: (value: string) => void,
    single = false,
  ) {
    root.innerHTML = items.map(([value, label]) => `
      <button class="chip-btn ${selectedValues.includes(value) ? 'selected' : ''}" data-value="${value}">
        ${label}
      </button>
    `).join('')
    root.querySelectorAll('.chip-btn').forEach(btn => {
      btn.addEventListener('click', event => {
        event.preventDefault()
        const value = (btn as HTMLElement).dataset.value!
        onToggle(value)
        if (single) {
          root.querySelectorAll('.chip-btn').forEach(item => item.classList.remove('selected'))
          btn.classList.add('selected')
        } else {
          btn.classList.toggle('selected')
        }
      })
    })
  }

  function renderDurationChips() {
    durationOptionsEl.innerHTML = DURATION_OPTIONS.map(value => `
      <button class="chip-btn ${preferences.preferred_durations.includes(value) ? 'selected' : ''}" data-value="${value}">
        ${value}分
      </button>
    `).join('')
    durationOptionsEl.querySelectorAll('.chip-btn').forEach(btn => {
      btn.addEventListener('click', event => {
        event.preventDefault()
        const value = Number((btn as HTMLElement).dataset.value)
        preferences.preferred_durations = preferences.preferred_durations.includes(value)
          ? preferences.preferred_durations.filter(item => item !== value)
          : [...preferences.preferred_durations, value].sort((a, b) => a - b)
        btn.classList.toggle('selected')
      })
    })
  }

  renderChips(contextOptionsEl, CONTEXT_OPTIONS, preferences.use_contexts, value => {
    preferences.use_contexts = toggleValue(preferences.use_contexts, value)
  })
  renderChips(goalOptionsEl, PRIMARY_GOALS, preferences.primary_goal ? [preferences.primary_goal] : [], value => {
    preferences.primary_goal = value
    goals.stress = goalIntensity(value, 'stress')
    goals.focus = goalIntensity(value, 'focus')
    goals.sleep = goalIntensity(value, 'sleep')
    goals.kindness = goalIntensity(value, 'kindness')
    goals.emotional_regulation = goalIntensity(value, 'emotional_regulation')
    goals.general_presence = goalIntensity(value, 'general_presence')
  }, true)
  renderDurationChips()
  renderChips(postureOptionsEl, POSTURE_OPTIONS, preferences.posture_preferences, value => {
    preferences.posture_preferences = toggleValue(preferences.posture_preferences, value)
  })
  renderChips(voiceOptionsEl, VOICE_OPTIONS, [preferences.preferred_voice_density], value => {
    preferences.preferred_voice_density = value as UserPreferences['preferred_voice_density']
  }, true)
  renderChips(eyesOptionsEl, EYES_OPTIONS, [preferences.eyes_open_preference], value => {
    preferences.eyes_open_preference = value as UserPreferences['eyes_open_preference']
  }, true)

  container.querySelector('#onboarding-skip-btn')!.addEventListener('click', () => {
    options.onDone()
  })

  container.querySelector('#onboarding-save-btn')!.addEventListener('click', async () => {
    preferences.watch_opt_in = (container.querySelector('#watch-opt-in') as HTMLInputElement).checked
    preferences.onboarding_completed = true
    if (preferences.preferred_durations.length === 0) {
      preferences.preferred_durations = [2, 3, 5]
    }
    await Promise.all([
      saveUserPreferences(preferences),
      saveUserGoals(goals),
    ]).catch(() => {})
    options.onDone()
  })
}
