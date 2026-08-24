import React from 'react';
import { useRunStore } from '../store/useRunStore.js';

export default function HistoryDrawer({ onClose }: { onClose: () => void }): React.ReactElement {
  const history = useRunStore((s) => s.history);
  const clearHistory = useRunStore((s) => s.clearHistory);
  const deleteHistoryEntry = useRunStore((s) => s.deleteHistoryEntry);
  const replayHistoryEntry = useRunStore((s) => s.replayHistoryEntry);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300">Historique ({history.length})</h2>
        <button className="btn-sm" onClick={() => void clearHistory()}>
          🗑️ Tout effacer
        </button>
      </div>

      {history.length === 0 && <p className="text-sm text-slate-500">Aucune exécution enregistrée.</p>}

      <ul className="space-y-2">
        {history.map((entry) => (
          <li key={entry.id} className="card p-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{new Date(entry.timestamp).toLocaleString('fr-FR')}</span>
              <span>${entry.totalCostUsd.toFixed(4)}</span>
            </div>
            <p className="mono mt-1 line-clamp-2 text-xs text-slate-300">{entry.prompt.slice(0, 160)}…</p>
            <div className="mt-2 flex gap-2">
              <button
                className="btn-sm"
                onClick={() => {
                  replayHistoryEntry(entry);
                  onClose();
                }}
              >
                ▶ Rejouer
              </button>
              <button className="btn-sm text-red-400" onClick={() => void deleteHistoryEntry(entry.id)}>
                🗑️ Supprimer
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
