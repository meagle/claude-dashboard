import type { ModelPricingEntry, DashboardConfig } from '../types';

// Cost per million tokens (USD), by model family
// Prices: input / cache_write / cache_read / output
export const MODEL_PRICING: Array<[prefix: string, pricing: ModelPricingEntry]> = [
  ['claude-opus-4',    { input: 15,   cacheWrite: 18.75, cacheRead: 1.5,  output: 75  }],
  ['claude-sonnet-4',  { input: 3,    cacheWrite: 3.75,  cacheRead: 0.3,  output: 15  }],
  ['claude-haiku-4',   { input: 0.8,  cacheWrite: 1,     cacheRead: 0.08, output: 4   }],
  ['claude-opus-3',    { input: 15,   cacheWrite: 18.75, cacheRead: 1.5,  output: 75  }],
  ['claude-sonnet-3',  { input: 3,    cacheWrite: 3.75,  cacheRead: 0.3,  output: 15  }],
  ['claude-haiku-3',   { input: 0.25, cacheWrite: 0.3,   cacheRead: 0.03, output: 1.25}],
];

export function modelPricingFromConfig(
  modelId: string,
  cfg?: DashboardConfig,
): ModelPricingEntry | null {
  if (cfg?.modelPricing?.custom) {
    for (const c of cfg.modelPricing.custom) {
      if (modelId.startsWith(c.prefix)) {
        return { input: c.input, cacheWrite: c.cacheWrite, cacheRead: c.cacheRead, output: c.output };
      }
    }
  }
  if (cfg?.modelPricing?.fetched) {
    for (const [prefix, p] of Object.entries(cfg.modelPricing.fetched)) {
      if (modelId.startsWith(prefix)) return p;
    }
  }
  for (const [prefix, p] of MODEL_PRICING) {
    if (modelId.startsWith(prefix)) return p;
  }
  return null;
}

export function calcTurnCost(usage: Record<string, unknown>, modelId: string, cfg?: DashboardConfig): number {
  const p = modelPricingFromConfig(modelId, cfg);
  if (!p) return 0;
  const inp   = typeof usage.input_tokens                === 'number' ? usage.input_tokens                : 0;
  const cw    = typeof usage.cache_creation_input_tokens === 'number' ? usage.cache_creation_input_tokens : 0;
  const cr    = typeof usage.cache_read_input_tokens     === 'number' ? usage.cache_read_input_tokens     : 0;
  const out   = typeof usage.output_tokens               === 'number' ? usage.output_tokens               : 0;
  return (inp * p.input + cw * p.cacheWrite + cr * p.cacheRead + out * p.output) / 1_000_000;
}
