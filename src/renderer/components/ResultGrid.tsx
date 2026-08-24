import React from 'react';
import { useRunStore, PROVIDER_IDS } from '../store/useRunStore.js';
import ResultCard from './ResultCard.js';

export default function ResultGrid(): React.ReactElement {
  const modelSettings = useRunStore((s) => s.modelSettings);
  const compareSelection = useRunStore((s) => s.compareSelection);
  const live = useRunStore((s) => s.live);
  const enabled = PROVIDER_IDS.filter((id) => modelSettings[id].enabled);

  const colsClass =
    enabled.length <= 1 ? 'grid-cols-1' : enabled.length === 2 ? 'grid-cols-1 lg:grid-cols-2' : enabled.length === 3 ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1 lg:grid-cols-2 xl:grid-cols-4';

  return (
    <div>
      {compareSelection && compareSelection[0] !== compareSelection[1] && (
        <div className="card mb-3 grid grid-cols-2 gap-3 p-3">
          {compareSelection.map((id) => (
            <div key={id}>
              <h4 className="mb-1 text-xs font-semibold uppercase text-slate-500">{id}</h4>
              <pre className="mono max-h-64 overflow-y-auto whitespace-pre-wrap rounded bg-slate-950 p-2 text-xs">
                {live[id].content || '—'}
              </pre>
            </div>
          ))}
        </div>
      )}

      {enabled.length === 0 ? (
        <p className="text-sm text-slate-500">Sélectionne au moins un modèle pour lancer une comparaison.</p>
      ) : (
        <div className={`grid gap-3 ${colsClass}`}>
          {enabled.map((id) => (
            <ResultCard key={id} providerId={id} />
          ))}
        </div>
      )}
    </div>
  );
}
