import { sbnrrStep } from '../api';
import { playBell, stopCurrentAudio } from '../audio';
import { speakText, toDisplayText } from '../voice-guidance';
export const SBNRR_STEPS = [
    { key: 'stop', label: '止まる', duration: 10 },
    { key: 'breathe', label: '呼吸', duration: 30 },
    { key: 'notice', label: '注意', duration: 30 },
    { key: 'reflect', label: '反省', duration: 30 },
    { key: 'respond', label: '反応', duration: 20 },
];
export function mountSbnrr(container, onDone) {
    let cancelled = false;
    let currentTimer = null;
    container.innerHTML = `
    <div class="sbnrr-screen">
      <div class="sbnrr-title">SBNRR</div>
      <div class="sbnrr-subtitle">止まる・呼吸・注意・反省・反応</div>
      <button class="mode-btn" id="sbnrr-start-btn">始める</button>
      <div class="sbnrr-running hidden" id="sbnrr-running">
        <div id="sbnrr-step-label" class="sbnrr-step-label"></div>
        <div id="sbnrr-timer" class="sbnrr-timer"></div>
        <div id="sbnrr-guide-text" class="sbnrr-guide-text"></div>
        <button class="stop-btn" id="sbnrr-cancel-btn">やめる</button>
      </div>
    </div>
    <style>
      .sbnrr-screen { height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; gap: 1.5rem; }
      .sbnrr-title { font-size: 1.5rem; color: #e8e4dc; }
      .sbnrr-subtitle { font-size: 0.85rem; color: #7a7468; }
      .sbnrr-running { display: flex; flex-direction: column; align-items: center; gap: 1.5rem; }
      .sbnrr-step-label { font-size: 1.3rem; color: #c8c4bc; }
      .sbnrr-timer { font-size: 2rem; color: #c8c4bc; font-variant-numeric: tabular-nums; }
      .sbnrr-guide-text { font-size: 1rem; color: #9a9488; text-align: center; max-width: 280px; line-height: 1.8; min-height: 2em; }
      .hidden { display: none !important; }
      .stop-btn { background: transparent; border: 1px solid #4a4840; color: #8a8478; font-size: 0.85rem; cursor: pointer; padding: 0.5rem 1.5rem; border-radius: 4px; }
    </style>
  `;
    const startBtn = container.querySelector('#sbnrr-start-btn');
    const runningArea = container.querySelector('#sbnrr-running');
    const stepLabel = container.querySelector('#sbnrr-step-label');
    const timerEl = container.querySelector('#sbnrr-timer');
    const guideText = container.querySelector('#sbnrr-guide-text');
    const cancelBtn = container.querySelector('#sbnrr-cancel-btn');
    cancelBtn.addEventListener('click', () => {
        cancelled = true;
        stopCurrentAudio();
        if (currentTimer)
            clearInterval(currentTimer);
        onDone(undefined);
    });
    startBtn.addEventListener('click', () => {
        startBtn.classList.add('hidden');
        container.querySelector('.sbnrr-subtitle')?.classList.add('hidden');
        runningArea.classList.remove('hidden');
        runSteps();
    });
    async function runSteps() {
        for (let i = 0; i < SBNRR_STEPS.length; i++) {
            if (cancelled)
                return;
            const step = SBNRR_STEPS[i];
            stepLabel.textContent = step.label;
            timerEl.textContent = formatTime(step.duration);
            // Fetch guidance
            const guidance = await sbnrrStep(step.key).catch(() => '');
            if (cancelled)
                return;
            guideText.textContent = toDisplayText(guidance);
            // Play TTS
            if (cancelled)
                return;
            await speakText(guidance, 'guide', { preferStream: false, isCancelled: () => cancelled });
            // Countdown
            await countdown(step.duration);
            if (cancelled)
                return;
            if (i < SBNRR_STEPS.length - 1) {
                playBell('mid');
            }
        }
        if (!cancelled) {
            playBell('end');
            onDone();
        }
    }
    function countdown(seconds) {
        return new Promise(resolve => {
            let remaining = seconds;
            timerEl.textContent = formatTime(remaining);
            currentTimer = window.setInterval(() => {
                remaining--;
                timerEl.textContent = formatTime(remaining);
                if (remaining <= 0) {
                    if (currentTimer)
                        clearInterval(currentTimer);
                    currentTimer = null;
                    resolve();
                }
            }, 1000);
        });
    }
    function formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
    }
}
