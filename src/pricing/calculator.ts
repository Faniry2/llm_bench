import type { TokenUsage } from '../providers/types.js';
import { type RateCard, isDeepseekPeakHour, pickQwenTier } from './rates.js';

export interface CostBreakdown {
  inputCost: number;
  cachedInputCost: number;
  outputCost: number;
  webSearchCost: number;
  totalCost: number;
  currency: 'USD';
  usdPerKTokens: number;
}

export interface CostOptions {
  /** deepseek: force peak/off-peak instead of auto-detecting from current UTC time. */
  deepseekPricingMode?: 'auto' | 'peak' | 'off-peak';
  now?: Date;
  /** manual $ -> € exchange rate, e.g. 0.92 */
  usdToEur?: number;
}

/**
 * cost = (input - cached) * inputPerM/1e6
 *      + cached * cachedInputPerM/1e6
 *      + output * outputPerM/1e6
 *      + webSearchCalls * webSearchCostPerCall
 *
 * Reasoning tokens are already included in usage.outputTokens by the
 * providers (billed at the output rate) but are also reported separately
 * upstream for display.
 */
export function computeCost(usage: TokenUsage, rate: RateCard, options: CostOptions = {}): CostBreakdown {
  let inputPerM = rate.inputPerM;
  let cachedInputPerM = rate.cachedInputPerM;
  let outputPerM = rate.outputPerM;

  if (rate.providerId === 'deepseek' && rate.peak) {
    const mode = options.deepseekPricingMode ?? 'auto';
    const isPeak = mode === 'auto' ? isDeepseekPeakHour(options.now) : mode === 'peak';
    if (isPeak) {
      inputPerM = rate.peak.inputPerM;
      cachedInputPerM = rate.peak.cachedInputPerM;
      outputPerM = rate.peak.outputPerM;
    }
  }

  if (rate.providerId === 'qwen' && rate.contextTiers) {
    const tier = pickQwenTier(rate, usage.inputTokens);
    inputPerM = tier.inputPerM;
    outputPerM = tier.outputPerM;
  }

  const billableInput = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  const inputCost = (billableInput / 1e6) * inputPerM;
  const cachedInputCost = (usage.cachedInputTokens / 1e6) * cachedInputPerM;
  const outputCost = (usage.outputTokens / 1e6) * outputPerM;
  const webSearchCost = usage.webSearchCalls * rate.webSearchCostPerCall;
  const totalCost = inputCost + cachedInputCost + outputCost + webSearchCost;

  return {
    inputCost,
    cachedInputCost,
    outputCost,
    webSearchCost,
    totalCost,
    currency: 'USD',
    usdPerKTokens: usage.totalTokens > 0 ? (totalCost / usage.totalTokens) * 1000 : 0
  };
}

export function usdToEur(amountUsd: number, rate: number): number {
  return amountUsd * rate;
}

export function projectCost(perRunCostUsd: number, runs: number): number {
  return perRunCostUsd * runs;
}

export function estimateMonthlyCost(perRunCostUsd: number, runsPerDay: number, daysPerMonth = 30): number {
  return perRunCostUsd * runsPerDay * daysPerMonth;
}

export function sumUsage(usages: TokenUsage[]): TokenUsage {
  return usages.reduce(
    (acc, u) => ({
      inputTokens: acc.inputTokens + u.inputTokens,
      outputTokens: acc.outputTokens + u.outputTokens,
      cachedInputTokens: acc.cachedInputTokens + u.cachedInputTokens,
      reasoningTokens: acc.reasoningTokens + u.reasoningTokens,
      totalTokens: acc.totalTokens + u.totalTokens,
      webSearchCalls: acc.webSearchCalls + u.webSearchCalls
    }),
    { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningTokens: 0, totalTokens: 0, webSearchCalls: 0 }
  );
}
