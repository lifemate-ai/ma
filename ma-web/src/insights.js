import { getInsights } from './api';
export async function mountInsights(container) {
    const insights = await getInsights().catch(() => []);
    if (insights.length === 0)
        return;
    const section = document.createElement('div');
    section.className = 'insights-section';
    section.innerHTML = `
    <style>
      .insights-section { width: 100%; max-width: 320px; margin-bottom: 1.5rem; }
      .insights-header { font-size: 0.7rem; color: #5a5850; letter-spacing: 0.15em; margin-bottom: 0.75rem; text-transform: uppercase; }
      .insight-card { padding: 0.8rem 0; border-bottom: 1px solid #2a2820; }
      .insight-card:last-child { border-bottom: none; }
      .insight-title { font-size: 0.88rem; color: #d3cdc4; margin-bottom: 0.35rem; }
      .insight-summary { font-size: 0.82rem; color: #8a8478; line-height: 1.7; }
      .insight-meta { font-size: 0.72rem; color: #5a5850; margin-top: 0.35rem; }
      .insight-next { font-size: 0.78rem; color: #b5aa95; margin-top: 0.45rem; line-height: 1.6; }
    </style>
    <div class="insights-header">気づき</div>
    ${insights.map(ins => `
      <div class="insight-card">
        <div class="insight-title">${ins.title}</div>
        <div class="insight-summary">${ins.summary}</div>
        <div class="insight-meta">confidence ${Math.round(ins.confidence * 100)}% · data ${ins.sample_size}</div>
        <div class="insight-next">次に試すなら: ${ins.next_step}</div>
      </div>
    `).join('')}
  `;
    container.prepend(section);
}
