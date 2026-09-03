import { RESTAURANT_TEMPLATE } from './restaurantTemplate.js';
import { PORNIC_RANKING_TEMPLATE } from './pornicRankingTemplate.js';

export interface PromptTemplate {
  id: string;
  label: string;
  content: string;
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  { id: 'restaurant-eval', label: 'Évaluation restaurant (fiche unique)', content: RESTAURANT_TEMPLATE },
  { id: 'pornic-ranking', label: 'Classement restaurants (zone géographique)', content: PORNIC_RANKING_TEMPLATE }
];

export const DEFAULT_TEMPLATE_ID = PROMPT_TEMPLATES[0].id;

/** id "" (ou inconnu) = prompt personnalisé, non issu d'un template. */
export const CUSTOM_TEMPLATE_ID = '';

export function getTemplate(id: string): PromptTemplate | undefined {
  return PROMPT_TEMPLATES.find((t) => t.id === id);
}

/** Retourne l'id du template dont le contenu correspond exactement, sinon "". */
export function matchTemplateId(content: string): string {
  return PROMPT_TEMPLATES.find((t) => t.content === content)?.id ?? CUSTOM_TEMPLATE_ID;
}

export { RESTAURANT_TEMPLATE, PORNIC_RANKING_TEMPLATE };
