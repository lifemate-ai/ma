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
      .insight-item { font-size: 0.85rem; color: #7a7468; line-height: 1.7; padding: 0.5rem 0; border-bottom: 1px solid #2a2820; }
      .insight-item:last-child { border-bottom: none; }
    </style>
    <div class="insights-header">気づき</div>
    ${insights.map(ins => `<div class="insight-item">${ins.text}</div>`).join('')}
  `;
    container.prepend(section);
}
