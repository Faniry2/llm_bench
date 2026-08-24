import { create } from 'zustand';
import type { ProviderId, RunResult, StreamDelta } from '../../providers/types.js';
import type { RateCard } from '../../pricing/rates.js';
import { computeCost } from '../../pricing/calculator.js';
import { RESTAURANT_TEMPLATE } from '../templates/restaurantTemplate.js';

export interface LiveCardState {
  status: 'idle' | 'running' | 'success' | 'error' | 'cancelled';
  content: string;
  reasoning: string;
  rounds: number;
  sources: { title: string; url: string; snippet?: string }[];
  startedAt?: number;
  finishedAt?: number;
  result?: RunResult;
}

export interface ModelSettings {
  enabled: boolean;
  webSearch: boolean;
  temperature: number;
  maxTokens: number;
  options: Record<string, unknown>;
}

export interface HistoryEntry {
  id: string;
  timestamp: string;
  prompt: string;
  variables: Record<string, string>;
  results: Partial<Record<ProviderId, RunResult>>;
  totalCostUsd: number;
}

const PROVIDER_IDS: ProviderId[] = ['deepseek', 'qwen', 'kimi', 'glm'];
let listenersRegistered = false;

function defaultModelSettings(): Record<ProviderId, ModelSettings> {
  return {
    deepseek: { enabled: true, webSearch: true, temperature: 1, maxTokens: 4096, options: { webSearchMode: 'bridge', bridgeProviderId: 'qwen' } },
    qwen: { enabled: true, webSearch: true, temperature: 1, maxTokens: 4096, options: { region: 'intl', searchStrategy: 'agent', forcedSearch: true } },
    kimi: { enabled: true, webSearch: true, temperature: 1, maxTokens: 4096, options: { region: 'global' } },
    glm: { enabled: true, webSearch: true, temperature: 1, maxTokens: 4096, options: { searchEngine: 'search_pro_jina', resultCount: 10 } }
  };
}

function extractVariables(prompt: string): string[] {
  const matches = [...prompt.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)];
  return [...new Set(matches.map((m) => m[1]))];
}

function fillVariables(prompt: string, variables: Record<string, string>): string {
  return prompt.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, name: string) => variables[name] ?? `{{${name}}}`);
}

interface RunStore {
  prompt: string;
  variables: Record<string, string>;
  detectedVariableNames: string[];
  modelSettings: Record<ProviderId, ModelSettings>;
  globalWebSearch: boolean;
  runId: string | null;
  isRunning: boolean;
  live: Record<ProviderId, LiveCardState>;
  rates: Record<ProviderId, RateCard> | null;
  usdToEur: number;
  deepseekPricingMode: 'auto' | 'peak' | 'off-peak';
  keysPresent: Partial<Record<ProviderId, boolean>>;
  history: HistoryEntry[];
  theme: 'dark' | 'light';
  compareSelection: [ProviderId, ProviderId] | null;
  pinned: Partial<Record<ProviderId, boolean>>;
  projectionRuns: number;
  runsPerDay: number;

  setPrompt: (prompt: string) => void;
  setVariable: (name: string, value: string) => void;
  toggleModel: (id: ProviderId) => void;
  updateModelSettings: (id: ProviderId, patch: Partial<ModelSettings>) => void;
  setGlobalWebSearch: (value: boolean) => void;
  loadTemplate: () => void;
  init: () => Promise<void>;
  startRun: () => Promise<void>;
  cancelRun: (providerId?: ProviderId) => Promise<void>;
  rerunOne: (providerId: ProviderId) => Promise<void>;
  setRates: (rates: Record<ProviderId, RateCard>) => Promise<void>;
  setUsdToEur: (rate: number) => void;
  setDeepseekPricingMode: (mode: 'auto' | 'peak' | 'off-peak') => void;
  setApiKey: (id: ProviderId, key: string) => Promise<void>;
  testApiKey: (id: ProviderId) => Promise<boolean>;
  refreshKeysPresent: () => Promise<void>;
  toggleTheme: () => void;
  togglePin: (id: ProviderId) => void;
  setCompareSelection: (sel: [ProviderId, ProviderId] | null) => void;
  refreshHistory: () => Promise<void>;
  clearHistory: () => Promise<void>;
  deleteHistoryEntry: (id: string) => Promise<void>;
  replayHistoryEntry: (entry: HistoryEntry) => void;
  setProjectionRuns: (n: number) => void;
  setRunsPerDay: (n: number) => void;
}

