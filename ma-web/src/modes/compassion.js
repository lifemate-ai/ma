import { playBell, stopCurrentAudio } from '../audio';
import { speakText, toDisplayText } from '../voice-guidance';
export const COMPASSION_PHASES = [
    {
        key: 'self',
        label: '自分へ',
        phrases: [
            '[calm][gently][slowly] あなたが幸せでありますように。',
            '[calm][gently] あなたが健康でありますように。',
            '[calm][gently] あなたが安らかでありますように。',
        ],
    },
    {
        key: 'loved',
        label: '大切な人へ',
        phrases: [
            '[calm][gently][slowly] あなたの大切な人が幸せでありますように。',
            '[calm][gently] あなたの大切な人が健康でありますように。',
            '[calm][gently] あなたの大切な人が安らかでありますように。',
        ],
    },
    {
        key: 'neutral',
        label: '知り合いへ',
        phrases: [
            '[calm][gently][slowly] その人が幸せでありますように。',
            '[calm][gently] その人が健康でありますように。',
            '[calm][gently] その人が安らかでありますように。',
        ],
    },
    {
        key: 'difficult',
        label: '苦手な人へ',
        phrases: [
            '[calm][gently][slowly] その人もまた幸せでありますように。',
            '[calm][gently] その人もまた健康でありますように。',
            '[calm][gently] その人もまた安らかでありますように。',
        ],
    },
];
export function mountCompassion(container, onDone) {
    let cancelled = false;
    container.innerHTML = `
    <div class="compassion-screen">
      <div class="compassion-title">慈悲の瞑想</div>
      <div class="compassion-subtitle">思いやりを届ける</div>
      <button class="mode-btn" id="compassion-start-btn">始める</button>
      <div class="compassion-running hidden" id="compassion-running">
        <div id="compassion-phase-label" class="compassion-phase-label"></div>
        <div id="compassion-phrase-text" class="compassion-phrase-text"></div>
        <button class="stop-btn" id="compassion-cancel-btn">やめる</button>
      </div>
    </div>
    <style>
      .compassion-screen { height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; gap: 1.5rem; }
      .compassion-title { font-size: 1.5rem; color: #e8e4dc; }
      .compassion-subtitle { font-size: 0.85rem; color: #7a7468; }
      .compassion-running { display: flex; flex-direction: column; align-items: center; gap: 1.5rem; }
      .compassion-phase-label { font-size: 1.2rem; color: #c8c4bc; }
      .compassion-phrase-text { font-size: 1rem; color: #9a9488; text-align: center; max-width: 300px; line-height: 1.8; min-height: 2em; }
      .hidden { display: none !important; }
      .mode-btn { background: transparent; border: 1px solid #4a4840; color: #e8e4dc; padding: 0.75rem 2rem; cursor: pointer; border-radius: 4px; font-size: 0.95rem; }
      .stop-btn { background: transparent; border: 1px solid #4a4840; color: #8a8478; font-size: 0.85rem; cursor: pointer; padding: 0.5rem 1.5rem; border-radius: 4px; }
    </style>
  `;
    const startBtn = container.querySelector('#compassion-start-btn');
    const runningArea = container.querySelector('#compassion-running');
    const phaseLabel = container.querySelector('#compassion-phase-label');
    const phraseText = container.querySelector('#compassion-phrase-text');
    const cancelBtn = container.querySelector('#compassion-cancel-btn');
    cancelBtn.addEventListener('click', () => {
        cancelled = true;
        stopCurrentAudio();
        onDone(undefined);
    });
    startBtn.addEventListener('click', () => {
        startBtn.classList.add('hidden');
        container.querySelector('.compassion-subtitle')?.classList.add('hidden');
        runningArea.classList.remove('hidden');
        runPhases();
    });
    async function runPhases() {
        for (let i = 0; i < COMPASSION_PHASES.length; i++) {
            if (cancelled)
                return;
            const phase = COMPASSION_PHASES[i];
            phaseLabel.textContent = phase.label;
            for (let j = 0; j < phase.phrases.length; j++) {
                if (cancelled)
                    return;
                const phrase = phase.phrases[j];
                phraseText.textContent = toDisplayText(phrase);
                if (cancelled)
                    return;
                await speakText(phrase, 'mantra', { preferStream: false, isCancelled: () => cancelled });
                // Brief pause between phrases
                if (!cancelled) {
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }
            if (i < COMPASSION_PHASES.length - 1 && !cancelled) {
                playBell('mid');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        if (!cancelled) {
            playBell('end');
            onDone();
        }
    }
}
