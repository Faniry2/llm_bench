import React, { useEffect, useState } from 'react';
import { useRunStore } from './store/useRunStore.js';
import PromptEditor from './components/PromptEditor.js';
import ModelSelector from './components/ModelSelector.js';
import ResultGrid from './components/ResultGrid.js';
import StatsPanel from './components/StatsPanel.js';
import CostSettings from './components/CostSettings.js';
import HistoryDrawer from './components/HistoryDrawer.js';
import ApiKeysPanel from './components/ApiKeysPanel.js';

type Panel = 'none' | 'keys' | 'rates' | 'history';

export default function App(): React.ReactElement {
  const init = useRunStore((s) => s.init);
  const theme = useRunStore((s) => s.theme);
  const toggleTheme = useRunStore((s) => s.toggleTheme);
  const startRun = useRunStore((s) => s.startRun);
  const cancelRun = useRunStore((s) => s.cancelRun);
  const isRunning = useRunStore((s) => s.isRunning);
  const [panel, setPanel] = useState<Panel>('none');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    init()
      .then(() => setReady(true))
      .catch((err) => console.error('[chinallm-bench] init failed', err));
  }, [init]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        if (!isRunning) void startRun();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isRunning, startRun]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-400">
        Chargement de ChinaLLM Bench…
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/60 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold tracking-tight">🐉 ChinaLLM Bench</span>
          <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">v0.1.0</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost" onClick={() => setPanel(panel === 'keys' ? 'none' : 'keys')}>
            🔑 Clés API
          </button>
          <button className="btn-ghost" onClick={() => setPanel(panel === 'rates' ? 'none' : 'rates')}>
            💰 Tarifs
          </button>
          <button className="btn-ghost" onClick={() => setPanel(panel === 'history' ? 'none' : 'history')}>
            🕒 Historique
          </button>
          <button className="btn-ghost" onClick={toggleTheme} title="Basculer le thème">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-y-auto">
          <section className="border-b border-slate-800 p-4">
            <PromptEditor />
            <ModelSelector />
            <div className="mt-3 flex items-center gap-3">
              {!isRunning ? (
                <button className="btn-primary" onClick={() => void startRun()}>
                  ▶ Lancer <span className="ml-1 text-xs opacity-70">(Ctrl+Entrée)</span>
                </button>
              ) : (
                <button className="btn-danger" onClick={() => void cancelRun()}>
                  ⏹ Annuler tout
                </button>
              )}
            </div>
          </section>

          <section className="flex-1 p-4">
            <ResultGrid />
          </section>

          <section className="border-t border-slate-800 p-4">
            <StatsPanel />
          </section>
        </div>

        {panel !== 'none' && (
          <aside className="w-[420px] shrink-0 overflow-y-auto border-l border-slate-800 bg-slate-900/60 p-4">
            {panel === 'keys' && <ApiKeysPanel />}
            {panel === 'rates' && <CostSettings />}
            {panel === 'history' && <HistoryDrawer onClose={() => setPanel('none')} />}
          </aside>
        )}
      </main>
    </div>
  );
}