function emptyLive(): LiveCardState {
  return { status: 'idle', content: '', reasoning: '', rounds: 0, sources: [] };
}

export const useRunStore = create<RunStore>((set, get) => ({
  prompt: RESTAURANT_TEMPLATE,
  variables: { nom_restaurant: '', adresse: '', pays: '', date_analyse: new Date().toISOString().slice(0, 10) },
  detectedVariableNames: extractVariables(RESTAURANT_TEMPLATE),
  modelSettings: defaultModelSettings(),
  globalWebSearch: true,
  runId: null,
  isRunning: false,
  live: { deepseek: emptyLive(), qwen: emptyLive(), kimi: emptyLive(), glm: emptyLive() },
  rates: null,
  usdToEur: 0.92,
  deepseekPricingMode: 'auto',
  keysPresent: {},
  history: [],
  theme: 'dark',
  compareSelection: null,
  pinned: {},
  projectionRuns: 100,
  runsPerDay: 20,

  setPrompt: (prompt) => set({ prompt, detectedVariableNames: extractVariables(prompt) }),
  setVariable: (name, value) => set((s) => ({ variables: { ...s.variables, [name]: value } })),
  toggleModel: (id) =>
    set((s) => ({ modelSettings: { ...s.modelSettings, [id]: { ...s.modelSettings[id], enabled: !s.modelSettings[id].enabled } } })),
  updateModelSettings: (id, patch) =>
    set((s) => ({ modelSettings: { ...s.modelSettings, [id]: { ...s.modelSettings[id], ...patch } } })),
  setGlobalWebSearch: (value) =>
    set((s) => {
      const modelSettings = { ...s.modelSettings };
      for (const id of PROVIDER_IDS) modelSettings[id] = { ...modelSettings[id], webSearch: value };
      return { globalWebSearch: value, modelSettings };
    }),
  loadTemplate: () => set({ prompt: RESTAURANT_TEMPLATE, detectedVariableNames: extractVariables(RESTAURANT_TEMPLATE) }),

  init: async () => {
    if (listenersRegistered) return;
    listenersRegistered = true;
    const [settings, rates, keysPresent, history, promptState] = await Promise.all([
      window.chinallm.settings.get(),
      window.chinallm.rates.get(),
      window.chinallm.keys.has(),
      window.chinallm.history.get(),
      window.chinallm.promptState.get()
    ]);
    set({
      rates,
      keysPresent,
      history: history as HistoryEntry[],
      usdToEur: (settings.usdToEur as number) ?? 0.92,
      deepseekPricingMode: (settings.deepseekPricingMode as 'auto' | 'peak' | 'off-peak') ?? 'auto',
      theme: (settings.theme as 'dark' | 'light') ?? 'dark'
    });
    if (promptState.prompt) {
      set({ prompt: promptState.prompt, variables: promptState.variables, detectedVariableNames: extractVariables(promptState.prompt) });
    }
    document.documentElement.classList.toggle('dark', get().theme === 'dark');

    window.chinallm.run.onDelta(({ providerId, delta }: { providerId: ProviderId; delta: StreamDelta }) => {
      set((s) => {
        const card = { ...s.live[providerId] };
        if (delta.type === 'content') card.content += delta.text ?? '';
        if (delta.type === 'reasoning') card.reasoning += delta.text ?? '';
        if (delta.type === 'round') card.rounds = delta.round ?? card.rounds;
        if (delta.type === 'source' && delta.source) card.sources = [...card.sources, delta.source];
        return { live: { ...s.live, [providerId]: card } };
      });
    });

    window.chinallm.run.onResult(({ result }: { result: RunResult }) => {
      set((s) => ({
        live: {
          ...s.live,
          [result.providerId]: {
            ...s.live[result.providerId],
            status: result.status,
            content: result.content || s.live[result.providerId].content,
            reasoning: result.reasoningContent || s.live[result.providerId].reasoning,
            rounds: result.rounds,
            sources: result.sources.length ? result.sources : s.live[result.providerId].sources,
            finishedAt: Date.now(),
            result
          }
        }
      }));
    });

    window.chinallm.run.onDone(async () => {
      set({ isRunning: false });
      const s = get();
      const results: Partial<Record<ProviderId, RunResult>> = {};
      let totalCostUsd = 0;
      for (const id of PROVIDER_IDS) {
        const r = s.live[id].result;
        if (r) {
          results[id] = r;
          if (s.rates) totalCostUsd += computeCost(r.usage, s.rates[id], { deepseekPricingMode: s.deepseekPricingMode }).totalCost;
        }
      }
      const entry: HistoryEntry = {
        id: s.runId ?? crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        prompt: s.prompt,
        variables: s.variables,
        results,
        totalCostUsd
      };
      await window.chinallm.history.push(entry);
      await get().refreshHistory();
    });
  },

  startRun: async () => {
    const s = get();
    await window.chinallm.promptState.set(s.prompt, s.variables);
    const filledPrompt = fillVariables(s.prompt, s.variables);
    const models = PROVIDER_IDS.filter((id) => s.modelSettings[id].enabled).map((id) => {
      const ms = s.modelSettings[id];
      return { providerId: id, webSearch: ms.webSearch, temperature: ms.temperature, maxTokens: ms.maxTokens, options: ms.options };
    });
    const live: Record<ProviderId, LiveCardState> = { deepseek: emptyLive(), qwen: emptyLive(), kimi: emptyLive(), glm: emptyLive() };
    for (const m of models) live[m.providerId] = { ...emptyLive(), status: 'running', startedAt: Date.now() };
    set({ live, isRunning: true });
    const runId = await window.chinallm.run.start({ prompt: filledPrompt, models });
    set({ runId });
  },

  cancelRun: async (providerId) => {
    const { runId } = get();
    if (!runId) return;
    await window.chinallm.run.cancel(runId, providerId);
  },

  rerunOne: async (providerId) => {
    const s = get();
    if (!s.modelSettings[providerId].enabled) return;
    await window.chinallm.promptState.set(s.prompt, s.variables);
    const filledPrompt = fillVariables(s.prompt, s.variables);
    const ms = s.modelSettings[providerId];
    set((state) => ({ live: { ...state.live, [providerId]: { ...emptyLive(), status: 'running', startedAt: Date.now() } }, isRunning: true }));
    const runId = await window.chinallm.run.start({
      prompt: filledPrompt,
      models: [{ providerId, webSearch: ms.webSearch, temperature: ms.temperature, maxTokens: ms.maxTokens, options: ms.options }]
    });
    set({ runId });
  },

  setRates: async (rates) => {
    await window.chinallm.rates.set(rates);
    set({ rates });
  },
  setUsdToEur: (rate) => {
    set({ usdToEur: rate });
    void window.chinallm.settings.set('usdToEur', rate);
  },
  setDeepseekPricingMode: (mode) => {
    set({ deepseekPricingMode: mode });
    void window.chinallm.settings.set('deepseekPricingMode', mode);
  },

  setApiKey: async (id, key) => {
    await window.chinallm.keys.set(id, key);
    await get().refreshKeysPresent();
  },
  testApiKey: (id) => window.chinallm.keys.test(id),
  refreshKeysPresent: async () => {
    const keysPresent = await window.chinallm.keys.has();
    set({ keysPresent });
  },

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    set({ theme: next });
    document.documentElement.classList.toggle('dark', next === 'dark');
    void window.chinallm.settings.set('theme', next);
  },

  togglePin: (id) => set((s) => ({ pinned: { ...s.pinned, [id]: !s.pinned[id] } })),
  setCompareSelection: (sel) => set({ compareSelection: sel }),

  refreshHistory: async () => {
    const history = (await window.chinallm.history.get()) as HistoryEntry[];
    set({ history });
  },
  clearHistory: async () => {
    await window.chinallm.history.clear();
    set({ history: [] });
  },
  deleteHistoryEntry: async (id) => {
    await window.chinallm.history.delete(id);
    await get().refreshHistory();
  },
  replayHistoryEntry: (entry) => {
    set({ prompt: entry.prompt, variables: entry.variables, detectedVariableNames: extractVariables(entry.prompt) });
  },

  setProjectionRuns: (n) => set({ projectionRuns: n }),
  setRunsPerDay: (n) => set({ runsPerDay: n })
}));

export { PROVIDER_IDS, fillVariables };
