import type { ProviderId, RunResult } from '../../providers/types.js';

export interface ReportRow {
  id: ProviderId;
  label: string;
  result: RunResult;
  costUsd: number;
  costEur: number;
}

export function buildMarkdownReport(prompt: string, rows: ReportRow[]): string {
  const lines: string[] = [`# Rapport ChinaLLM Bench`, '', `_Généré le ${new Date().toLocaleString('fr-FR')}_`, '', '## Prompt', '', '```', prompt, '```', ''];

  lines.push('## Statistiques', '');
  lines.push('| Modèle | In | Cache | Out | Total | Recherches | Latence | Tours | Coût $ | Coût € |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    lines.push(
      `| ${r.label} | ${r.result.usage.inputTokens} | ${r.result.usage.cachedInputTokens} | ${r.result.usage.outputTokens} | ${r.result.usage.totalTokens} | ${r.result.usage.webSearchCalls} | ${(r.result.latencyMs / 1000).toFixed(1)}s | ${r.result.rounds} | $${r.costUsd.toFixed(4)} | €${r.costEur.toFixed(4)} |`
    );
  }
  lines.push('');

  for (const r of rows) {
    lines.push(`## ${r.label}`, '', r.result.content || '_Aucun contenu_', '');
    if (r.result.sources.length) {
      lines.push('### Sources', '');
      for (const s of r.result.sources) lines.push(`- [${s.title || s.url}](${s.url})`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

export function buildHtmlReport(prompt: string, rows: ReportRow[]): string {
  const rowsHtml = rows
    .map(
      (r) => `<tr><td>${r.label}</td><td>${r.result.usage.inputTokens}</td><td>${r.result.usage.cachedInputTokens}</td><td>${r.result.usage.outputTokens}</td><td>${r.result.usage.totalTokens}</td><td>${r.result.usage.webSearchCalls}</td><td>${(r.result.latencyMs / 1000).toFixed(1)}s</td><td>${r.result.rounds}</td><td>$${r.costUsd.toFixed(4)}</td><td>€${r.costEur.toFixed(4)}</td></tr>`
    )
    .join('\n');

  const sectionsHtml = rows
    .map(
      (r) => `<section>
        <h2>${r.label}</h2>
        <pre>${escapeHtml(r.result.content || 'Aucun contenu')}</pre>
        ${r.result.sources.length ? `<h3>Sources</h3><ul>${r.result.sources.map((s) => `<li><a href="${s.url}">${escapeHtml(s.title || s.url)}</a></li>`).join('')}</ul>` : ''}
      </section>`
    )
    .join('\n');

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Rapport ChinaLLM Bench</title>
<style>
body { font-family: system-ui, sans-serif; max-width: 960px; margin: 2rem auto; padding: 0 1rem; color: #0f172a; }
pre { white-space: pre-wrap; background: #f1f5f9; padding: 1rem; border-radius: 8px; }
table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
th, td { border: 1px solid #cbd5e1; padding: 4px 8px; font-size: 13px; text-align: left; }
</style>
</head>
<body>
<h1>Rapport ChinaLLM Bench</h1>
<p><em>Généré le ${new Date().toLocaleString('fr-FR')}</em></p>
<h2>Prompt</h2>
<pre>${escapeHtml(prompt)}</pre>
<h2>Statistiques</h2>
<table>
<thead><tr><th>Modèle</th><th>In</th><th>Cache</th><th>Out</th><th>Total</th><th>Recherches</th><th>Latence</th><th>Tours</th><th>Coût $</th><th>Coût €</th></tr></thead>
<tbody>${rowsHtml}</tbody>
</table>
${sectionsHtml}
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
