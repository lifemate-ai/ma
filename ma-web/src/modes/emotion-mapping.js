import { loopBack } from '../api';
import { stopCurrentAudio } from '../audio';
import { speakText, toDisplayText } from '../voice-guidance';
export const EMOTIONS = [
    '喜び', '悲しみ', '怒り', '不安', '恐れ',
    '驚き', '嫌悪', '期待', '穏やか', 'もやもや',
];
export function mountEmotionMapping(container, onDone) {
    let selectedEmotion = '';
    container.innerHTML = `
    <div class="emotion-mapping-screen">
      <div class="simple-practice-card">
        <div class="simple-practice-eyebrow">emotion labeling</div>
        <div class="em-title">感情をたどる</div>
        <div class="em-prompt" id="em-prompt">今、どんな感情がありますか？</div>
        <div class="em-emotions" id="em-emotions">
          ${EMOTIONS.map(e => `<button class="emotion-btn" data-emotion="${e}">${e}</button>`).join('')}
        </div>
        <div class="em-body-section hidden" id="em-body-section">
          <div id="body-location-prompt" class="em-prompt">その感情は、体のどこにありますか？</div>
          <input type="text" id="body-location-input" class="em-input" placeholder="例: 胸、お腹、肩..." />
          <div class="simple-practice-actions">
            <button class="mode-btn" id="body-send-btn">送る</button>
          </div>
        </div>
        <div class="em-reflection-section hidden" id="em-reflection-section">
          <div id="em-reflection" class="em-reflection"></div>
          <div class="simple-practice-actions">
            <button class="mode-btn" id="em-done-btn">おわる</button>
          </div>
        </div>
        <div class="simple-practice-actions">
          <button class="stop-btn" id="em-cancel-btn">やめる</button>
        </div>
      </div>
    </div>
  `;
    const emotionsArea = container.querySelector('#em-emotions');
    const bodySection = container.querySelector('#em-body-section');
    const reflectionSection = container.querySelector('#em-reflection-section');
    const reflectionEl = container.querySelector('#em-reflection');
    const cancelBtn = container.querySelector('#em-cancel-btn');
    const doneBtn = container.querySelector('#em-done-btn');
    cancelBtn.addEventListener('click', () => {
        stopCurrentAudio();
        onDone(undefined);
    });
    doneBtn.addEventListener('click', () => {
        onDone();
    });
    // 開始時に最初の問いかけを音声で読む
    speakText('今、どんな感情がありますか？', 'prompt', { preferStream: false }).catch(() => { });
    // Emotion selection
    container.querySelectorAll('.emotion-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            selectedEmotion = btn.dataset.emotion ?? '';
            emotionsArea.classList.add('hidden');
            container.querySelector('#em-prompt')?.classList.add('hidden');
            bodySection.classList.remove('hidden');
            // 体の場所の問いかけを音声で読む
            await speakText('その感情は、体のどこにありますか？', 'prompt', { preferStream: false });
        });
    });
    // Body location submit
    const bodyInput = container.querySelector('#body-location-input');
    const bodySendBtn = container.querySelector('#body-send-btn');
    bodySendBtn.addEventListener('click', async () => {
        const location = bodyInput.value.trim();
        if (!location)
            return;
        bodySendBtn.disabled = true;
        bodySendBtn.textContent = '...';
        const journalText = `感情: ${selectedEmotion}。体の場所: ${location}。`;
        const reflection = await loopBack(journalText).catch(() => '');
        bodySection.classList.add('hidden');
        reflectionSection.classList.remove('hidden');
        reflectionEl.textContent = toDisplayText(reflection, '...');
        if (reflection) {
            await speakText(reflection, 'reflection', { preferStream: false });
        }
    });
}
