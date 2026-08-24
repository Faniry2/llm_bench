/**
 * CLI probe used while building each provider (see §11 of the spec):
 *   npm run probe -- deepseek
 *   npm run probe -- qwen
 *   npm run probe -- kimi
 *   npm run probe -- glm
 *
 * Sends "Quelle est la date d'aujourd'hui ? Cherche sur le web." with web
 * search enabled and prints the response content + raw usage so each
 * provider can be validated one at a time before wiring the UI.
 */
import { providerRegistry, envKeyNames } from '../src/providers/registry.js';
import type { ProviderId } from '../src/providers/types.js';

async function main() {
  const id = process.argv[2] as ProviderId | undefined;
  if (!id || !(id in providerRegistry)) {
    console.error('Usage: npm run probe -- <deepseek|qwen|kimi|glm>');
    process.exit(1);
  }

  const apiKey = process.env[envKeyNames[id]];
  if (!apiKey) {
    console.error(`Variable d'environnement manquante : ${envKeyNames[id]}`);
    process.exit(1);
  }

  const provider = providerRegistry[id];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);

  console.log(`--- Probing ${provider.label} (${provider.defaultModelId}) ---`);

  const options: Record<string, unknown> =
    id === 'deepseek'
      ? { webSearchMode: 'bridge', bridgeProviderId: 'qwen', bridgeProviderApiKey: process.env.DASHSCOPE_API_KEY }
      : {};

  const result = await provider.run(
    {
      prompt: "Quelle est la date d'aujourd'hui ? Cherche sur le web.",
      webSearch: true,
      signal: controller.signal,
      options,
      onDelta: (delta) => {
        if (delta.type === 'content' && delta.text) process.stdout.write(delta.text);
      }
    },
    apiKey
  );
  clearTimeout(timer);

  console.log('\n\n--- Résultat ---');
  console.log('status:', result.status);
  if (result.error) console.log('error:', result.error);
  console.log('rounds:', result.rounds);
  console.log('sources:', result.sources.length);
  console.log('usage:', result.usage);
  console.log('latencyMs:', result.latencyMs, 'ttftMs:', result.ttftMs);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
