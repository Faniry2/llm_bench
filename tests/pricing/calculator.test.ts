import { describe, expect, it } from 'vitest';
import { computeCost, projectCost, estimateMonthlyCost, sumUsage } from '../../src/pricing/calculator.js';
import { defaultRates } from '../../src/pricing/rates.js';
import type { TokenUsage } from '../../src/providers/types.js';

function usage(overrides: Partial<TokenUsage> = {}): TokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    webSearchCalls: 0,
    ...overrides
  };
}

describe('computeCost', () => {
  it('applies input/output/cache rates for GLM without peak or tiers', () => {
    const u = usage({ inputTokens: 1_000_000, outputTokens: 500_000, webSearchCalls: 2 });
    const result = computeCost(u, defaultRates.glm);
    expect(result.inputCost).toBeCloseTo(1.4, 6);
    expect(result.outputCost).toBeCloseTo(2.2, 6);
    expect(result.webSearchCost).toBeCloseTo(0.02, 6);
    expect(result.totalCost).toBeCloseTo(1.4 + 2.2 + 0.02, 6);
  });

  it('splits cached vs non-cached input tokens for DeepSeek off-peak', () => {
    const u = usage({ inputTokens: 1_000_000, cachedInputTokens: 400_000, outputTokens: 200_000 });
    const result = computeCost(u, defaultRates.deepseek, { deepseekPricingMode: 'off-peak' });
    const expectedInput = (600_000 / 1e6) * 0.435;
    const expectedCached = (400_000 / 1e6) * 0.003625;
    const expectedOutput = (200_000 / 1e6) * 0.87;
    expect(result.inputCost).toBeCloseTo(expectedInput, 6);
    expect(result.cachedInputCost).toBeCloseTo(expectedCached, 6);
    expect(result.outputCost).toBeCloseTo(expectedOutput, 6);
  });

  it('uses DeepSeek peak rates when forced to peak', () => {
    const u = usage({ inputTokens: 1_000_000, outputTokens: 1_000_000 });
    const offPeak = computeCost(u, defaultRates.deepseek, { deepseekPricingMode: 'off-peak' });
    const peak = computeCost(u, defaultRates.deepseek, { deepseekPricingMode: 'peak' });
    expect(peak.totalCost).toBeGreaterThan(offPeak.totalCost);
  });

  it('selects the correct Qwen context tier from input tokens', () => {
    const small = usage({ inputTokens: 100_000, outputTokens: 100_000 });
    const large = usage({ inputTokens: 500_000, outputTokens: 100_000 });
    const smallCost = computeCost(small, defaultRates.qwen);
    const largeCost = computeCost(large, defaultRates.qwen);
    // large uses the >256K tier at double the per-token input rate
    expect(largeCost.inputCost / large.inputTokens).toBeGreaterThan(smallCost.inputCost / small.inputTokens);
  });

  it('charges Kimi web search calls per call, accumulated across tool rounds', () => {
    const u = usage({ inputTokens: 10_000, outputTokens: 2_000, webSearchCalls: 3 });
    const result = computeCost(u, defaultRates.kimi);
    expect(result.webSearchCost).toBeCloseTo(3 * defaultRates.kimi.webSearchCostPerCall, 6);
  });

  it('never produces a negative cost when cachedInputTokens exceeds inputTokens due to bad data', () => {
    const u = usage({ inputTokens: 100, cachedInputTokens: 500, outputTokens: 0 });
    const result = computeCost(u, defaultRates.deepseek, { deepseekPricingMode: 'off-peak' });
    expect(result.inputCost).toBeGreaterThanOrEqual(0);
  });
});

describe('projections', () => {
  it('projects linear cost over N runs', () => {
    expect(projectCost(0.05, 100)).toBeCloseTo(5, 6);
  });

  it('estimates monthly cost from runs/day', () => {
    expect(estimateMonthlyCost(0.05, 10, 30)).toBeCloseTo(15, 6);
  });
});

describe('sumUsage', () => {
  it('sums token usage across multiple runs', () => {
    const total = sumUsage([
      usage({ inputTokens: 10, outputTokens: 5, webSearchCalls: 1 }),
      usage({ inputTokens: 20, outputTokens: 15, webSearchCalls: 2 })
    ]);
    expect(total.inputTokens).toBe(30);
    expect(total.outputTokens).toBe(20);
    expect(total.webSearchCalls).toBe(3);
  });
});
