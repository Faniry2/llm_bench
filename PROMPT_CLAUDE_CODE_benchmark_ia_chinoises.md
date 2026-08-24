# PROMPT POUR CLAUDE CODE — Application Windows « ChinaLLM Bench »

> Copie tout ce document dans Claude Code (`claude` dans un dossier vide), puis laisse-le construire le projet.

---

## 1. Mission

Construis une **application desktop Windows** avec **Electron + React + TypeScript + Vite** nommée **ChinaLLM Bench**.

But de l'application : **saisir UN SEUL prompt** (avec des variables), l'envoyer **en parallèle à 4 modèles LLM chinois** avec **la recherche web activée dans chaque API**, et afficher **N sorties côte à côte**, plus une **section statistiques** qui mesure la consommation de tokens et **estime le coût réel de chaque exécution**.

Cas d'usage principal : évaluation automatisée de restaurants à partir de données web récentes, avec génération d'une page HTML de résultat (le template est fourni en §9).

**Ne pose pas de questions avant de commencer.** Crée le projet, fais-le compiler, puis liste à la fin ce qui reste à vérifier.

---

## 2. Stack technique imposée

| Élément | Choix |
|---|---|
| Runtime | Electron 30+ |
| Bundler | Vite + `electron-vite` |
| UI | React 18 + TypeScript |
| Style | Tailwind CSS (mode sombre par défaut, avec toggle clair) |
| État | Zustand |
| Stockage local | `electron-store` pour les réglages + historique |
| Secrets | `safeStorage` d'Electron (chiffrement DPAPI Windows) — **jamais de clé API en clair sur disque** |
| HTTP | `fetch` natif de Node 20 (pas d'axios) |
| Packaging | `electron-builder`, cible **NSIS x64** + **portable** |
| Tests | Vitest sur la couche `providers/` et `pricing/` uniquement |

**Contraintes de sécurité Electron obligatoires** : `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, preload avec `contextBridge`. **Tous les appels réseau vers les APIs se font dans le process principal**, jamais dans le renderer (sinon les clés fuitent et on se prend du CORS).

---

## 3. Arborescence attendue

```
chinallm-bench/
├── electron.vite.config.ts
├── electron-builder.yml
├── package.json
├── src/
│   ├── main/
│   │   ├── index.ts                 # fenêtre, menu, IPC
│   │   ├── ipc.ts                   # handlers: run:start, run:cancel, keys:set, keys:test, export:*
│   │   ├── secure-store.ts          # safeStorage + electron-store
│   │   └── runner.ts                # orchestration parallèle + annulation (AbortController)
│   ├── providers/
│   │   ├── types.ts                 # interfaces communes (voir §4.1)
│   │   ├── base.ts                  # client OpenAI-compatible générique + retry + timeout
│   │   ├── deepseek.ts
│   │   ├── qwen.ts
│   │   ├── kimi.ts
│   │   ├── glm.ts
│   │   └── registry.ts              # catalogue des modèles + tarifs par défaut
│   ├── pricing/
│   │   ├── calculator.ts            # calcul du coût à partir de l'usage
│   │   └── rates.ts                 # table de tarifs éditable par l'utilisateur
│   ├── preload/index.ts
│   └── renderer/
│       ├── App.tsx
│       ├── components/
│       │   ├── PromptEditor.tsx     # zone de prompt + variables
│       │   ├── ModelSelector.tsx    # cases à cocher + réglages par modèle
│       │   ├── ResultGrid.tsx       # N colonnes de sortie
│       │   ├── ResultCard.tsx       # onglets Texte / HTML rendu / Sources / JSON brut
│       │   ├── StatsPanel.tsx       # tableau + graphiques
│       │   ├── CostSettings.tsx     # édition des tarifs
│       │   └── HistoryDrawer.tsx
│       └── store/useRunStore.ts
└── README.md
```

---

## 4. Couche providers — LE POINT CRITIQUE

Les 4 APIs sont toutes « OpenAI-compatible » pour le chat, **mais la recherche web se déclare différemment sur chacune**. C'est le cœur du travail : ne pas écrire un seul appel générique et espérer que ça marche.

### 4.1 Interface commune

```ts
export interface RunRequest {
  prompt: string;
  system?: string;
  webSearch: boolean;
  maxTokens?: number;
  temperature?: number;
  signal: AbortSignal;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;   // 0 si non renvoyé par l'API
  reasoningTokens: number;     // 0 si non renvoyé
  totalTokens: number;
  webSearchCalls: number;      // nombre d'appels de recherche facturés
}

export interface RunResult {
  providerId: string;
  modelId: string;
  status: 'success' | 'error' | 'cancelled';
  content: string;
  reasoningContent?: string;
  sources: { title: string; url: string; snippet?: string }[];
  usage: TokenUsage;
  usageIsEstimated: boolean;   // true si on a dû estimer (voir §6.3)
  latencyMs: number;
  ttftMs?: number;             // time to first token si streaming
  rounds: number;              // nb d'aller-retours (boucle d'outils)
  rawResponse: unknown;        // pour l'onglet JSON brut
  error?: { code: string; message: string };
}

export interface Provider {
  id: string;
  label: string;
  run(req: RunRequest, apiKey: string): Promise<RunResult>;
  testKey(apiKey: string): Promise<boolean>;
}
```

### 4.2 DeepSeek V4 Pro

- Base URL : `https://api.deepseek.com/v1`
- Model ID : `deepseek-v4-pro`
- Auth : `Authorization: Bearer <clé>`
- Usage renvoyé dans `usage` : `prompt_tokens`, `completion_tokens`, `prompt_cache_hit_tokens`, `prompt_cache_miss_tokens`. **Mappe bien le cache** : il change radicalement le coût.
- **Recherche web** : l'API DeepSeek publique **n'expose pas de recherche web intégrée** au moment de l'écriture de ce document. Implémente donc pour DeepSeek une stratégie `webSearchMode` à 2 options dans les réglages :
  1. `native` — tente le paramètre officiel s'il existe (à vérifier dans la doc courante) ;
  2. `bridge` (**défaut**) — fais d'abord la recherche via un autre fournisseur (Qwen ou GLM en mode « search only »), puis injecte les résultats dans le prompt système sous forme de bloc `<sources>`.
  
  Dans l'UI, affiche un badge **« recherche : pontée »** sur la carte DeepSeek pour que la comparaison reste honnête, et **compte les tokens de la recherche pontée dans le coût DeepSeek**.

> ⚠️ Vérifie systématiquement la doc en ligne avant de coder : `https://api-docs.deepseek.com`. Si un paramètre de recherche natif existe, préfère-le et bascule le défaut sur `native`.

### 4.3 Qwen 3.7 Plus

- Base URL international : `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`
  (Chine continentale : `https://dashscope.aliyuncs.com/compatible-mode/v1` — mettre les deux en option dans les réglages)
- Model ID : `qwen3.7-plus`
- Auth : clé DashScope `sk-...`
- **Recherche web** : passe par `extra_body` (soit, en REST brut, directement à la racine du body JSON) :

```json
{
  "model": "qwen3.7-plus",
  "messages": [...],
  "enable_search": true,
  "search_options": {
    "search_strategy": "agent",
    "forced_search": true,
    "enable_source": true,
    "enable_citation": true
  }
}
```

- Les sources reviennent dans `search_info.search_results[]` → mappe-les vers `RunResult.sources`.
- Options de `search_strategy` à exposer dans l'UI : `turbo` / `max` / `agent` / `agent_max`.
- Le `enable_thinking` doit rester configurable ; quand il est actif, lis `delta.reasoning_content` en streaming.

### 4.4 Kimi K2.6 (Moonshot)

- Base URL : `https://api.moonshot.ai/v1` (option `.cn` dans les réglages)
- Model ID : `kimi-k2.6`
- **Recherche web** : outil intégré déclaré ainsi :

```json
"tools": [{ "type": "builtin_function", "function": { "name": "$web_search" } }]
```

- **Boucle d'outils obligatoire** — c'est le piège principal :
  1. Envoie la requête avec le tableau `tools` **dans chaque appel**.
  2. Si `finish_reason === "tool_calls"`, ajoute le message assistant tel quel à l'historique, puis ajoute un message `{ role: "tool", tool_call_id, name: "$web_search", content: <les arguments renvoyés, ré-émis tels quels> }`.
  3. Relance. Répète jusqu'à `finish_reason !== "tool_calls"` (garde-fou : **max 8 tours**).
  4. Incrémente `rounds` et `webSearchCalls` à chaque tour d'outil.
- **Désactive le mode thinking** quand `$web_search` est actif sur K2.6 (incompatibilité documentée) : `"thinking": { "type": "disabled" }` dans `extra_body`.
- **Facturation** : les tokens de chaque tour s'additionnent. `usage` ne concerne que le dernier appel → **accumule l'usage de tous les tours**, sinon le coût affiché sera faux d'un facteur 2 à 5.

### 4.5 GLM-5.1 (Z.ai)

- Base URL : `https://api.z.ai/api/paas/v4`
- Model ID : `glm-5.1`
- **Recherche web** : outil natif, pas de boucle manuelle :

```json
"tools": [{
  "type": "web_search",
  "web_search": {
    "enable": true,
    "search_engine": "search_pro_jina",
    "search_result": true,
    "count": 10
  }
}]
```

- Les résultats reviennent dans `web_search` / `search_result` de la réponse → mappe vers `sources`.
- **La recherche est facturée à l'appel** (~0,01 $ par recherche, en plus des tokens). Ce montant doit être une **ligne de coût séparée** dans le calculateur (champ `webSearchCostPerCall`).

### 4.6 Robustesse (à appliquer aux 4)

- Timeout configurable, défaut **180 s** (la recherche web est lente).
- Retry avec backoff exponentiel sur `429` et `5xx`, **3 tentatives max**, jamais de retry sur `4xx` autre que 429.
- `AbortController` branché sur un bouton **Annuler** global et par carte.
- Un échec sur un modèle **ne doit jamais** interrompre les trois autres (`Promise.allSettled`).
- Journalise chaque requête/réponse dans `logs/run-<timestamp>.jsonl` (avec clés API masquées).

---

## 5. Interface utilisateur

### 5.1 Écran principal (3 zones)

**Zone haute — Entrée unique**
- Grand éditeur de prompt (police mono, redimensionnable).
- Sous l'éditeur : **panneau Variables** détecté automatiquement. Toute occurrence de `{{nom_variable}}` dans le prompt génère un champ de saisie. Pour le template restaurant : `{{nom_restaurant}}`, `{{adresse}}`, `{{pays}}`, `{{date_analyse}}`.
- Bouton **Charger un template** (le template restaurant de §9 est fourni pré-chargé) + **Enregistrer comme template**.
- Sélecteur de modèles : 4 cases à cocher, chacune avec un engrenage (température, max_tokens, recherche web on/off, options spécifiques du §4).
- Interrupteur global **Recherche web** + bouton **▶ Lancer** (raccourci `Ctrl+Entrée`).

**Zone centrale — Sorties multiples**
- Grille responsive : 1/2/3/4 colonnes selon le nombre de modèles cochés. Chaque colonne = `ResultCard`.
- Chaque carte affiche : nom du modèle, pastille d'état (⏳ en cours / ✅ / ❌), chrono en direct, et **4 onglets** :
  - **Texte** — la réponse en markdown rendu, en streaming.
  - **Aperçu HTML** — si la réponse contient un bloc HTML, extrais-le et rends-le dans une `<iframe sandbox="allow-same-origin">`. Bouton **Exporter en .html** et **Ouvrir dans le navigateur**. (Indispensable : le prompt restaurant demande une page HTML.)
  - **Sources** — liste cliquable des résultats de recherche web, avec le compte.
  - **JSON brut** — requête et réponse complètes, avec bouton copier.
- Barre d'outils par carte : copier, relancer ce seul modèle, épingler, **comparer** (ouvre une diff côte à côte de deux sorties).

**Zone basse — Statistiques** (voir §6)

### 5.2 Autres écrans

- **Réglages / Clés API** : 4 champs masqués, bouton **Tester** par clé (appel minimal 1 token), indicateur ✅/❌. Sélection de la région (international / Chine).
- **Réglages / Tarifs** : tableau éditable (voir §6.2).
- **Historique** : toutes les exécutions passées, rejouables, filtrables, supprimables.

---

## 6. Section statistiques et coût — exigence centrale

### 6.1 Ce qui doit être affiché

**Tableau comparatif (une ligne par modèle) :**

| Modèle | Tokens in | dont cache | Tokens out | dont raisonnement | Total | Recherches web | Latence | TTFT | Tours | Coût $ | Coût € | $/1k tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|

Avec ligne **TOTAL** en bas, et coloration du moins cher en vert / du plus cher en rouge.

**Graphiques (Recharts) :**
1. Barres groupées — tokens in/out par modèle.
2. Barres — coût par modèle sur l'exécution courante.
3. Courbe — coût cumulé sur les 30 derniers runs.
4. Nuage de points — coût (x) vs latence (y), une bulle par modèle.

**Cartes de synthèse :** coût du run courant · coût cumulé de la session · coût cumulé total · **projection** « si je lance ce prompt N fois » (champ N modifiable, défaut 100) · **coût mensuel estimé** pour X runs/jour.

### 6.2 Table de tarifs (`pricing/rates.ts`)

Valeurs par défaut à inscrire, **toutes en $ par million de tokens**, **toutes modifiables dans l'UI** :

| Modèle | Input | Cache hit | Output | Recherche web |
|---|---|---|---|---|
| deepseek-v4-pro | 0.435 | 0.003625 | 0.87 | 0 (pontée) |
| qwen3.7-plus | 0.40 | — | 1.60 (≤256K ctx) | facturé à part |
| kimi-k2.6 | 0.95 | — | 4.00 | par appel |
| glm-5.1 | 1.40 | — | 4.40 | 0.01 $/appel |

Chaque ligne doit porter les champs : `inputPerM`, `cachedInputPerM`, `outputPerM`, `webSearchCostPerCall`, `currency`, `lastVerified` (date), `sourceUrl`.

**Trois avertissements à implémenter dans l'UI :**
1. Bandeau **« Tarifs saisis manuellement — à revérifier »** si `lastVerified` remonte à plus de 30 jours.
2. DeepSeek applique une **tarification heures pleines / heures creuses** : prévois deux jeux de tarifs et un sélecteur (auto selon l'heure UTC, ou manuel).
3. Qwen facture par **paliers de longueur de contexte** : prévois un tableau `[{ maxContext: 256000, inputPerM: 0.40, outputPerM: 1.60 }, ...]` et choisis le palier selon les tokens d'entrée réels.

### 6.3 Formule et honnêteté du calcul

```ts
coût = ((inputTokens - cachedInputTokens) / 1e6) * inputPerM
     + (cachedInputTokens / 1e6) * cachedInputPerM
     + (outputTokens / 1e6) * outputPerM
     + webSearchCalls * webSearchCostPerCall;
```

- Les **tokens de raisonnement** sont facturés au tarif output — inclus-les dans `outputTokens` mais affiche-les aussi séparément.
- Si un provider ne renvoie pas `usage` (ou en cas de coupure de stream), estime via `tiktoken` / `js-tiktoken` (encodage `cl100k_base`) et **marque la ligne d'un ⚠️ « estimé »**. Ne mélange jamais silencieusement mesuré et estimé.
- Taux de change $→€ configurable manuellement (pas d'appel API externe).
- **Exports** : bouton **CSV** et **JSON** du tableau de stats, plus export complet d'un run (prompt + 4 sorties + stats) en **Markdown** et en **HTML**.

---

## 7. Sécurité des clés

- Saisie dans les réglages → chiffrement via `safeStorage.encryptString()` → stockage du buffer chiffré dans `electron-store`.
- Support des variables d'environnement en secours : `DEEPSEEK_API_KEY`, `DASHSCOPE_API_KEY`, `MOONSHOT_API_KEY`, `ZAI_API_KEY`.
- Les clés **ne transitent jamais vers le renderer** : le renderer envoie `run:start` avec un `providerId`, le main récupère la clé lui-même.
- Masquage systématique des clés dans les logs et dans l'onglet JSON brut (`sk-****…abcd`).

---

## 8. Packaging Windows

- `electron-builder.yml` : `win.target: [nsis, portable]`, `arch: x64`, icône `build/icon.ico` (génère un placeholder si absent).
- Scripts npm : `dev`, `build`, `build:win`, `test`, `lint`.
- Le README doit expliquer : installation, où obtenir chaque clé API (DeepSeek Platform, Alibaba Cloud Model Studio / DashScope, Moonshot Platform, Z.ai), et comment mettre à jour les tarifs.

---

## 9. Template de prompt à pré-charger

Enregistre ce texte dans `templates/restaurant-eval.md` et charge-le par défaut au premier lancement.

```
Tu es un agent d'évaluation de restaurants spécialisé en collecte web récente.
Ta mission est d'évaluer le restaurant suivant et de présenter les résultats dans
une page HTML au design graphique de www.consomyzone.com

## Entrées
* nom_restaurant = {{nom_restaurant}}
* adresse = {{adresse}}
* pays = {{pays}}
* date_analyse = {{date_analyse}}

## Objectif
1. Identifier le bon établissement avec certitude.
2. Rechercher les informations les plus récentes et fiables disponibles en ligne.
3. Évaluer le restaurant selon la grille imposée.
4. Calculer la note finale pondérée.
5. Générer la page HTML.

## Sources à privilégier (par ordre de confiance)
1. site officiel
2. Google Maps / Google Business Profile
3. Guide Michelin
4. Tripadvisor
5. TheFork
6. Le Petit Futé
7. Gault & Millau
8. réseaux sociaux officiels
9. presse locale récente
10. annuaires fiables

## Règles de fiabilité
* Ne jamais inventer une donnée.
* Si une donnée est absente, retourner "NR".
* Si plusieurs établissements homonymes existent, choisir uniquement celui dont le nom + localisation concordent.
* Si le doute subsiste, renseigner les champs non sûrs à "NR".
* Utiliser les données les plus récentes disponibles au moment de l'analyse.
* Fonder les notes sur des éléments observables, récurrents et crédibles.
* Ne pas recopier une note de plateforme comme note métier brute : l'interpréter dans le cadre de la grille.

## Critères à noter sur 10
qualite_des_plats_10, rapport_qualite_prix_10, service_10, cadre_ambiance_10,
hygiene_proprete_10, carte_choix_10, avis_reputation_10, accessibilite_praticite_10

## Pondérations obligatoires
qualite_des_plats_10 = 3.5 | rapport_qualite_prix_10 = 2 | service_10 = 2
cadre_ambiance_10 = 1.5 | hygiene_proprete_10 = 1 | carte_choix_10 = 1
avis_reputation_10 = 1 | accessibilite_praticite_10 = 0.5

## Formule obligatoire
note_finale_10 = (
  (qualite_des_plats_10 * 3.5) + (rapport_qualite_prix_10 * 2) + (service_10 * 2) +
  (cadre_ambiance_10 * 1.5) + (hygiene_proprete_10 * 1) + (carte_choix_10 * 1) +
  (avis_reputation_10 * 1) + (accessibilite_praticite_10 * 0.5)
) / 12.5

## Méthode d'évaluation
1. Qualité des plats : récurrence des avis sur le goût, la cuisson, l'assaisonnement, la fraîcheur ; niveau perçu des produits ; maîtrise culinaire ; cohérence des spécialités ; reconnaissance externe éventuelle.
2. Rapport qualité-prix : niveau de prix observé ; perception client du juste prix ; cohérence entre prix, quantité, qualité, cadre et service.
3. Service : accueil ; professionnalisme ; rapidité ; régularité ; gestion des demandes ou incidents.
4. Cadre / ambiance : décoration ; confort ; atmosphère ; bruit ; attrait du lieu ; agrément de l'expérience sur place.
5. Hygiène / propreté perçue : propreté de la salle, des sanitaires, de la vaisselle, de la présentation ; remarques répétées dans les avis.
6. Carte / choix : lisibilité de l'offre ; diversité suffisante ; spécialités identifiables ; cohérence ; adaptation à différents profils.
7. Avis / réputation : note moyenne agrégée ; volume d'avis ; fraîcheur ; stabilité ; tonalité générale.
8. Accessibilité / praticité : facilité d'accès ; stationnement ; réservation ; lisibilité des horaires ; praticité générale.

## Règles de normalisation
* Toutes les notes sur 10 arrondies à 1 décimale.
* note_google et autres notes de plateforme restent dans leur échelle native si collectées comme valeur source.
* nombre_avis_google est un entier.
* Booléens métier : "Oui" | "Non" | "NR".
* Usages cibles : "Oui" | "Non" | "Mitigé" | "NR".
* recommandation_finale ∈ {"Incontournable", "Très bon choix", "Bon choix", "Correct", "À éviter"}.

## Règles pour synthese_critique
* Maximum 120 caractères, pas de point-virgule, expérience client concrète, pas de langage promotionnel creux.

## Règles pour recommandation_finale
* >= 8.8 : "Incontournable" | >= 8.0 et < 8.8 : "Très bon choix" | >= 7.0 et < 8.0 : "Bon choix"
* >= 5.5 et < 7.0 : "Correct" | < 5.5 : "À éviter"

## Sortie
Génère les résultats dans une page HTML au design graphique de www.consomyzone.com,
avec des photos dans l'en-tête et dans le corps de la page.
Encadre le code HTML complet dans un bloc ```html ... ```
```

> Note importante à intégrer dans le code : la dernière ligne (bloc ```html) est **ajoutée volontairement** au template d'origine, pour que l'application puisse extraire l'HTML de façon fiable et alimenter l'onglet « Aperçu HTML ». Si le bloc est absent, applique un repli : détecte `<!DOCTYPE html>` ou `<html` dans la réponse.

---

## 10. Critères d'acceptation

L'application est considérée terminée quand :

1. `npm run dev` lance la fenêtre sans erreur console.
2. `npm run build:win` produit un `.exe` NSIS fonctionnel.
3. Une exécution avec les 4 modèles cochés affiche **4 colonnes qui se remplissent en streaming, en parallèle**.
4. Chaque carte affiche des sources web non vides quand la recherche web est activée (sauf DeepSeek en mode ponté, qui doit afficher les sources du fournisseur de pontage).
5. Le tableau de stats affiche des tokens **réels** issus des réponses API, et un coût cohérent avec le calcul manuel.
6. Le coût de Kimi **additionne bien tous les tours** de la boucle d'outils.
7. Couper Internet en cours de run → erreurs propres par carte, pas de crash.
8. Fermer et rouvrir l'appli → les clés API et les tarifs sont conservés.
9. Les exports CSV / JSON / HTML fonctionnent.
10. `npm test` passe sur `pricing/calculator.ts` et sur le mapping d'usage de chaque provider.

---

## 11. Méthode de travail attendue

1. **Commence par vérifier la documentation en ligne** de chacune des 4 APIs (endpoints, ID de modèle exacts, format de la recherche web, format du bloc `usage`, tarifs courants). Les informations du §4 et du §6.2 sont un point de départ daté — **si la doc officielle diffère, la doc officielle gagne**, et tu notes l'écart dans le README.
2. Squelette Electron + build qui passe, avant toute UI.
3. Couche `providers/` avec **un provider à la fois**, testé par un script CLI (`npm run probe -- deepseek`) qui envoie « Quelle est la date d'aujourd'hui ? Cherche sur le web. » et affiche la réponse + l'usage brut. **Ne passe au provider suivant qu'une fois celui-ci vert.**
4. Calculateur de coût + tests unitaires.
5. UI React.
6. Packaging.

À la fin, produis un tableau récapitulatif : pour chaque provider, ✅/❌ sur « chat », « recherche web », « usage tokens exact », « streaming », avec les remarques.
