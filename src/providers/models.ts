import type { ProviderId } from './types.js';

export interface ModelOption {
  id: string;
  label: string;
}

/**
 * Modèles sélectionnables par fournisseur. Le premier de chaque liste est le
 * défaut. La liste n'est qu'une aide : l'UI autorise aussi la saisie libre d'un
 * id de modèle, donc `resolveModelId` ne filtre pas sur ce catalogue.
 */
export const providerModels: Record<ProviderId, ModelOption[]> = {
  deepseek: [
    { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
    { id: 'deepseek-chat', label: 'DeepSeek Chat' },
    { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner' }
  ],
  qwen: [
    { id: 'qwen3.8-max', label: 'Qwen 3.8 Max' },
    { id: 'qwen3.7-plus', label: 'Qwen 3.7 Plus' },
    { id: 'qwen3.7-max', label: 'Qwen 3.7 Max' },
    { id: 'qwen3.7-turbo', label: 'Qwen 3.7 Turbo' }
  ],
  kimi: [
    { id: 'kimi-k2.6', label: 'Kimi K2.6' },
    { id: 'kimi-k2.6-turbo', label: 'Kimi K2.6 Turbo' },
    { id: 'moonshot-v1-auto', label: 'Moonshot v1 (auto)' }
  ],
  glm: [
    { id: 'glm-5.1', label: 'GLM-5.1' },
    { id: 'glm-5.1-air', label: 'GLM-5.1 Air' },
    { id: 'glm-4-plus', label: 'GLM-4 Plus' }
  ],
  chatgpt: [
    { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' },
    { id: 'gpt-5.1', label: 'GPT-5.1' },
    { id: 'gpt-5.1-mini', label: 'GPT-5.1 mini' },
    { id: 'gpt-5', label: 'GPT-5' },
    { id: 'gpt-4.1', label: 'GPT-4.1' },
    { id: 'gpt-4o', label: 'GPT-4o' }
  ]
};

export const defaultModelId: Record<ProviderId, string> = Object.fromEntries(
  (Object.keys(providerModels) as ProviderId[]).map((id) => [id, providerModels[id][0].id])
) as Record<ProviderId, string>;

/** Renvoie l'id demandé s'il est non vide, sinon le modèle par défaut du fournisseur. */
export function resolveModelId(providerId: ProviderId, requested?: string): string {
  const trimmed = requested?.trim();
  return trimmed ? trimmed : defaultModelId[providerId];
}
