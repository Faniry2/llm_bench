import { safeStorage } from 'electron';
import Store from 'electron-store';
import type { ProviderId } from '../providers/types.js';
import { envKeyNames } from '../providers/registry.js';
import { defaultRates, type RateCard } from '../pricing/rates.js';

interface StoreSchema {
  encryptedKeys: Partial<Record<ProviderId, string>>; // base64 of the encrypted buffer
  rates: Record<ProviderId, RateCard>;
  usdToEur: number;
  region: { qwen: 'intl' | 'cn'; kimi: 'global' | 'cn' };
  deepseekWebSearchMode: 'native' | 'bridge';
  deepseekBridgeProvider: 'qwen' | 'glm';
  deepseekPricingMode: 'auto' | 'peak' | 'off-peak';
  theme: 'dark' | 'light';
  history: unknown[];
  lastPrompt: string;
  lastVariables: Record<string, string>;
  lastKnowledgeDoc: { name: string; content: string } | null;
}

const store = new Store<StoreSchema>({
  name: 'chinallm-bench',
  defaults: {
    encryptedKeys: {},
    rates: defaultRates,
    usdToEur: 0.92,
    region: { qwen: 'intl', kimi: 'global' },
    deepseekWebSearchMode: 'bridge',
    deepseekBridgeProvider: 'qwen',
    deepseekPricingMode: 'auto',
    theme: 'dark',
    history: [],
    lastPrompt: '',
    lastVariables: {},
    lastKnowledgeDoc: null
  }
});

export function setApiKey(providerId: ProviderId, plainKey: string): void {
  if (!plainKey) {
    const all = store.get('encryptedKeys');
    delete all[providerId];
    store.set('encryptedKeys', all);
    return;
  }
  const encrypted = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(plainKey)
    : Buffer.from(plainKey, 'utf-8'); // fallback (should not happen on Windows)
  const all = store.get('encryptedKeys');
  all[providerId] = encrypted.toString('base64');
  store.set('encryptedKeys', all);
}

export function getApiKey(providerId: ProviderId): string | undefined {
  const all = store.get('encryptedKeys');
  const stored = all[providerId];
  if (stored) {
    try {
      const buffer = Buffer.from(stored, 'base64');
      return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buffer) : buffer.toString('utf-8');
    } catch {
      // fall through to env var
    }
  }
  return process.env[envKeyNames[providerId]];
}

export function hasApiKey(providerId: ProviderId): boolean {
  return Boolean(getApiKey(providerId));
}

export function getRates(): Record<ProviderId, RateCard> {
  // Merge over defaults so a provider added after the store was first written
  // (e.g. chatgpt) still has a rate card instead of being undefined.
  return { ...defaultRates, ...store.get('rates') };
}

export function setRates(rates: Record<ProviderId, RateCard>): void {
  store.set('rates', rates);
}

export function getSettings() {
  return {
    usdToEur: store.get('usdToEur'),
    region: store.get('region'),
    deepseekWebSearchMode: store.get('deepseekWebSearchMode'),
    deepseekBridgeProvider: store.get('deepseekBridgeProvider'),
    deepseekPricingMode: store.get('deepseekPricingMode'),
    theme: store.get('theme')
  };
}

export function setSetting<K extends keyof StoreSchema>(key: K, value: StoreSchema[K]): void {
  store.set(key, value);
}

export function getHistory(): unknown[] {
  return store.get('history');
}

export function pushHistory(entry: unknown, max = 200): void {
  const history = store.get('history');
  history.unshift(entry);
  store.set('history', history.slice(0, max));
}

export function clearHistory(): void {
  store.set('history', []);
}

export function deleteHistoryEntry(id: string): void {
  const history = store.get('history') as { id: string }[];
  store.set('history', history.filter((h) => h.id !== id));
}

export function getLastPromptState() {
  return { prompt: store.get('lastPrompt'), variables: store.get('lastVariables') };
}

export function setLastPromptState(prompt: string, variables: Record<string, string>): void {
  store.set('lastPrompt', prompt);
  store.set('lastVariables', variables);
}

export function getKnowledgeDoc(): { name: string; content: string } | null {
  return store.get('lastKnowledgeDoc');
}

export function setKnowledgeDoc(doc: { name: string; content: string } | null): void {
  store.set('lastKnowledgeDoc', doc);
}

export default store;
