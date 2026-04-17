import { playBell, resumeAudio, stopCurrentAudio } from './audio';
import { closeSession, createSessionId, defaultUserGoals, defaultUserPreferences, getRecommendations, greet, logRecommendationAcceptance, saveJournal, saveObservation, saveSession, saveSessionEvent, } from './api';
import { getStats, recordSession, daysSinceLast } from './store';
import { mountEmotionMapping } from './modes/emotion-mapping';
import { mountGratitude } from './modes/gratitude';
import { mountCheckin } from './modes/checkin';
import { buildGroundingReturnCue, buildOpenEyesCue, buildSessionPlan, buildShorterCloseCue, extendSessionPlan, isInteractiveLegacyMode, isTimedSessionMode, nextCueIndex as findNextCueIndex, } from './session-engine';
import { speakText, toDisplayText } from './voice-guidance';
const WATCH_INITIAL_DELAY_MS = 8000;
const WATCH_INTERVAL_MS = 45000;
const SHORT_CLOSE_SECONDS = 45;
const GROUNDING_CLOSE_SECONDS = 60;
export function mountSession(container, preferences, goals, onDone, onHistory) {
    const userPreferences = preferences ?? defaultUserPreferences();
    const userGoals = goals ?? defaultUserGoals();
    let state = null;
    let timer = null;
    let currentSessionId;
    let greetCancelled = false;
    let sessionEnded = false;
    let cueInProgress = false;
    let watchStream = null;
    let watchEnabled = false;
    let watchBusy = false;
    let watchStartTimer = null;
    let watchInterval = null;
    let selectedDurationMinutes = userPreferences.preferred_durations[0] ?? 2;
    const durationOptions = [2, 3, 5, 10, 15];
    container.innerHTML = `
    <div class="session-screen">
      <aside class="session-intro" id="session-intro">
        <div class="session-brandbar">
          <div>
            <div class="session-brand">komorebi</div>
            <div class="session-brand-note">calm-first mindful companion</div>
          </div>
          <div id="home-history">
            <button class="history-btn" id="history-btn">記録を見る</button>
          </div>
        </div>

        <div class="session-hero">
          <div class="session-kicker">re-entry, softly</div>
          <div class="session-title">いま戻りやすいところから。</div>
          <div class="greeting-area" id="greeting-text"></div>
          <div class="session-note">途中で止めても、切り上げても、失敗にはなりません。短い入口でも十分です。</div>
        </div>

        <div class="watch-panel" id="watch-panel">
          <div class="watch-head">見守り</div>
          <div class="watch-status" id="watch-status">自分の顔を見ながら座れます。camera は session 中だけ使い、見える事実だけを受け取ります。初期値は OFF です。</div>
          <video class="watch-preview hidden" id="watch-preview" autoplay muted playsinline></video>
          <button class="watch-btn" id="watch-btn">preview と見守りをオンにする</button>
        </div>
      </aside>

      <main class="session-main" id="session-main">
        <section class="recommendation-panel hidden" id="recommendation-panel">
          <div class="recommendation-head">今の自分に合う3つ</div>
          <div class="recommendation-list" id="recommendation-list"></div>
        </section>

        <section class="mode-section">
          <div class="mode-section-head">
            <div>
              <div class="section-label">practice library</div>
              <div class="mode-section-title">今の自分に合う入り口</div>
            </div>
            <div class="mode-note">長さを先に選ぶと、そのあとの問いがそっと短くなります。</div>
          </div>

          <div class="duration-picker">
            <div class="section-label">今日はこの長さ</div>
            <div class="duration-choices" id="duration-choices">
              ${durationOptions.map(value => `
                <button class="duration-chip ${value === selectedDurationMinutes ? 'selected' : ''}" data-duration="${value}">
                  ${value}分
                </button>
              `).join('')}
            </div>
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
        </section>
      </main>

      <div class="running-area hidden" id="running-area">
        <div class="timer-display" id="timer-display">2:00</div>
        <div class="breath-circle-wrap hidden" id="breath-circle-wrap">
          <div class="breath-circle"></div>
          <div class="breath-cue" id="breath-cue"></div>
        </div>
        <div class="mode-hint" id="mode-hint"></div>
        <div class="running-guide" id="running-guide"></div>
        <div class="safety-actions">
          <button class="secondary-btn" id="grounding-btn">足元へ戻る</button>
          <button class="secondary-btn" id="open-eyes-btn">目を開ける</button>
          <button class="secondary-btn" id="shorter-close-btn">短く切り上げる</button>
          <button class="stop-btn" id="stop-btn">やめる</button>
        </div>
      </div>
      <div class="sheet-area hidden" id="precheck-area">
        <div class="sheet-card">
          <div class="sheet-title" id="precheck-title">いまの感じ</div>
          <div class="sheet-subtitle">短くても、空のままでも大丈夫です。書くほどのことがあれば、数語で。</div>
          <label class="sheet-field">
            <span>いま</span>
            <textarea id="precheck-note" rows="4" placeholder="疲れてる / ざわついてる / なんとなく、など。"></textarea>
          </label>
          <div class="sheet-actions">
            <button class="secondary-btn" id="precheck-cancel-btn">戻る</button>
            <button class="extend-btn" id="precheck-start-btn">始める</button>
          </div>
        </div>
      </div>
      <div class="extending-area hidden" id="extending-area">
        <div class="extending-text">続けますか？</div>
        <button class="extend-btn" id="extend-btn">もう少し</button>
        <button class="end-btn" id="end-btn">おわる</button>
      </div>
      <div class="sheet-area hidden" id="postcheck-area">
        <div class="sheet-card">
          <div class="sheet-title">いまの感想</div>
          <div class="sheet-subtitle">空のままでも大丈夫です。一言でも、続けるほど、次をやさしく合わせやすくなります。</div>
          <label class="sheet-field">
            <span>いま</span>
            <textarea id="postcheck-note" rows="4" placeholder="少し落ち着いた / まだざわつく / 眠い、くらいで十分です。"></textarea>
          </label>
          <div class="sheet-actions">
            <button class="secondary-btn" id="postcheck-skip-btn">とばす</button>
            <button class="extend-btn" id="postcheck-save-btn">続ける</button>
          </div>
        </div>
      </div>
      <div class="closing-area hidden" id="closing-area">
        <div class="closing-text" id="closing-text"></div>
        <button class="journal-btn" id="journal-btn">振り返る</button>
        <button class="skip-btn" id="skip-btn">そのまま終わる</button>
        <button class="history-link" id="closing-history-link">記録を見る</button>
      </div>
    </div>
  `;
    const sessionIntroEl = container.querySelector('#session-intro');
    const sessionMainEl = container.querySelector('#session-main');
    const modeSelectEl = container.querySelector('#mode-select');
    const recommendationPanelEl = container.querySelector('#recommendation-panel');
    const recommendationListEl = container.querySelector('#recommendation-list');
    const durationChoicesEl = container.querySelector('#duration-choices');
    const homeHistoryEl = container.querySelector('#home-history');
    const watchStatusEl = container.querySelector('#watch-status');
    const watchPreviewEl = container.querySelector('#watch-preview');
    const watchBtnEl = container.querySelector('#watch-btn');
    const runningAreaEl = container.querySelector('#running-area');
    const precheckAreaEl = container.querySelector('#precheck-area');
    const precheckTitleEl = container.querySelector('#precheck-title');
    const extendingAreaEl = container.querySelector('#extending-area');
    const postcheckAreaEl = container.querySelector('#postcheck-area');
    const closingAreaEl = container.querySelector('#closing-area');
    const timerEl = container.querySelector('#timer-display');
    const guideEl = container.querySelector('#running-guide');
    const hintEl = container.querySelector('#mode-hint');
    const breathCircleWrapEl = container.querySelector('#breath-circle-wrap');
    const breathCueEl = container.querySelector('#breath-cue');
    const precheckNoteEl = container.querySelector('#precheck-note');
    const postcheckNoteEl = container.querySelector('#postcheck-note');
    const watchInactiveText = '自分の顔を見ながら座れます。camera は session 中だけ使い、見える事実だけを受け取ります。内面は断定しません。';
    const watchEnabledText = 'preview を開いています。自分の顔を見ながら座れます。見守りは session 中だけで、見える事実だけを静かに受け取ります。';
    let recommendationDecisionRecorded = false;
    watchStatusEl.textContent = userPreferences.watch_opt_in
        ? `${watchInactiveText} この端末では使ってよい設定ですが、毎回 OFF のままでも大丈夫です。`
        : watchInactiveText;
    durationChoicesEl.querySelectorAll('.duration-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedDurationMinutes = Number(btn.dataset.duration ?? selectedDurationMinutes);
            durationChoicesEl.querySelectorAll('.duration-chip').forEach(chip => {
                chip.classList.toggle('selected', chip === btn);
            });
        });
    });
    container.querySelector('#history-btn').addEventListener('click', () => {
        greetCancelled = true;
        stopCurrentAudio();
        disableWatch();
        onHistory();
    });
    watchBtnEl.addEventListener('click', async () => {
        if (watchEnabled) {
            disableWatch();
            return;
        }
        await enableWatch();
    });
    container.querySelector('#stop-btn').addEventListener('click', () => {
        if (!state || sessionEnded)
            return;
        sessionEnded = true;
        void endSession('aborted', { reason: 'user_stop' });
    });
    container.querySelector('#shorter-close-btn').addEventListener('click', async () => {
        if (!state || sessionEnded || state.phase !== 'running')
            return;
        state.plan.totalDurationSeconds = Math.min(state.plan.totalDurationSeconds, Math.max(state.elapsed + SHORT_CLOSE_SECONDS, state.elapsed + 10));
        await playOverlayCue(buildShorterCloseCue(state.plan));
        void recordEvent('shortened', { target_duration_seconds: state.plan.totalDurationSeconds });
        updateTimerDisplay();
    });
    container.querySelector('#grounding-btn').addEventListener('click', async () => {
        if (!state || sessionEnded || state.phase !== 'running')
            return;
        state.plan.totalDurationSeconds = Math.min(state.plan.totalDurationSeconds, Math.max(state.elapsed + GROUNDING_CLOSE_SECONDS, state.elapsed + 10));
        await playOverlayCue(buildGroundingReturnCue(state.plan));
        void recordEvent('grounding_invoked', { target_duration_seconds: state.plan.totalDurationSeconds });
        updateTimerDisplay();
    });
    container.querySelector('#open-eyes-btn').addEventListener('click', async () => {
        if (!state || sessionEnded || state.phase !== 'running')
            return;
        await playOverlayCue(buildOpenEyesCue(state.plan));
        void recordEvent('open_eyes', {});
    });
    let recommendations = [];
    getRecommendations({
        available_minutes: userPreferences.preferred_durations[0],
        context: userPreferences.use_contexts[0],
        stress: userGoals.stress > 0 ? 3 : undefined,
        sleepiness: userGoals.sleep > 0 ? 3 : undefined,
    }).then(items => {
        recommendations = items;
        if (recommendations.length === 0)
            return;
        recommendationPanelEl.classList.remove('hidden');
        recommendationListEl.innerHTML = recommendations.map((rec, idx) => `
      <button class="recommendation-card" data-rec-index="${idx}">
        <div class="recommendation-title">${rec.title}</div>
        <div class="recommendation-rationale">${rec.rationale}</div>
        <div class="recommendation-meta">${rec.duration_minutes}分 · 合いそう ${Math.round(rec.confidence * 100)}%</div>
      </button>
    `).join('');
        recommendations.forEach(rec => {
            const btn = container.querySelector(`[data-mode="${rec.launch_mode}"]`);
            btn?.classList.add('suggested');
        });
        recommendationListEl.querySelectorAll('.recommendation-card').forEach(btn => {
            btn.addEventListener('click', () => {
                resumeAudio();
                greetCancelled = true;
                stopCurrentAudio();
                const idx = Number(btn.dataset.recIndex);
                const recommendation = recommendations[idx];
                if (!recommendation)
                    return;
                startSession(recommendation.launch_mode, {
                    durationMinutes: recommendation.duration_minutes,
                    recommendation,
                });
            });
        });
    }).catch(() => { });
    const greetingEl = container.querySelector('#greeting-text');
    const stats = getStats();
    greet({ sessions_total: stats.sessionsTotal, days_since_last: daysSinceLast() })
        .then(async (text) => {
        greetingEl.textContent = toDisplayText(text, '静かに、始めましょう。');
        await speakText(text, 'greeting', { isCancelled: () => greetCancelled });
    })
        .catch(() => { greetingEl.textContent = '静かに、始めましょう。'; });
    container.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            resumeAudio();
            greetCancelled = true;
            stopCurrentAudio();
            const mode = btn.dataset.mode;
            startSession(mode, { durationMinutes: selectedDurationMinutes });
        });
    });
    async function startSession(mode, options = {}) {
        if (isInteractiveLegacyMode(mode)) {
            disableWatch();
            container.innerHTML = '';
            if (mode === 'emotion_mapping')
                mountEmotionMapping(container, onDone);
            if (mode === 'gratitude')
                mountGratitude(container, onDone);
            if (mode === 'checkin')
                mountCheckin(container, onDone);
            return;
        }
        if (!isTimedSessionMode(mode))
            return;
        if (!options.prechecked) {
            openPrecheck(mode, options);
            return;
        }
        const plan = buildSessionPlan(mode, options.durationMinutes);
        const sessionId = options.sessionId ?? createSessionId();
        state = {
            sessionId,
            mode,
            startedAt: Date.now(),
            elapsed: 0,
            phase: 'running',
            plan,
            nextCueIndex: findNextCueIndex(plan, 0),
        };
        currentSessionId = sessionId;
        sessionEnded = false;
        cueInProgress = false;
        recommendationPanelEl.classList.add('hidden');
        modeSelectEl.classList.add('hidden');
        durationChoicesEl.closest('.duration-picker')?.classList.add('hidden');
        sessionIntroEl.classList.add('hidden');
        sessionMainEl.classList.add('hidden');
        homeHistoryEl.classList.add('hidden');
        runningAreaEl.classList.remove('hidden');
        extendingAreaEl.classList.add('hidden');
        closingAreaEl.classList.add('hidden');
        configureRunningArea(plan);
        updateTimerDisplay();
        startWatchLoop();
        if (options.recommendation) {
            void logRecommendationAcceptance({
                recommended_protocol: options.recommendation.protocol_id,
                rationale: options.recommendation.rationale,
                accepted_bool: true,
                confidence: options.recommendation.confidence,
                session_id: sessionId,
                input_snapshot: {
                    launch_mode: options.recommendation.launch_mode,
                    duration_minutes: options.recommendation.duration_minutes,
                },
            });
            recommendationDecisionRecorded = true;
        }
        else if (recommendations.length > 0 && !recommendationDecisionRecorded) {
            recommendationDecisionRecorded = true;
            recommendations.forEach(recommendation => {
                void logRecommendationAcceptance({
                    recommended_protocol: recommendation.protocol_id,
                    rationale: recommendation.rationale,
                    accepted_bool: false,
                    confidence: recommendation.confidence,
                    input_snapshot: {
                        launch_mode: recommendation.launch_mode,
                        duration_minutes: recommendation.duration_minutes,
                        started_mode: mode,
                    },
                });
            });
        }
        await playDueCues(0);
        state.startedAt = Date.now();
        timer = window.setInterval(() => {
            void tickSession();
        }, 1000);
    }
    function refreshButton(selector) {
        const current = container.querySelector(selector);
        const next = current.cloneNode(true);
        current.replaceWith(next);
        return next;
    }
    function resetPostcheckForm() {
        postcheckNoteEl.value = '';
    }
    function openPrecheck(mode, options) {
        const availableMinutes = options.durationMinutes ?? selectedDurationMinutes;
        precheckTitleEl.textContent = `${availableMinutes}分のまえに、いまの感じ`;
        precheckNoteEl.value = '';
        precheckAreaEl.classList.remove('hidden');
        window.setTimeout(() => precheckNoteEl.focus(), 0);
        const cancelBtn = refreshButton('#precheck-cancel-btn');
        const startBtn = refreshButton('#precheck-start-btn');
        const closeSheet = () => {
            precheckAreaEl.classList.add('hidden');
        };
        cancelBtn.addEventListener('click', () => closeSheet(), { once: true });
        startBtn.addEventListener('click', async () => {
            const sessionId = createSessionId();
            const note = precheckNoteEl.value.trim();
            if (note) {
                await saveJournal({
                    session_id: sessionId,
                    user_text: `[before] ${note}`,
                }).catch(() => { });
            }
            closeSheet();
            await startSession(mode, {
                ...options,
                prechecked: true,
                sessionId,
                durationMinutes: availableMinutes,
            });
        }, { once: true });
    }
    function configureRunningArea(plan) {
        hintEl.textContent = plan.hintText;
        guideEl.className = plan.visualStyle === 'body' ? 'body-scan-guide' : 'running-guide';
        if (plan.visualStyle === 'breath' && plan.breathCueDisplays) {
            breathCircleWrapEl.classList.remove('hidden');
            setupBreathCue(plan);
        }
        else {
            clearBreathCueTimer();
            breathCircleWrapEl.classList.add('hidden');
        }
    }
    async function tickSession() {
        if (!state || sessionEnded)
            return;
        state.elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
        updateTimerDisplay();
        await playDueCues(state.elapsed);
        if (state.elapsed >= state.plan.totalDurationSeconds && !sessionEnded) {
            await showExtendPrompt();
        }
    }
    async function playDueCues(elapsedSeconds) {
        if (!state || cueInProgress)
            return;
        while (state &&
            state.nextCueIndex >= 0 &&
            state.nextCueIndex < state.plan.cueSchedule.length &&
            elapsedSeconds >= state.plan.cueSchedule[state.nextCueIndex].atSeconds &&
            !sessionEnded) {
            const cue = state.plan.cueSchedule[state.nextCueIndex];
            cueInProgress = true;
            await playCue(cue);
            if (!state)
                return;
            state.nextCueIndex += 1;
            cueInProgress = false;
        }
    }
    async function playCue(cue) {
        guideEl.textContent = cue.displayText;
        if (cue.type === 'close' || cue.type === 'transition') {
            playBell('mid');
        }
        await speakText(cue.ttsText, 'guide', { isCancelled: () => sessionEnded || state?.phase !== 'running' });
        void recordEvent('cue_played', {
            cue_id: cue.id,
            cue_type: cue.type,
            protocol_id: state?.plan.protocolId,
        });
    }
    async function playOverlayCue(cue) {
        stopCurrentAudio();
        guideEl.textContent = cue.displayText;
        await speakText(cue.ttsText, 'guide', { isCancelled: () => sessionEnded || state?.phase !== 'running' });
    }
    async function showExtendPrompt() {
        if (!state || sessionEnded)
            return;
        state.phase = 'extending';
        clearSessionTimers();
        playBell('mid');
        runningAreaEl.classList.add('hidden');
        extendingAreaEl.classList.remove('hidden');
        speakText('もう少し続けますか。[pause] ここで終えても大丈夫です。', 'transition', {
            isCancelled: () => sessionEnded,
        }).catch(() => { });
        let autoEndTimer = window.setTimeout(() => {
            doEnd();
        }, 10000);
        const extendBtn = extendingAreaEl.querySelector('#extend-btn');
        const endBtn = extendingAreaEl.querySelector('#end-btn');
        function doExtend() {
            if (!state)
                return;
            clearTimeout(autoEndTimer);
            const previousDuration = state.plan.totalDurationSeconds;
            state.plan = extendSessionPlan(state.plan, state.elapsed);
            state.nextCueIndex = findNextCueIndex(state.plan, state.elapsed);
            void recordEvent('extended', {
                from_duration_seconds: previousDuration,
                to_duration_seconds: state.plan.totalDurationSeconds,
            });
            configureRunningArea(state.plan);
            extendingAreaEl.classList.add('hidden');
            runningAreaEl.classList.remove('hidden');
            state.phase = 'running';
            state.startedAt = Date.now() - state.elapsed * 1000;
            updateTimerDisplay();
            timer = window.setInterval(() => {
                void tickSession();
            }, 1000);
        }
        function doEnd() {
            clearTimeout(autoEndTimer);
            extendBtn.removeEventListener('click', doExtend);
            endBtn.removeEventListener('click', doEnd);
            sessionEnded = true;
            stopWatchLoop();
            extendingAreaEl.classList.add('hidden');
            void endSession();
        }
        extendBtn.addEventListener('click', doExtend, { once: true });
        endBtn.addEventListener('click', doEnd, { once: true });
    }
    function updateTimerDisplay() {
        const target = state?.plan.totalDurationSeconds ?? 120;
        const elapsed = state?.elapsed ?? 0;
        const remaining = Math.max(0, target - elapsed);
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        timerEl.textContent = `${m}:${String(s).padStart(2, '0')}`;
    }
    function updateWatchStatus(text) {
        watchStatusEl.textContent = text;
    }
    async function enableWatch() {
        if (watchEnabled)
            return;
        if (!navigator.mediaDevices?.getUserMedia) {
            updateWatchStatus('この環境では camera を使えません。');
            return;
        }
        try {
            watchStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'user',
                    width: { ideal: 320 },
                    height: { ideal: 240 },
                },
                audio: false,
            });
            watchPreviewEl.srcObject = watchStream;
            watchPreviewEl.classList.remove('hidden');
            await watchPreviewEl.play().catch(() => { });
            watchEnabled = true;
            watchBtnEl.textContent = 'preview と見守りを止める';
            updateWatchStatus(watchEnabledText);
            if (state?.phase === 'running')
                startWatchLoop();
        }
        catch {
            updateWatchStatus('camera の許可が取れませんでした。');
        }
    }
    function disableWatch() {
        stopWatchLoop();
        watchEnabled = false;
        watchBusy = false;
        watchBtnEl.textContent = 'preview と見守りをオンにする';
        if (watchStream) {
            watchStream.getTracks().forEach(track => track.stop());
            watchStream = null;
        }
        watchPreviewEl.pause();
        watchPreviewEl.srcObject = null;
        watchPreviewEl.classList.add('hidden');
        updateWatchStatus(userPreferences.watch_opt_in
            ? `${watchInactiveText} この端末では使ってよい設定ですが、毎回 OFF のままでも大丈夫です。`
            : watchInactiveText);
    }
    function stopWatchLoop() {
        if (watchStartTimer) {
            clearTimeout(watchStartTimer);
            watchStartTimer = null;
        }
        if (watchInterval) {
            clearInterval(watchInterval);
            watchInterval = null;
        }
    }
    function startWatchLoop() {
        if (!watchEnabled || !watchStream || state?.phase !== 'running')
            return;
        stopWatchLoop();
        watchStartTimer = window.setTimeout(() => {
            void captureObservation();
            watchInterval = window.setInterval(() => {
                void captureObservation();
            }, WATCH_INTERVAL_MS);
        }, WATCH_INITIAL_DELAY_MS);
    }
    async function captureObservation() {
        if (!watchEnabled || !watchStream || watchBusy || sessionEnded || state?.phase !== 'running')
            return;
        const imageDataUrl = captureFrame(watchPreviewEl);
        if (!imageDataUrl)
            return;
        watchBusy = true;
        try {
            const observationId = await saveObservation({
                source: 'browser_camera',
                image_data_url: imageDataUrl,
            });
            if (observationId) {
                updateWatchStatus('preview を開いたまま、いまの様子を静かに受け取りました。');
                void recordEvent('watch_observation_received', { observation_id: observationId });
            }
        }
        catch {
            updateWatchStatus('見守りの送信に失敗しました。');
        }
        finally {
            watchBusy = false;
        }
    }
    function captureFrame(video) {
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (!width || !height)
            return null;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return null;
        ctx.drawImage(video, 0, 0, width, height);
        return canvas.toDataURL('image/jpeg', 0.72);
    }
    function setupBreathCue(plan) {
        clearBreathCueTimer();
        const displays = plan.breathCueDisplays;
        if (!displays)
            return;
        let index = 0;
        breathCueEl.textContent = displays[0];
        const intervalMs = (plan.breathCueIntervalSeconds ?? 4) * 1000;
        const timerId = window.setInterval(() => {
            if (sessionEnded || state?.phase !== 'running')
                return;
            index = (index + 1) % displays.length;
            breathCueEl.style.opacity = '0';
            window.setTimeout(() => {
                breathCueEl.textContent = displays[index];
                breathCueEl.style.opacity = '1';
            }, 220);
        }, intervalMs);
        runningAreaEl._cueTimer = timerId;
    }
    function clearBreathCueTimer() {
        const timerId = runningAreaEl._cueTimer;
        if (timerId) {
            clearInterval(timerId);
            delete runningAreaEl._cueTimer;
        }
    }
    function clearSessionTimers() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
        clearBreathCueTimer();
    }
    async function endSession(eventType = 'completed', payload = {}) {
        if (!state)
            return;
        state.phase = 'closing';
        stopCurrentAudio();
        disableWatch();
        clearSessionTimers();
        playBell('end');
        const duration = state.elapsed;
        const mode = state.mode;
        const sessionId = state.sessionId;
        void recordEvent(eventType, {
            duration_seconds: duration,
            protocol_id: state.plan.protocolId,
            ...payload,
        });
        recordSession();
        currentSessionId = await saveSession(duration, mode, sessionId).catch(() => sessionId);
        runningAreaEl.classList.add('hidden');
        await showPostcheck(sessionId, duration);
    }
    async function recordEvent(eventType, payload) {
        if (!state)
            return;
        await saveSessionEvent({
            session_id: state.sessionId,
            event_type: eventType,
            event_time_offset_ms: state.elapsed * 1000,
            payload,
        }).catch(() => undefined);
    }
    async function showPostcheck(sessionId, duration) {
        resetPostcheckForm();
        postcheckAreaEl.classList.remove('hidden');
        const saveBtn = refreshButton('#postcheck-save-btn');
        const skipBtn = refreshButton('#postcheck-skip-btn');
        const finish = async () => {
            postcheckAreaEl.classList.add('hidden');
            await continueClosing(sessionId, duration);
        };
        saveBtn.addEventListener('click', async () => {
            const note = postcheckNoteEl.value.trim();
            if (note) {
                await saveJournal({
                    session_id: sessionId,
                    user_text: `[after] ${note}`,
                }).catch(() => { });
            }
            await finish();
        }, { once: true });
        skipBtn.addEventListener('click', () => {
            void finish();
        }, { once: true });
    }
    async function continueClosing(sessionId, duration) {
        const closingEl = container.querySelector('#closing-text');
        closingAreaEl.classList.remove('hidden');
        const journalBtn = refreshButton('#journal-btn');
        const skipBtn = refreshButton('#skip-btn');
        const historyBtn = refreshButton('#closing-history-link');
        journalBtn.addEventListener('click', () => {
            disableWatch();
            onDone(sessionId);
        }, { once: true });
        skipBtn.addEventListener('click', () => {
            disableWatch();
            onDone(undefined);
        }, { once: true });
        historyBtn.addEventListener('click', () => {
            disableWatch();
            onHistory();
        }, { once: true });
        const closeMode = state?.plan.closeMode ?? 'yasashii';
        const closingText = await closeSession(closeMode, duration).catch(() => 'ありがとうございました。');
        closingEl.textContent = toDisplayText(closingText, 'ありがとうございました。');
        await speakText(closingText, 'closing');
    }
}
