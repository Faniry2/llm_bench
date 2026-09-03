import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { useRunStore, PROVIDER_IDS } from '../store/useRunStore.js';
import { computeCost, projectCost, estimateMonthlyCost } from '../../pricing/calculator.js';
import type { ProviderId } from '../../providers/types.js';
import { buildMarkdownReport, buildHtmlReport, type ReportRow } from '../utils/reportExport.js';

const LABELS: Record<ProviderId, string> = {
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  kimi: 'Kimi',
  glm: 'GLM',
  chatgpt: 'ChatGPT'
};

const COLORS: Record<ProviderId, string> = {
  deepseek: '#4f8cff',
  qwen: '#7c5cff',
  kimi: '#ff8a4f',
  glm: '#2fd18f',
  chatgpt: '#10a37f'
};

function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function StatsPanel(): React.ReactElement {
  const live = useRunStore((s) => s.live);
  const prompt = useRunStore((s) => s.prompt);
  const rates = useRunStore((s) => s.rates);
  const deepseekPricingMode = useRunStore((s) => s.deepseekPricingMode);
  const usdToEur = useRunStore((s) => s.usdToEur);
  const history = useRunStore((s) => s.history);
  const projectionRuns = useRunStore((s) => s.projectionRuns);
  const setProjectionRuns = useRunStore((s) => s.setProjectionRuns);
  const runsPerDay = useRunStore((s) => s.runsPerDay);
  const setRunsPerDay = useRunStore((s) => s.setRunsPerDay);

  const rows = useMemo(() => {
    if (!rates) return [];
    return PROVIDER_IDS.filter((id) => live[id].result).map((id) => {
      const result = live[id].result!;
      const cost = computeCost(result.usage, rates[id], { deepseekPricingMode });
      return { id, result, cost };
    });
  }, [live, rates, deepseekPricingMode]);

  const currentRunCostUsd = rows.reduce((sum, r) => sum + r.cost.totalCost, 0);
  const sessionCostUsd = useMemo(() => history.reduce((sum, h) => sum + h.totalCostUsd, 0), [history]);
  const totalCostUsd = sessionCostUsd; // persisted history *is* the cumulative total across sessions

  const cheapestId = rows.length ? rows.reduce((a, b) => (a.cost.totalCost <= b.cost.totalCost ? a : b)).id : null;
  const priciestId = rows.length ? rows.reduce((a, b) => (a.cost.totalCost >= b.cost.totalCost ? a : b)).id : null;

  const tokenChartData = rows.map((r) => ({
    name: LABELS[r.id],
    in: r.result.usage.inputTokens,
    out: r.result.usage.outputTokens
  }));

  const costChartData = rows.map((r) => ({ name: LABELS[r.id], cost: r.cost.totalCost, fill: COLORS[r.id] }));

  const cumulativeData = useMemo(() => {
    return history
      .slice(0, 30)
      .reverse()
      .map((h, i) => ({ run: i + 1, cost: h.totalCostUsd }))
      .reduce<{ run: number; cost: number; cumulative: number }[]>((acc, cur) => {
        const prev = acc[acc.length - 1]?.cumulative ?? 0;
        acc.push({ ...cur, cumulative: prev + cur.cost });
        return acc;
      }, []);
  }, [history]);

  const scatterData = rows.map((r) => ({
    name: LABELS[r.id],
    cost: r.cost.totalCost,
    latency: r.result.latencyMs / 1000,
    fill: COLORS[r.id]
  }));

  function exportCsv() {
    const header = ['Modèle', 'Tokens in', 'Cache', 'Tokens out', 'Raisonnement', 'Total', 'Recherches', 'Latence ms', 'TTFT ms', 'Tours', 'Coût $', 'Coût €'];
    const lines = rows.map((r) =>
      [
        LABELS[r.id],
        r.result.usage.inputTokens,
        r.result.usage.cachedInputTokens,
        r.result.usage.outputTokens,
        r.result.usage.reasoningTokens,
        r.result.usage.totalTokens,
        r.result.usage.webSearchCalls,
        r.result.latencyMs,
        r.result.ttftMs ?? '',
        r.result.rounds,
        r.cost.totalCost.toFixed(6),
        (r.cost.totalCost * usdToEur).toFixed(6)
      ].join(',')
    );
    downloadFile('chinallm-bench-stats.csv', [header.join(','), ...lines].join('\n'), 'text/csv');
  }

  function exportJson() {
    downloadFile('chinallm-bench-stats.json', JSON.stringify(rows, null, 2), 'application/json');
  }

  function reportRows(): ReportRow[] {
    return rows.map((r) => ({
      id: r.id,
      label: LABELS[r.id],
      result: r.result,
      costUsd: r.cost.totalCost,
      costEur: r.cost.totalCost * usdToEur
    }));
  }

  async function exportRunMarkdown() {
    const content = buildMarkdownReport(prompt, reportRows());
    await window.chinallm.exportFile.save({
      defaultName: 'chinallm-bench-rapport.md',
      content,
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    });
  }

  async function exportRunHtml() {
    const content = buildHtmlReport(prompt, reportRows());
    await window.chinallm.exportFile.save({
      defaultName: 'chinallm-bench-rapport.html',
      content,
      filters: [{ name: 'HTML', extensions: ['html'] }]
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300">Statistiques &amp; coûts</h2>
        <div className="flex gap-2">
          <button className="btn-sm" onClick={exportCsv}>
            ⬇️ CSV
          </button>
          <button className="btn-sm" onClick={exportJson}>
            ⬇️ JSON
          </button>
          <button className="btn-sm" onClick={() => void exportRunMarkdown()}>
            ⬇️ Rapport .md
          </button>
          <button className="btn-sm" onClick={() => void exportRunHtml()}>
            ⬇️ Rapport .html
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <SummaryCard label="Coût du run courant" value={`$${currentRunCostUsd.toFixed(4)}`} sub={`€${(currentRunCostUsd * usdToEur).toFixed(4)}`} />
        <SummaryCard label="Coût cumulé session" value={`$${sessionCostUsd.toFixed(4)}`} />
        <SummaryCard label="Coût cumulé total" value={`$${totalCostUsd.toFixed(4)}`} />
        <SummaryCard
          label="Projection N runs"
          value={`$${projectCost(currentRunCostUsd, projectionRuns).toFixed(2)}`}
          input={
            <input
              type="number"
              min={1}
              className="input mt-1 w-full py-0.5 text-xs"
              value={projectionRuns}
              onChange={(e) => setProjectionRuns(Number(e.target.value))}
            />
          }
        />
        <SummaryCard
          label="Coût mensuel estimé"
          value={`$${estimateMonthlyCost(currentRunCostUsd, runsPerDay).toFixed(2)}`}
          input={
            <input
              type="number"
              min={1}
              className="input mt-1 w-full py-0.5 text-xs"
              value={runsPerDay}
              onChange={(e) => setRunsPerDay(Number(e.target.value))}
            />
          }
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead className="text-slate-500">
            <tr>
              {['Modèle', 'In', 'Cache', 'Out', 'Raisonnement', 'Total', 'Recherches', 'Latence', 'TTFT', 'Tours', '$', '€', '$/1k tok'].map((h) => (
                <th key={h} className="border-b border-slate-800 px-2 py-1 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className={r.id === cheapestId ? 'bg-emerald-500/10' : r.id === priciestId ? 'bg-red-500/10' : ''}
              >
                <td className="px-2 py-1">
                  {LABELS[r.id]} {r.result.usageIsEstimated && <span title="Usage estimé (tiktoken)">⚠️</span>}
                </td>
                <td className="px-2 py-1">{r.result.usage.inputTokens.toLocaleString()}</td>
                <td className="px-2 py-1">{r.result.usage.cachedInputTokens.toLocaleString()}</td>
                <td className="px-2 py-1">{r.result.usage.outputTokens.toLocaleString()}</td>
                <td className="px-2 py-1">{r.result.usage.reasoningTokens.toLocaleString()}</td>
                <td className="px-2 py-1">{r.result.usage.totalTokens.toLocaleString()}</td>
                <td className="px-2 py-1">{r.result.usage.webSearchCalls}</td>
                <td className="px-2 py-1">{(r.result.latencyMs / 1000).toFixed(1)}s</td>
                <td className="px-2 py-1">{r.result.ttftMs ? `${(r.result.ttftMs / 1000).toFixed(1)}s` : '—'}</td>
                <td className="px-2 py-1">{r.result.rounds}</td>
                <td className="px-2 py-1">${r.cost.totalCost.toFixed(4)}</td>
                <td className="px-2 py-1">€{(r.cost.totalCost * usdToEur).toFixed(4)}</td>
                <td className="px-2 py-1">${r.cost.usdPerKTokens.toFixed(4)}</td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="border-t border-slate-700 font-semibold">
                <td className="px-2 py-1">TOTAL</td>
                <td className="px-2 py-1">{rows.reduce((s, r) => s + r.result.usage.inputTokens, 0).toLocaleString()}</td>
                <td className="px-2 py-1">{rows.reduce((s, r) => s + r.result.usage.cachedInputTokens, 0).toLocaleString()}</td>
                <td className="px-2 py-1">{rows.reduce((s, r) => s + r.result.usage.outputTokens, 0).toLocaleString()}</td>
                <td className="px-2 py-1">{rows.reduce((s, r) => s + r.result.usage.reasoningTokens, 0).toLocaleString()}</td>
                <td className="px-2 py-1">{rows.reduce((s, r) => s + r.result.usage.totalTokens, 0).toLocaleString()}</td>
                <td className="px-2 py-1">{rows.reduce((s, r) => s + r.result.usage.webSearchCalls, 0)}</td>
                <td colSpan={2} className="px-2 py-1" />
                <td className="px-2 py-1" />
                <td className="px-2 py-1">${currentRunCostUsd.toFixed(4)}</td>
                <td className="px-2 py-1">€{(currentRunCostUsd * usdToEur).toFixed(4)}</td>
                <td className="px-2 py-1" />
              </tr>
            )}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-3 text-center text-slate-500">Lance une exécution pour voir les statistiques.</p>}
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartBox title="Tokens in/out par modèle">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={tokenChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b' }} />
                <Legend />
                <Bar dataKey="in" fill="#4f8cff" name="Tokens in" />
                <Bar dataKey="out" fill="#7c5cff" name="Tokens out" />
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>

          <ChartBox title="Coût par modèle (run courant)">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={costChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b' }} formatter={(v: number) => `$${v.toFixed(4)}`} />
                <Bar dataKey="cost" name="Coût $" />
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>

          <ChartBox title="Coût cumulé (30 derniers runs)">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={cumulativeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="run" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b' }} formatter={(v: number) => `$${v.toFixed(4)}`} />
                <Line type="monotone" dataKey="cumulative" stroke="#2fd18f" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartBox>

          <ChartBox title="Coût vs latence">
            <ResponsiveContainer width="100%" height={220}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis type="number" dataKey="latency" name="Latence (s)" stroke="#64748b" fontSize={12} />
                <YAxis type="number" dataKey="cost" name="Coût ($)" stroke="#64748b" fontSize={12} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b' }} cursor={{ strokeDasharray: '3 3' }} />
                <Scatter data={scatterData} fill="#ff8a4f" />
              </ScatterChart>
            </ResponsiveContainer>
          </ChartBox>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, sub, input }: { label: string; value: string; sub?: string; input?: React.ReactNode }) {
  return (
    <div className="card p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
      {input}
    </div>
  );
}

function ChartBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-3">
      <h4 className="mb-2 text-xs font-semibold uppercase text-slate-500">{title}</h4>
      {children}
    </div>
  );
}
