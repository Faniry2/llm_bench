# ChinaLLM Bench

Application desktop Windows (Electron + React + TypeScript + Vite) pour comparer **4 LLM chinois** (DeepSeek V4 Pro, Qwen 3.7 Plus, Kimi K2.6, GLM‑5.1) sur **un seul prompt**, recherche web activée, avec **statistiques de tokens et de coût réel** par exécution.

Cas d'usage fourni par défaut : évaluation automatisée de restaurants (`templates/restaurant-eval.md`), avec extraction et rendu de la page HTML générée par chaque modèle.

## Installation

```bash
npm install
npm run dev        # lance l'app en mode développement
npm run build:win  # build electron-vite + package NSIS/portable dans release/
npm test            # vitest sur pricing/ et providers/
```

Windows 10/11 x64 requis pour le build NSIS + portable (`electron-builder.yml`).

## Clés API

Configurables dans l'onglet **🔑 Clés API** de l'application (chiffrées via `safeStorage`, jamais stockées en clair). Une variable d'environnement de secours existe pour chaque fournisseur :

| Fournisseur | Variable d'env | Où obtenir la clé |
|---|---|---|
| DeepSeek V4 Pro | `DEEPSEEK_API_KEY` | [platform.deepseek.com](https://platform.deepseek.com) |
| Qwen 3.7 Plus | `DASHSCOPE_API_KEY` | [Alibaba Cloud Model Studio / DashScope](https://dashscope.console.aliyun.com) |
| Kimi K2.6 | `MOONSHOT_API_KEY` | [platform.moonshot.ai](https://platform.moonshot.ai) |
| GLM‑5.1 | `ZAI_API_KEY` | [z.ai](https://z.ai) (Z.ai Open Platform) |
| ChatGPT (GPT‑5.1) | `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) |

Les clés ne transitent jamais vers le renderer : tous les appels réseau (chat, recherche web, test de clé) se font dans le process principal Electron.

## Choix du modèle par fournisseur

Chaque carte de la section **Modèles** expose (via ⚙️) un sélecteur **Modèle** : liste de modèles connus par fournisseur (`src/providers/models.ts`, premier = défaut) **plus saisie libre** d'un id arbitraire. Le modèle retenu est envoyé tel quel à l'API et affiché sur la carte de résultat. Les tarifs restant définis **par fournisseur** (voir ci-dessous), le coût d'un modèle non-défaut est calculé avec la grille du fournisseur : ajuste la ligne dans l'onglet 💰 Tarifs si besoin.

## Mettre à jour les tarifs

Onglet **💰 Tarifs**. Chaque ligne édite `inputPerM`, `cachedInputPerM`, `outputPerM`, `webSearchCostPerCall`, `sourceUrl` (les valeurs par défaut vivent dans `src/pricing/rates.ts`). Un bandeau ⚠️ apparaît automatiquement si `lastVerified` dépasse 30 jours. DeepSeek expose en plus un jeu de tarifs "heures pleines" (UTC 1‑4h et 6‑10h) sélectionnable en auto ou manuel ; Qwen expose des paliers de tarification par longueur de contexte (`contextTiers`).

## Recherche web par fournisseur

- **Qwen 3.7 Plus** — `enable_search` + `search_options` natifs (`search_strategy`, `forced_search`, `enable_source`, `enable_citation`). Sources dans `search_info.search_results[]`.
- **Kimi K2.6** — outil intégré `builtin_function` `$web_search`, boucle d'outils manuelle (max 8 tours), `thinking` désactivé pendant la recherche, usage **accumulé sur tous les tours** (voir `src/providers/kimi.ts` et `tests/providers/kimi.test.ts`).
- **GLM‑5.1** — outil natif `web_search` (`search_pro_jina`), pas de boucle manuelle, facturé à l'appel (`webSearchCostPerCall`).
- **DeepSeek V4 Pro** — l'API Chat Completions publique de DeepSeek n'expose pas de paramètre de recherche web natif documenté au moment de l'écriture (vérifié via `api-docs.deepseek.com`, août 2026). L'app utilise donc un **mode ponté** par défaut (`webSearchMode: 'bridge'`) : une recherche minimale est exécutée via Qwen ou GLM, les sources sont injectées dans le prompt système de DeepSeek sous forme de bloc `<sources>`, et le coût des tokens de la recherche pontée est compté dans le coût DeepSeek. La carte DeepSeek affiche un badge **« recherche : pontée »**. Un mode `native` est prévu dans les réglages si DeepSeek ajoute un paramètre officiel plus tard — mettez à jour `src/providers/deepseek.ts` en conséquence.
- **ChatGPT (GPT‑5.1)** — la recherche web native d'OpenAI passe par la Responses API (`tools: [{ type: 'web_search' }]`), non couverte par le client Chat Completions partagé. ChatGPT utilise donc le **même mode ponté** que DeepSeek (`webSearchMode: 'bridge'`, fournisseur pont Qwen/GLM réglable), avec le badge **« recherche : pontée »**. Le provider envoie `max_completion_tokens` (et non `max_tokens`) et laisse la température par défaut, GPT‑5.1 n'acceptant que ces valeurs en Chat Completions. La clé du fournisseur pont est résolue dans le process principal (`src/main/runner.ts`).

## Écarts constatés vs. le prompt de spécification

Les identifiants de modèles (`deepseek-v4-pro`, `qwen3.7-plus`, `kimi-k2.6`, `glm-5.1`) et les tarifs par défaut du §6.2 ont été confirmés par une recherche web au moment de la construction (août 2026) ; les valeurs de `src/pricing/rates.ts` reprennent celles du prompt, jugées cohérentes avec les sources trouvées. Deux points à revérifier périodiquement :

1. **DeepSeek** — reconfirmer régulièrement l'absence de paramètre de recherche web natif sur `api-docs.deepseek.com` ; y basculer le mode par défaut sur `native` s'il apparaît.
2. **Kimi builtin_function** — le format exact de la réponse `$web_search` (contenu renvoyé côté serveur) doit être revalidé avec `npm run probe -- kimi` dès qu'une clé Moonshot est disponible, la boucle actuelle réémet les arguments tels quels comme décrit dans le prompt source.

## Sécurité

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `contextBridge` dans `src/preload/index.ts`.
- Tous les appels réseau (chat + recherche web) s'exécutent dans `src/providers/*` depuis le process principal (`src/main/runner.ts`), jamais dans le renderer.
- Logs JSONL par run dans `<userData>/logs/run-<id>.jsonl`, clés API systématiquement masquées (`sk-xxxxxx****abcd`).

## Note technique : preload en CommonJS

Le projet est en `"type": "module"` (ESM) pour profiter de dépendances ESM-only comme `electron-store` v10. Le process principal et le renderer tournent donc en ESM, **mais le script preload est forcé en CommonJS** (`out/preload/index.cjs`, voir `electron.vite.config.ts`) : le chargeur de preload sandboxé d'Electron (`sandbox: true`) ne sait pas exécuter une syntaxe `import` ESM et échoue silencieusement sinon (`Cannot use import statement outside a module`), ce qui casse tout `contextBridge`. Si vous ajoutez un nouveau fournisseur ou modifiez `src/preload/index.ts`, gardez cette contrainte en tête.

## Structure

Voir l'arborescence dans le prompt de spécification (`PROMPT_CLAUDE_CODE_benchmark_ia_chinoises.md`, §3), reproduite fidèlement sous `src/`.

## Probe CLI (validation provider par provider)

```bash
DEEPSEEK_API_KEY=sk-... npm run probe -- deepseek
DASHSCOPE_API_KEY=sk-... npm run probe -- qwen
MOONSHOT_API_KEY=sk-... npm run probe -- kimi
ZAI_API_KEY=sk-...      npm run probe -- glm
```

## Icône Windows

Aucune icône personnalisée n'est fournie (`build/icon.ico` absent) — `electron-builder` utilise l'icône Electron par défaut. Ajoutez un `build/icon.ico` (256×256, multi-résolution) et référencez-le dans `electron-builder.yml` (`win.icon: build/icon.ico`) pour personnaliser.
