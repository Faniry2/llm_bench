import type { ProviderId } from '../providers/types.js';

export interface ContextTier {
  maxContext: number;
  inputPerM: number;
  outputPerM: number;
}

export interface RateCard {
  providerId: ProviderId;
  modelId: string;
  inputPerM: number;
  cachedInputPerM: number;
  outputPerM: number;
  webSearchCostPerCall: number;
  currency: 'USD';
  lastVerified: string; // ISO date
  sourceUrl: string;
  /** DeepSeek-only: off-peak vs peak pricing (UTC hours). */
  peak?: {
    inputPerM: number;
    cachedInputPerM: number;
    outputPerM: number;
    hoursUtc: [number, number][]; // inclusive-exclusive ranges, e.g. [[1,4],[6,10]]
  };
  /** Qwen-only: pricing tiers by input context length. */
  contextTiers?: ContextTier[];
}

export const defaultRates: Record<ProviderId, RateCard> = {
  deepseek: {
    providerId: 'deepseek',
    modelId: 'deepseek-v4-pro',
    inputPerM: 0.435,
    cachedInputPerM: 0.003625,
    outputPerM: 0.87,
    webSearchCostPerCall: 0, // pontée : le coût est déjà porté par le fournisseur de pontage
    currency: 'USD',
    lastVerified: '2026-08-24',
    sourceUrl: 'https://api-docs.deepseek.com/quick_start/pricing',
    peak: {
      inputPerM: 0.87,
      cachedInputPerM: 0.00725,
      outputPerM: 1.74,
      hoursUtc: [
        [1, 4],
        [6, 10]
      ]
    }
  },
  qwen: {
    providerId: 'qwen',
    modelId: 'qwen3.7-plus',
    inputPerM: 0.4,
    cachedInputPerM: 0.4,
    outputPerM: 1.6,
    webSearchCostPerCall: 0,
    currency: 'USD',
    lastVerified: '2026-08-24',
    sourceUrl: 'https://www.alibabacloud.com/help/en/model-studio/models',
    contextTiers: [
      { maxContext: 256_000, inputPerM: 0.4, outputPerM: 1.6 },
      { maxContext: 1_000_000, inputPerM: 0.8, outputPerM: 3.2 }
    ]
  },
  kimi: {
    providerId: 'kimi',
    modelId: 'kimi-k2.6',
    inputPerM: 0.95,
    cachedInputPerM: 0.95,
    outputPerM: 4.0,
    webSearchCostPerCall: 0.005,
    currency: 'USD',
    lastVerified: '2026-08-24',
    sourceUrl: 'https://platform.moonshot.ai/docs/pricing'
  },
  glm: {
    providerId: 'glm',
    modelId: 'glm-5.1',
    inputPerM: 1.4,
    cachedInputPerM: 1.4,
    outputPerM: 4.4,
    webSearchCostPerCall: 0.01,
    currency: 'USD',
    lastVerified: '2026-08-24',
    sourceUrl: 'https://docs.z.ai/guides/pricing'
  },
  chatgpt: {
    providerId: 'chatgpt',
    modelId: 'gpt-5.6-luna',
    inputPerM: 0.2,
    cachedInputPerM: 0.02,
    outputPerM: 1.2,
    webSearchCostPerCall: 0, // pontée : le coût est déjà porté par le fournisseur de pontage
    currency: 'USD',
    lastVerified: '2026-09-14',
    sourceUrl: 'https://platform.openai.com/docs/pricing'
  }
};

export function isRateStale(rate: RateCard, now: Date = new Date()): boolean {
  const last = new Date(rate.lastVerified).getTime();
  const days = (now.getTime() - last) / (1000 * 60 * 60 * 24);
  return days > 30;
}

export function isDeepseekPeakHour(date: Date = new Date()): boolean {
  const hour = date.getUTCHours();
  const rate = defaultRates.deepseek.peak;
  if (!rate) return false;
  return rate.hoursUtc.some(([start, end]) => hour >= start && hour < end);
}

export function pickQwenTier(rate: RateCard, inputTokens: number): { inputPerM: number; outputPerM: number } {
  const tiers = rate.contextTiers;
  if (!tiers || tiers.length === 0) return { inputPerM: rate.inputPerM, outputPerM: rate.outputPerM };
  const tier = tiers.find((t) => inputTokens <= t.maxContext) ?? tiers[tiers.length - 1];
  return { inputPerM: tier.inputPerM, outputPerM: tier.outputPerM };
}
