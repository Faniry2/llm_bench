import React from 'react';
import { useRunStore, PROVIDER_IDS } from '../store/useRunStore.js';
import { isRateStale } from '../../pricing/rates.js';
import type { ProviderId } from '../../providers/types.js';
import type { RateCard } from '../../pricing/rates.js';

const LABELS: Record<ProviderId, string> = {
  deepseek: 'DeepSeek V4 Pro',
  qwen: 'Qwen 3.7 Plus',
  kimi: 'Kimi K2.6',
  glm: 'GLM-5.1'
};

export default function CostSettings(): React.ReactElement {
  const rates = useRunStore((s) => s.rates);
  const setRates = useRunStore((s) => s.setRates);
  const usdToEur = useRunStore((s) => s.usdToEur);
  const setUsdToEur = useRunStore((s) => s.setUsdToEur);
  const deepseekPricingMode = useRunStore((s) => s.deepseekPricingMode);
  const setDeepseekPricingMode = useRunStore((s) => s.setDeepseekPricingMode);

  if (!rates) return <p className="text-sm text-slate-500">Chargement des tarifs…</p>;

  function updateRate(id: ProviderId, patch: Partial<RateCard>) {
    void setRates({ ...rates!, [id]: { ...rates![id], ...patch, lastVerified: new Date().toISOString().slice(0, 10) } });
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-slate-300">Tarifs (par million de tokens, $)</h2>

      <label className="flex items-center justify-between text-sm">
        <span>Taux de change $ → €</span>
        <input
          type="number"
          step={0.01}
          className="input w-24"
          value={usdToEur}
          onChange={(e) => setUsdToEur(Number(e.target.value))}
        />
      </label>

      <label className="flex items-center justify-between text-sm">
        <span>Pricing DeepSeek (heures pleines/creuses)</span>
        <select
          className="input w-32"
          value={deepseekPricingMode}
          onChange={(e) => setDeepseekPricingMode(e.target.value as 'auto' | 'peak' | 'off-peak')}
        >
          <option value="auto">Auto (UTC)</option>
          <option value="peak">Heures pleines</option>
          <option value="off-peak">Heures creuses</option>
        </select>
      </label>

      {PROVIDER_IDS.map((id) => {
        const rate = rates[id];
        const stale = isRateStale(rate);
        return (
          <div key={id} className="card p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium">{LABELS[id]}</h3>
              <span className="text-[10px] text-slate-500">vérifié le {rate.lastVerified}</span>
            </div>
            {stale && (
              <p className="mb-2 rounded bg-amber-500/20 px-2 py-1 text-xs text-amber-300">
                ⚠️ Tarifs saisis manuellement — à revérifier (plus de 30 jours)
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <NumberField label="Input / M" value={rate.inputPerM} onChange={(v) => updateRate(id, { inputPerM: v })} />
              <NumberField label="Cache hit / M" value={rate.cachedInputPerM} onChange={(v) => updateRate(id, { cachedInputPerM: v })} />
              <NumberField label="Output / M" value={rate.outputPerM} onChange={(v) => updateRate(id, { outputPerM: v })} />
              <NumberField
                label="Recherche $/appel"
                value={rate.webSearchCostPerCall}
                onChange={(v) => updateRate(id, { webSearchCostPerCall: v })}
              />
            </div>
            <label className="mt-2 flex flex-col gap-1 text-xs">
              <span className="text-slate-500">Source</span>
              <input
                className="input"
                value={rate.sourceUrl}
                onChange={(e) => updateRate(id, { sourceUrl: e.target.value })}
              />
            </label>

            {id === 'deepseek' && rate.peak && (
              <div className="mt-2 border-t border-slate-800 pt-2">
                <p className="mb-1 text-xs text-slate-500">Heures pleines (UTC 1-4h, 6-10h)</p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <NumberField
                    label="Input peak"
                    value={rate.peak.inputPerM}
                    onChange={(v) => updateRate(id, { peak: { ...rate.peak!, inputPerM: v } })}
                  />
                  <NumberField
                    label="Cache peak"
                    value={rate.peak.cachedInputPerM}
                    onChange={(v) => updateRate(id, { peak: { ...rate.peak!, cachedInputPerM: v } })}
                  />
                  <NumberField
                    label="Output peak"
                    value={rate.peak.outputPerM}
                    onChange={(v) => updateRate(id, { peak: { ...rate.peak!, outputPerM: v } })}
                  />
                </div>
              </div>
            )}

            {id === 'qwen' && rate.contextTiers && (
              <div className="mt-2 border-t border-slate-800 pt-2">
                <p className="mb-1 text-xs text-slate-500">Paliers de contexte</p>
                {rate.contextTiers.map((tier, i) => (
                  <div key={i} className="mb-1 grid grid-cols-3 gap-2 text-xs">
                    <NumberField
                      label="Max ctx"
                      value={tier.maxContext}
                      onChange={(v) => {
                        const tiers = [...rate.contextTiers!];
                        tiers[i] = { ...tiers[i], maxContext: v };
                        updateRate(id, { contextTiers: tiers });
                      }}
                    />
                    <NumberField
                      label="Input"
                      value={tier.inputPerM}
                      onChange={(v) => {
                        const tiers = [...rate.contextTiers!];
                        tiers[i] = { ...tiers[i], inputPerM: v };
                        updateRate(id, { contextTiers: tiers });
                      }}
                    />
                    <NumberField
                      label="Output"
                      value={tier.outputPerM}
                      onChange={(v) => {
                        const tiers = [...rate.contextTiers!];
                        tiers[i] = { ...tiers[i], outputPerM: v };
                        updateRate(id, { contextTiers: tiers });
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-slate-500">{label}</span>
      <input
        type="number"
        step="any"
        className="input py-1"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
