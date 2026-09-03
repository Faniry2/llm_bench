import type { Provider, ProviderId } from './types.js';
import { deepseekProvider } from './deepseek.js';
import { qwenProvider } from './qwen.js';
import { kimiProvider } from './kimi.js';
import { glmProvider } from './glm.js';
import { chatgptProvider } from './chatgpt.js';

export const providerRegistry: Record<ProviderId, Provider> = {
  deepseek: deepseekProvider,
  qwen: qwenProvider,
  kimi: kimiProvider,
  glm: glmProvider,
  chatgpt: chatgptProvider
};

export const providerIds: ProviderId[] = ['deepseek', 'qwen', 'kimi', 'glm', 'chatgpt'];

export const envKeyNames: Record<ProviderId, string> = {
  deepseek: 'DEEPSEEK_API_KEY',
  qwen: 'DASHSCOPE_API_KEY',
  kimi: 'MOONSHOT_API_KEY',
  glm: 'ZAI_API_KEY',
  chatgpt: 'OPENAI_API_KEY'
};

export function getProvider(id: ProviderId): Provider {
  return providerRegistry[id];
}
