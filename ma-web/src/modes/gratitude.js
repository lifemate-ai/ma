import { saveSession, saveJournal } from '../api';
import { playBell, stopCurrentAudio } from '../audio';
import { recordSession } from '../store';
import { speakText } from '../voice-guidance';
export const GRATITUDE_ROUNDS = 3;
export const GRATITUDE_PROMPTS = [
    '今日、感謝していることをひとつ話してください。',
    'もうひとつ、支えになっているものを見つけてみましょう。',
    '最後に、小さなことでもいいので、もうひとつだけ。',
];
export function mountGratitude(container, onDone) {
    let currentRound = 1;
    const entries = [];
    container.innerHTML = `
    <div class="gratitude-screen">
      <div class="simple-practice-card">
        <div class="simple-practice-eyebrow">gratitude</div>
        <div id="gratitude-prompt" class="gratitude-prompt">今日、感謝していることをひとつ話してください。</div>
        <div id="gratitude-round" class="gratitude-round">${currentRound} / ${GRATITUDE_ROUNDS}</div>
        <textarea id="gratitude-input" class="gratitude-input" placeholder="感謝していること..." rows="3"></textarea>
        <div class="simple-practice-actions">
          <button class="mode-btn" id="gratitude-send-btn">送る</button>
          <button class="stop-btn" id="gratitude-cancel-btn">やめる</button>
        </div>
      </div>
    </div>
  `;
    const input = container.querySelector('#gratitude-input');
    const sendBtn = container.querySelector('#gratitude-send-btn');
    const roundEl = container.querySelector('#gratitude-round');
    const promptEl = container.querySelector('#gratitude-prompt');
    const cancelBtn = container.querySelector('#gratitude-cancel-btn');
    speakCurrentPrompt().catch(() => { });
    cancelBtn.addEventListener('click', () => {
        stopCurrentAudio();
        onDone(undefined);
    });
    sendBtn.addEventListener('click', async () => {
        const text = input.value.trim();
        if (!text)
            return;
        entries.push(text);
        currentRound++;
        if (currentRound > GRATITUDE_ROUNDS) {
            // All rounds complete — persist
            playBell('end');
            await speakText('今ある支えが、少し近くに戻ってきました。', 'closing', {
                preferStream: false,
            });
            recordSession();
            const sessionId = await saveSession(0, 'gratitude').catch(() => undefined);
            await saveJournal({ session_id: sessionId, user_text: entries.join('\n') }).catch(() => { });
            onDone(sessionId);
            return;
        }
        // Update UI for next round
        roundEl.textContent = `${currentRound} / ${GRATITUDE_ROUNDS}`;
        input.value = '';
        input.focus();
        // Brief bell between rounds
        playBell('mid');
        await speakCurrentPrompt();
    });
    async function speakCurrentPrompt() {
        const prompt = GRATITUDE_PROMPTS[currentRound - 1] ?? GRATITUDE_PROMPTS[GRATITUDE_PROMPTS.length - 1];
        promptEl.textContent = prompt;
        await speakText(prompt, 'prompt', { preferStream: false });
    }
}
