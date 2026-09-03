import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ProviderId } from '../../providers/types.js';
import { useRunStore } from '../store/useRunStore.js';
import { extractHtmlBlock } from '../utils/extractHtml.js';
import { maskKey } from '../../providers/base.js';

const LABELS: Record<ProviderId, string> = {
  deepseek: 'DeepSeek V4 Pro',
  qwen: 'Qwen 3.7 Plus',
  kimi: 'Kimi K2.6',
  glm: 'GLM-5.1',
  chatgpt: 'ChatGPT (GPT-5.1)'
};

type Tab = 'text' | 'html' | 'sources' | 'json';

function statusBadge(status: string) {
  switch (status) {
    case 'running':
      return <span className="animate-pulse">⏳ En cours</span>;
    case 'success':
      return <span className="text-emerald-400">✅ Terminé</span>;
    case 'error':
      return <span className="text-red-400">❌ Erreur</span>;
    case 'cancelled':
      return <span className="text-amber-400">⏹ Annulé</span>;
    default:
      return <span className="text-slate-500">Inactif</span>;
  }
}

function maskJsonString(value: unknown): string {
  const str = JSON.stringify(value, null, 2) ?? '';
  return str.replace(/sk-[a-zA-Z0-9]{6,}/g, (m) => maskKey(m));
}

export default function ResultCard({ providerId }: { providerId: ProviderId }): React.ReactElement {
  const card = useRunStore((s) => s.live[providerId]);
  const cancelRun = useRunStore((s) => s.cancelRun);
  const rerunOne = useRunStore((s) => s.rerunOne);
  const pinned = useRunStore((s) => s.pinned[providerId]);
  const togglePin = useRunStore((s) => s.togglePin);
  const compareSelection = useRunStore((s) => s.compareSelection);
  const setCompareSelection = useRunStore((s) => s.setCompareSelection);
  const [tab, setTab] = useState<Tab>('text');
  const [elapsed, setElapsed] = useState(0);

  React.useEffect(() => {
    if (card.status !== 'running' || !card.startedAt) return;
    const iv = setInterval(() => setElapsed(Date.now() - (card.startedAt ?? Date.now())), 200);
    return () => clearInterval(iv);
  }, [card.status, card.startedAt]);

  const htmlBlock = useMemo(() => extractHtmlBlock(card.content), [card.content]);
  const displayMs = card.status === 'running' ? elapsed : (card.result?.latencyMs ?? (card.finishedAt && card.startedAt ? card.finishedAt - card.startedAt : 0));

  function copyText(text: string) {
    void navigator.clipboard.writeText(text);
  }

  async function exportHtml() {
    if (!htmlBlock) return;
    await window.chinallm.exportFile.save({
      defaultName: `${providerId}-resultat.html`,
      content: htmlBlock,
      filters: [{ name: 'HTML', extensions: ['html'] }]
    });
  }

  async function openInBrowser() {
    if (!htmlBlock) return;
    await window.chinallm.exportFile.openTemp({ fileName: `${providerId}-${Date.now()}.html`, content: htmlBlock });
  }

  function toggleCompare() {
    if (compareSelection?.includes(providerId)) {
      setCompareSelection(null);
      return;
    }
    if (!compareSelection) {
      setCompareSelection([providerId, providerId]);
      return;
    }
    setCompareSelection([compareSelection[0], providerId]);
  }

  return (
    <div className="card flex h-[560px] flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span>{LABELS[providerId]}</span>
          {card.result?.modelId && (
            <span className="mono rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-normal text-slate-400">
              {card.result.modelId}
            </span>
          )}
          {statusBadge(card.status)}
          {card.result?.webSearchBridged && (
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">pontée</span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-400">
          <span className="mono">{(displayMs / 1000).toFixed(1)}s</span>
          {card.rounds > 1 && <span className="rounded bg-slate-800 px-1.5 py-0.5">{card.rounds} tours</span>}
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-slate-800 px-2 py-1">
        <button className="btn-sm" onClick={() => copyText(card.content)} title="Copier">
          📋
        </button>
        <button className="btn-sm" onClick={() => void rerunOne(providerId)} title="Relancer ce modèle">
          🔁
        </button>
        {card.status === 'running' && (
          <button className="btn-sm" onClick={() => void cancelRun(providerId)} title="Annuler">
            ⏹
          </button>
        )}
        <button className={`btn-sm ${pinned ? 'text-amber-400' : ''}`} onClick={() => togglePin(providerId)} title="Épingler">
          📌
        </button>
        <button className={`btn-sm ${compareSelection?.includes(providerId) ? 'text-blue-400' : ''}`} onClick={toggleCompare} title="Comparer">
          🔀
        </button>

        <div className="ml-auto flex gap-1">
          {(['text', 'html', 'sources', 'json'] as Tab[]).map((t) => (
            <button
              key={t}
              className={`btn-sm ${tab === t ? 'bg-slate-800 text-slate-100' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'text' ? 'Texte' : t === 'html' ? 'Aperçu HTML' : t === 'sources' ? `Sources (${card.sources.length})` : 'JSON brut'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 text-sm">
        {card.status === 'error' && card.result?.error && (
          <div className="mb-2 rounded border border-red-800 bg-red-950/40 p-2 text-xs text-red-300">
            [{card.result.error.code}] {card.result.error.message}
          </div>
        )}

        {tab === 'text' && (
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{card.content || '_En attente…_'}</ReactMarkdown>
          </div>
        )}

        {tab === 'html' && (
          <div className="flex h-full flex-col gap-2">
            {htmlBlock ? (
              <>
                <div className="flex gap-2">
                  <button className="btn-sm" onClick={exportHtml}>
                    💾 Exporter en .html
                  </button>
                  <button className="btn-sm" onClick={openInBrowser}>
                    🌐 Ouvrir dans le navigateur
                  </button>
                </div>
                <iframe
                  title={`preview-${providerId}`}
                  className="h-[380px] w-full rounded border border-slate-800 bg-white"
                  sandbox="allow-same-origin"
                  srcDoc={htmlBlock}
                />
              </>
            ) : (
              <p className="text-slate-500">Aucun bloc HTML détecté dans la réponse pour l’instant.</p>
            )}
          </div>
        )}

        {tab === 'sources' && (
          <ul className="space-y-2">
            {card.sources.length === 0 && <li className="text-slate-500">Aucune source.</li>}
            {card.sources.map((s, i) => (
              <li key={i} className="rounded border border-slate-800 p-2">
                <button
                  className="text-left text-blue-400 hover:underline"
                  onClick={() => s.url && void window.chinallm.shellUtil.openExternal(s.url)}
                >
                  {s.title || s.url || `Source ${i + 1}`}
                </button>
                {s.snippet && <p className="mt-1 text-xs text-slate-400">{s.snippet}</p>}
              </li>
            ))}
          </ul>
        )}

        {tab === 'json' && (
          <div>
            <button className="btn-sm mb-2" onClick={() => copyText(JSON.stringify(card.result ?? {}, null, 2))}>
              📋 Copier le JSON
            </button>
            <pre className="mono whitespace-pre-wrap break-all rounded bg-slate-950 p-2 text-xs text-slate-300">
              {maskJsonString(card.result ?? { status: card.status })}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
