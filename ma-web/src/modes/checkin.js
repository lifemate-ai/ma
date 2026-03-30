import { saveCheckin } from '../api';
import { stopCurrentAudio } from '../audio';
import { speakText } from '../voice-guidance';
export const CHECKIN_QUESTIONS = [
    { key: 'emotion', label: '今の感情は？', spoken: '今の感情は、どんな感じですか？' },
    { key: 'body_state', label: '体の状態は？', spoken: '体の状態は、どうですか？' },
    { key: 'intention', label: '今日の意図は？', spoken: '今日の意図を、ひとことで置いてみましょう。' },
];
export function mountCheckin(container, onDone) {
    let currentIndex = 0;
    const answers = [];
    container.innerHTML = `
    <div class="checkin-screen">
      <div class="checkin-title">チェックイン</div>
      <div id="checkin-counter" class="checkin-counter">${currentIndex + 1} / ${CHECKIN_QUESTIONS.length}</div>
      <div id="checkin-question" class="checkin-question">${CHECKIN_QUESTIONS[0].label}</div>
      <input type="text" id="checkin-input" class="checkin-input" placeholder="ひとことで..." />
      <button class="mode-btn" id="checkin-next-btn">次へ</button>
      <button class="stop-btn" id="checkin-cancel-btn">やめる</button>
    </div>
    <style>
      .checkin-screen { height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; gap: 1.5rem; }
      .checkin-title { font-size: 1.3rem; color: #e8e4dc; }
      .checkin-counter { font-size: 0.85rem; color: #7a7468; }
      .checkin-question { font-size: 1.1rem; color: #c8c4bc; text-align: center; }
      .checkin-input { background: #222; border: 1px solid #3a3830; color: #e8e4dc; padding: 0.75rem; font-size: 1rem; border-radius: 4px; outline: none; width: 100%; max-width: 280px; }
      .checkin-input:focus { border-color: #6a6458; }
      .hidden { display: none !important; }
      .mode-btn { background: transparent; border: 1px solid #4a4840; color: #e8e4dc; padding: 0.75rem 2rem; cursor: pointer; border-radius: 4px; font-size: 0.95rem; }
      .stop-btn { background: transparent; border: 1px solid #4a4840; color: #8a8478; font-size: 0.85rem; cursor: pointer; padding: 0.5rem 1.5rem; border-radius: 4px; }
    </style>
  `;
    const counterEl = container.querySelector('#checkin-counter');
    const questionEl = container.querySelector('#checkin-question');
    const input = container.querySelector('#checkin-input');
    const nextBtn = container.querySelector('#checkin-next-btn');
    const cancelBtn = container.querySelector('#checkin-cancel-btn');
    speakCurrentQuestion().catch(() => { });
    cancelBtn.addEventListener('click', () => {
        stopCurrentAudio();
        onDone(undefined);
    });
    nextBtn.addEventListener('click', async () => {
        const text = input.value.trim();
        if (!text)
            return;
        answers.push(text);
        currentIndex++;
        if (currentIndex >= CHECKIN_QUESTIONS.length) {
            // All questions answered - save to DB
            await saveCheckin({
                emotion: answers[0],
                body_state: answers[1],
                intention: answers[2],
            }).catch(() => { });
            await speakText('今の自分の輪郭が、少し見えました。', 'closing', {
                preferStream: false,
            });
            onDone();
            return;
        }
        // Show next question
        counterEl.textContent = `${currentIndex + 1} / ${CHECKIN_QUESTIONS.length}`;
        questionEl.textContent = CHECKIN_QUESTIONS[currentIndex].label;
        input.value = '';
        input.focus();
        await speakCurrentQuestion();
    });
    async function speakCurrentQuestion() {
        const question = CHECKIN_QUESTIONS[currentIndex];
        await speakText(question.spoken, 'prompt', { preferStream: false });
    }
}
