// Miroir de templates/pornic-ranking.md
// Classement comparatif multi-restaurants autour d'une zone géographique.
export const PORNIC_RANKING_TEMPLATE = `Utilise la recherche web, privilégie les informations les plus récentes, et cite les sources.

Agis comme un gastronome éclairé, un analyste de l'expérience client et un spécialiste du classement comparatif de restaurants.

## Mission
Identifier, évaluer et classer les restaurants situés autour de la zone suivante : {{zone}}

Utilise en priorité les informations les plus récentes, les plus fiables et les plus cohérentes disponibles,
en croisant les sources suivantes lorsque c'est possible :
- Google
- Tripadvisor
- Guide Michelin
- Gault & Millau
- Le Petit Futé
- Le Guide du Routard
- site officiel du restaurant
- plateformes de réservation si utiles
- avis clients récents

Ne te limite jamais à une seule source.

## Axes à distinguer clairement
- la qualité culinaire réelle
- la satisfaction client
- la popularité numérique
- la reconnaissance éditoriale et gastronomique
- la praticité du lieu pour différents usages (repas rapide, dîner en couple, famille, groupe, affaires)

## Objectif
Produire un classement pertinent, exploitable et crédible pour un client qui cherche un bon restaurant
autour de lui, en tenant compte à la fois de l'expérience probable, de la reconnaissance par les guides,
des avis récents et de la praticité.

## Règles de fiabilité
* Ne jamais inventer une donnée ; si une donnée est absente, indiquer "NR".
* En cas d'établissements homonymes, ne retenir que celui dont le nom + la localisation concordent.
* Croiser au moins deux sources avant d'affirmer une note ou un classement.
* Dater les avis cités et privilégier ceux des 12 derniers mois.
* Ne pas recopier une note de plateforme comme note métier brute : l'interpréter.

## Sortie
Propose le résultat sous forme d'une page HTML au design graphique de www.consomyzone.com,
avec un en-tête illustré et un tableau de classement trié du meilleur au moins bon, comprenant pour
chaque restaurant : rang, nom, note globale /10, points forts, points faibles, reconnaissance guides,
note et volume d'avis récents, usage(s) conseillé(s), lien source principal.
Termine par une synthèse « que choisir selon le besoin ».

Nom du document : « classement-restaurants-autour-pornic — {{date_analyse}} ».
Encadre le code HTML complet dans un bloc \`\`\`html ... \`\`\`
`;
