# Guide de test — ChinaLLM Bench

Tout ce qui pouvait être vérifié sans clé API est déjà fait : installation, build (`electron-vite build`, `build:win`), tests unitaires (`npm test`, 21/21), lancement de la fenêtre en dev (`npm run dev`). Il reste les étapes ci-dessous, qui nécessitent de vraies clés API et une vérification manuelle dans l'UI.

## 1. Récupérer les 4 clés API

| Fournisseur | Où | Variable d'env de secours |
|---|---|---|
| DeepSeek V4 Pro | [platform.deepseek.com](https://platform.deepseek.com) | `DEEPSEEK_API_KEY` |
| Qwen 3.7 Plus | [dashscope.console.aliyun.com](https://dashscope.console.aliyun.com) | `DASHSCOPE_API_KEY` |
| Kimi K2.6 | [platform.moonshot.ai](https://platform.moonshot.ai) | `MOONSHOT_API_KEY` |
| GLM‑5.1 | [z.ai](https://z.ai) | `ZAI_API_KEY` |

Tu peux commencer avec une seule clé (ex. DeepSeek) pour valider le flow avant d'ajouter les autres.

## 2. Valider chaque provider un par un via le CLI probe (avant l'UI)

```powershell
cd G:\prompt_restauranr\app_window
$env:DEEPSEEK_API_KEY="sk-..."; npm run probe -- deepseek
$env:DASHSCOPE_API_KEY="sk-..."; npm run probe -- qwen
$env:MOONSHOT_API_KEY="sk-..."; npm run probe -- kimi
$env:ZAI_API_KEY="sk-...";      npm run probe -- glm
```

Ça envoie « Quelle est la date d'aujourd'hui ? Cherche sur le web. » et affiche la réponse + l'`usage` brut. **C'est le point le plus important à faire en premier** — c'est là qu'il faudra le plus probablement ajuster du code si la doc réelle diverge (format `$web_search` de Kimi, ou apparition d'un paramètre de recherche natif chez DeepSeek).

## 3. Lancer l'app et entrer les clés dans l'UI

```powershell
npm run dev
```

Puis dans l'app : **🔑 Clés API** → coller chaque clé → **Tester** (bouton par clé, doit passer ✅).

## 4. Tester le cas d'usage réel (évaluation restaurant)

- Remplir les variables du template restaurant déjà pré-chargé : `nom_restaurant`, `adresse`, `pays`, `date_analyse`.
- Cocher les 4 modèles, activer la recherche web globale, **▶ Lancer**.
- Vérifier :
  - les 4 colonnes se remplissent en streaming, en parallèle ;
  - l'onglet **Sources** de chaque carte est non vide (sauf DeepSeek qui doit afficher les sources du fournisseur ponté) ;
  - l'onglet **Aperçu HTML** affiche bien la page générée ;
  - le tableau de stats en bas affiche des tokens réels et un coût cohérent, avec le coût de Kimi qui additionne bien tous les tours de la boucle d'outils.
- Couper le Wi‑Fi en pleine exécution pour vérifier qu'une carte plante proprement sans faire crasher les autres (`Promise.allSettled`).

## 5. Vérifier la persistance

Fermer l'app, la rouvrir → les clés et les tarifs doivent être toujours là (chiffrés via `safeStorage`/DPAPI).

## 6. Tester les exports

- Boutons **CSV** / **JSON** / **Rapport .md** / **Rapport .html** dans la section statistiques.
- Sur chaque carte, onglet Aperçu HTML : **Exporter en .html** et **Ouvrir dans le navigateur**.

## 7. En cas de format inattendu

Si un provider répond avec un format inattendu à l'étape 2 (probe), copier la sortie brute et l'usage renvoyé — le mapping se corrige dans `src/providers/<nom>.ts` (parsing des chunks SSE, extraction des sources, calcul de l'usage).
