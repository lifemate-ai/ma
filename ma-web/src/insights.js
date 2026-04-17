import { getInsights } from './api';
export async function mountInsights(container) {
    const insights = await getInsights().catch(() => []);
    if (insights.length === 0)
        return;
    const section = document.createElement('div');
    section.className = 'insights-section';
    section.innerHTML = `
    <div class="insights-header">気づき</div>
    ${insights.map(ins => `
      <div class="insight-card">
        <div class="insight-title">${ins.title}</div>
        <div class="insight-summary">${ins.summary}</div>
        <div class="insight-meta">確かさ ${Math.round(ins.confidence * 100)}% · データ ${ins.sample_size}</div>
        <div class="insight-next">次に試すなら: ${ins.next_step}</div>
      </div>
    `).join('')}
  `;
    container.prepend(section);
}
