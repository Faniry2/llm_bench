import React, { useState } from 'react';
import { useRunStore, PROVIDER_IDS } from '../store/useRunStore.js';
import type { ProviderId } from '../../providers/types.js';
import { providerModels } from '../../providers/models.js';

const CUSTOM_MODEL = '__custom__';

const LABELS: Record<ProviderId, string> = {
  deepseek: 'DeepSeek V4 Pro',
  qwen: 'Qwen 3.7 Plus',
  kimi: 'Kimi K2.6',
  glm: 'GLM-5.1',
  chatgpt: 'ChatGPT (GPT-5.1)'
};

const COLORS: Record<ProviderId, string> = {
  deepseek: 'border-deepseek/50',
  qwen: 'border-qwen/50',
  kimi: 'border-kimi/50',
  glm: 'border-glm/50',
  chatgpt: 'border-chatgpt/50'
};

export default function ModelSelector(): React.ReactElement {
  const modelSettings = useRunStore((s) => s.modelSettings);
  const toggleModel = useRunStore((s) => s.toggleModel);
  const updateModelSettings = useRunStore((s) => s.updateModelSettings);
  const globalWebSearch = useRunStore((s) => s.globalWebSearch);
  const setGlobalWebSearch = useRunStore((s) => s.setGlobalWebSearch);
  const [openGear, setOpenGear] = useState<ProviderId | null>(null);

  return (
    <div className="mt-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Modèles</h3>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={globalWebSearch} onChange={(e) => setGlobalWebSearch(e.target.checked)} />
          🌐 Recherche web (global)
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {PROVIDER_IDS.map((id) => {
          const ms = modelSettings[id];
          return (
            <div key={id} className={`card border p-2 ${COLORS[id]} ${ms.enabled ? '' : 'opacity-50'}`}>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={ms.enabled} onChange={() => toggleModel(id)} />
                  {LABELS[id]}
                </label>
                <button className="btn-sm" onClick={() => setOpenGear(openGear === id ? null : id)}>
                  ⚙️
                </button>
              </div>
              <div className="mono mt-0.5 truncate text-[10px] text-slate-500" title={ms.modelId}>
                {ms.modelId}
              </div>
              {(id === 'deepseek' || id === 'chatgpt') && ms.webSearch && (
                <span className="mt-1 inline-block rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                  recherche : pontée
                </span>
              )}

              {openGear === id && (
                <div className="mt-2 space-y-2 border-t border-slate-800 pt-2 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span>Modèle</span>
                      <select
                        className="input w-40 py-0.5"
                        value={providerModels[id].some((m) => m.id === ms.modelId) ? ms.modelId : CUSTOM_MODEL}
                        onChange={(e) => {
                          if (e.target.value !== CUSTOM_MODEL) updateModelSettings(id, { modelId: e.target.value });
                        }}
                      >
                        {providerModels[id].map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                        <option value={CUSTOM_MODEL}>Personnalisé…</option>
                      </select>
                    </div>
                    <input
                      className="input mono w-full py-0.5 text-[11px]"
                      value={ms.modelId}
                      onChange={(e) => updateModelSettings(id, { modelId: e.target.value })}
                      placeholder="id du modèle (saisie libre)"
                      spellCheck={false}
                    />
                  </div>
                  <label className="flex items-center justify-between gap-2">
                    <span>Recherche web</span>
                    <input
                      type="checkbox"
                      checked={ms.webSearch}
                      onChange={(e) => updateModelSettings(id, { webSearch: e.target.checked })}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2">
                    <span>Température</span>
                    <input
                      type="number"
                      min={0}
                      max={2}
                      step={0.1}
                      className="input w-20 py-0.5"
                      value={ms.temperature}
                      onChange={(e) => updateModelSettings(id, { temperature: Number(e.target.value) })}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2">
                    <span>Max tokens</span>
                    <input
                      type="number"
                      min={128}
                      step={128}
                      className="input w-24 py-0.5"
                      value={ms.maxTokens}
                      onChange={(e) => updateModelSettings(id, { maxTokens: Number(e.target.value) })}
                    />
                  </label>

                  {id === 'deepseek' && (
                    <>
                      <label className="flex items-center justify-between gap-2">
                        <span>Mode recherche</span>
                        <select
                          className="input w-28 py-0.5"
                          value={(ms.options.webSearchMode as string) ?? 'bridge'}
                          onChange={(e) => updateModelSettings(id, { options: { ...ms.options, webSearchMode: e.target.value } })}
                        >
                          <option value="bridge">bridge</option>
                          <option value="native">native</option>
                        </select>
                      </label>
                      <label className="flex items-center justify-between gap-2">
                        <span>Fournisseur pont</span>
                        <select
                          className="input w-28 py-0.5"
                          value={(ms.options.bridgeProviderId as string) ?? 'qwen'}
                          onChange={(e) => updateModelSettings(id, { options: { ...ms.options, bridgeProviderId: e.target.value } })}
                        >
                          <option value="qwen">Qwen</option>
                          <option value="glm">GLM</option>
                        </select>
                      </label>
                    </>
                  )}

                  {id === 'chatgpt' && (
                    <label className="flex items-center justify-between gap-2">
                      <span>Fournisseur pont</span>
                      <select
                        className="input w-28 py-0.5"
                        value={(ms.options.bridgeProviderId as string) ?? 'qwen'}
                        onChange={(e) => updateModelSettings(id, { options: { ...ms.options, bridgeProviderId: e.target.value } })}
                      >
                        <option value="qwen">Qwen</option>
                        <option value="glm">GLM</option>
                      </select>
                    </label>
                  )}

                  {id === 'qwen' && (
                    <>
                      <label className="flex items-center justify-between gap-2">
                        <span>Région</span>
                        <select
                          className="input w-28 py-0.5"
                          value={(ms.options.region as string) ?? 'intl'}
                          onChange={(e) => updateModelSettings(id, { options: { ...ms.options, region: e.target.value } })}
                        >
                          <option value="intl">Internationale</option>
                          <option value="cn">Chine continentale</option>
                        </select>
                      </label>
                      <label className="flex items-center justify-between gap-2">
                        <span>Stratégie</span>
                        <select
                          className="input w-28 py-0.5"
                          value={(ms.options.searchStrategy as string) ?? 'agent'}
                          onChange={(e) => updateModelSettings(id, { options: { ...ms.options, searchStrategy: e.target.value } })}
                        >
                          <option value="turbo">turbo</option>
                          <option value="max">max</option>
                          <option value="agent">agent</option>
                          <option value="agent_max">agent_max</option>
                        </select>
                      </label>
                      <label className="flex items-center justify-between gap-2">
                        <span>Mode réflexion</span>
                        <input
                          type="checkbox"
                          checked={Boolean(ms.options.enableThinking)}
                          onChange={(e) => updateModelSettings(id, { options: { ...ms.options, enableThinking: e.target.checked } })}
                        />
                      </label>
                    </>
                  )}

                  {id === 'kimi' && (
                    <label className="flex items-center justify-between gap-2">
                      <span>Région</span>
                      <select
                        className="input w-28 py-0.5"
                        value={(ms.options.region as string) ?? 'global'}
                        onChange={(e) => updateModelSettings(id, { options: { ...ms.options, region: e.target.value } })}
                      >
                        <option value="global">.ai (global)</option>
                        <option value="cn">.cn</option>
                      </select>
                    </label>
                  )}

                  {id === 'glm' && (
                    <label className="flex items-center justify-between gap-2">
                      <span>Résultats max</span>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        className="input w-20 py-0.5"
                        value={(ms.options.resultCount as number) ?? 10}
                        onChange={(e) => updateModelSettings(id, { options: { ...ms.options, resultCount: Number(e.target.value) } })}
                      />
                    </label>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
