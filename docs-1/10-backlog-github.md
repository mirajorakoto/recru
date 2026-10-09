# Backlog GitHub — livraison V1 en quatre semaines

## Finalité

Ce document remplace le classeur Excel comme référentiel de pilotage. Le fichier
`Backlog_Module_Recrutement_TechZone.xlsx` reste l'archive de la proposition
initiale : 75 items, 236 points et sept sprints. Ces estimations ne décrivent pas
la charge restante, car le dépôt contient déjà un socle exécutable.

Le développement est piloté par les issues du dépôt privé
`hasiniaina7/techzone-recrutement`. L'IA reste une aide à l'analyse : aucune
issue ne peut introduire une décision d'embauche automatique.

## Lecture des états

| État | Signification |
|---|---|
| `présent à confirmer` | Une implémentation ou un document existe, mais l'issue doit en apporter la preuve avant de le considérer livré. |
| `écart confirmé` | L'inspection du socle montre un comportement absent ou incomplet. |
| `recette requise` | L'implémentation existe en partie ; une vérification manuelle ou dans l'environnement TechZone reste obligatoire. |
| `différé` | Élément `Should` non bloquant pour la V1, à réévaluer selon la capacité restante. |

## Calendrier resserré

| Sprint | Dates | Objectif | Publication |
|---|---|---|---|
| S1 | 6–12 août 2026 | Auditer et fiabiliser le socle | Issues publiées |
| S2 | 13–19 août 2026 | Sécuriser et terminer le parcours candidat | Issues publiées |
| S3 | 20–26 août 2026 | Finaliser l'IA et le cockpit RH | Brouillons jusqu'à la revue du 19 août |
| S4 | 27 août–2 septembre 2026 | Emails, conservation, intégration et recette | Brouillons jusqu'à la revue du 19 août |

Le 19 août, les résultats réels de S1/S2 déterminent la forme définitive de
S3/S4. L'échéance du 2 septembre concerne les exigences `Must`. Un élément
`Should` qui ne rentre pas dans la capacité disponible est marqué `différé`,
jamais déclaré terminé sans preuve.

## Issues consolidées

| Référence | Issue | Points restants estimés | Traçabilité principale |
|---|---|---:|---|
| TZR-S1-01 | Auditer et qualifier le socle de reprise | 3 | Audit B-001 à B-075 ; propriété B-001, B-002, B-003, B-006 |
| TZR-S1-02 | Fiabiliser la configuration et le démarrage depuis la racine | 3 | B-005, B-058 |
| TZR-S1-03 | Rendre les migrations SQLite versionnées et rejouables | 5 | B-004, B-007–B-012, B-064 |
| TZR-S2-01 | Durcir la soumission candidat et le stockage documentaire privé | 8 | B-014, B-015, B-017, B-018, B-021–B-025, B-066 |
| TZR-S2-02 | Finaliser le parcours public responsive et accessible | 8 | B-019, B-020, B-026–B-029, B-069, B-070 |
| TZR-S2-03 | Prouver l'isolation des routes RH et des documents | 5 | B-013, B-016, B-040, B-065 |
| TZR-S3-01 | Fiabiliser le worker IA et les garde-fous de décision humaine | 8 | B-030–B-035, B-068 |
| TZR-S3-02 | Compléter les API du cockpit RH | 8 | B-036–B-039 |
| TZR-S3-03 | Finaliser le cockpit RH et ses confirmations métier | 8 | B-041–B-045 |
| TZR-S4-01 | Finaliser le workflow d'email de sélection | 8 | B-046–B-051, B-067, B-071 |
| TZR-S4-02 | Industrialiser la purge, le journal et les rapports anonymisés | 5 | B-052–B-056 |
| TZR-S4-03 | Intégrer, déployer et recetter la V1 | 8 | B-057, B-059–B-063, B-072–B-075 |

Ces points sont des estimations relatives du travail restant. Ils ne doivent pas
être additionnés aux 236 points historiques du classeur.

## Traçabilité des 75 items Excel

| ID | Epic | Intitulé initial | Priorité | Points Excel | Qualification | Issue |
|---|---|---|---|---:|---|---|
| B-001 | Infrastructure | Initialiser le monorepo npm workspaces | Must | 3 | présent à confirmer | TZR-S1-01 |
| B-002 | Infrastructure | Configurer Vite pour public-ui et admin-ui | Must | 2 | présent à confirmer | TZR-S1-01 |
| B-003 | Infrastructure | Configurer Express et SQLite | Must | 3 | présent à confirmer | TZR-S1-01 |
| B-004 | Infrastructure | Système de migrations rejouables | Must | 5 | écart confirmé | TZR-S1-03 |
| B-005 | Infrastructure | Configurer les variables d'environnement | Must | 2 | écart confirmé | TZR-S1-02 |
| B-006 | Infrastructure | Configurer les tests backend | Must | 2 | présent à confirmer | TZR-S1-01 |
| B-007 | Data Model | Créer recruitment_jobs | Must | 3 | présent à confirmer | TZR-S1-03 |
| B-008 | Data Model | Créer recruitment_applications | Must | 3 | présent à confirmer | TZR-S1-03 |
| B-009 | Data Model | Créer recruitment_files | Must | 3 | présent à confirmer | TZR-S1-03 |
| B-010 | Data Model | Créer recruitment_emails | Must | 3 | présent à confirmer | TZR-S1-03 |
| B-011 | Data Model | Créer recruitment_events | Must | 2 | présent à confirmer | TZR-S1-03 |
| B-012 | Data Model | Créer recruitment_migrations | Must | 1 | écart confirmé | TZR-S1-03 |
| B-013 | Sécurité | Réutiliser le middleware de session admin | Must | 3 | recette requise | TZR-S2-03 |
| B-014 | Sécurité | Chiffrement AES-256-GCM des fichiers | Must | 5 | présent à confirmer | TZR-S2-01 |
| B-015 | Sécurité | Validation Turnstile côté serveur | Must | 3 | présent à confirmer | TZR-S2-01 |
| B-016 | Sécurité | Bloquer l'accès public aux documents | Must | 2 | recette requise | TZR-S2-03 |
| B-017 | Sécurité | Rate limiting | Should | 2 | présent à confirmer | TZR-S2-01 |
| B-018 | Sécurité | Sanitisation HTML | Must | 3 | présent à confirmer | TZR-S2-01 |
| B-019 | Candidat | API de liste des offres publiées | Must | 3 | présent à confirmer | TZR-S2-02 |
| B-020 | Candidat | API de détail d'une offre | Must | 2 | présent à confirmer | TZR-S2-02 |
| B-021 | Candidat | API de soumission d'une candidature | Must | 5 | présent à confirmer | TZR-S2-01 |
| B-022 | Candidat | Validation des fichiers envoyés | Must | 5 | présent à confirmer | TZR-S2-01 |
| B-023 | Candidat | Chiffrement et stockage des fichiers | Must | 3 | présent à confirmer | TZR-S2-01 |
| B-024 | Candidat | Génération d'une référence de dépôt | Must | 2 | présent à confirmer | TZR-S2-01 |
| B-025 | Candidat | Consentement obligatoire | Must | 2 | présent à confirmer | TZR-S2-01 |
| B-026 | Candidat | UI de liste des offres | Must | 5 | recette requise | TZR-S2-02 |
| B-027 | Candidat | UI de détail d'une offre | Must | 3 | recette requise | TZR-S2-02 |
| B-028 | Candidat | UI du formulaire de candidature | Must | 8 | écart confirmé | TZR-S2-02 |
| B-029 | Candidat | UI de confirmation | Must | 2 | présent à confirmer | TZR-S2-02 |
| B-030 | IA | Worker de traitement asynchrone | Must | 5 | présent à confirmer | TZR-S3-01 |
| B-031 | IA | Appel OpenAI structuré | Must | 5 | présent à confirmer | TZR-S3-01 |
| B-032 | IA | Stockage de l'analyse JSON | Must | 3 | présent à confirmer | TZR-S3-01 |
| B-033 | IA | Gestion des erreurs et reprises | Must | 3 | présent à confirmer | TZR-S3-01 |
| B-034 | IA | Reprise d'un traitement abandonné | Must | 3 | présent à confirmer | TZR-S3-01 |
| B-035 | IA | Traiter les documents comme données non fiables | Must | 3 | présent à confirmer | TZR-S3-01 |
| B-036 | RH | API CRUD des offres | Must | 8 | présent à confirmer | TZR-S3-02 |
| B-037 | RH | API de liste filtrable et paginée des candidatures | Must | 3 | écart confirmé | TZR-S3-02 |
| B-038 | RH | API de détail d'une candidature | Must | 3 | présent à confirmer | TZR-S3-02 |
| B-039 | RH | API de décision manuelle | Must | 3 | présent à confirmer | TZR-S3-02 |
| B-040 | RH | Téléchargement privé des documents | Must | 3 | recette requise | TZR-S2-03 |
| B-041 | RH | UI du tableau des offres | Must | 5 | recette requise | TZR-S3-03 |
| B-042 | RH | UI du formulaire d'offre | Must | 5 | recette requise | TZR-S3-03 |
| B-043 | RH | UI de liste et filtres des candidatures | Must | 5 | écart confirmé | TZR-S3-03 |
| B-044 | RH | UI de détail d'une candidature | Must | 5 | recette requise | TZR-S3-03 |
| B-045 | RH | UI des décisions avec confirmation | Must | 3 | écart confirmé | TZR-S3-03 |
| B-046 | Email | API de génération du brouillon | Must | 5 | présent à confirmer | TZR-S4-01 |
| B-047 | Email | API d'édition du brouillon | Must | 3 | écart confirmé | TZR-S4-01 |
| B-048 | Email | API de prévisualisation | Must | 2 | écart confirmé | TZR-S4-01 |
| B-049 | Email | Envoi idempotent | Must | 5 | présent à confirmer | TZR-S4-01 |
| B-050 | Email | Intégration SMTP | Must | 3 | recette requise | TZR-S4-01 |
| B-051 | Email | UI du workflow email | Must | 5 | recette requise | TZR-S4-01 |
| B-052 | Purge | Purge après 180 jours | Must | 5 | présent à confirmer | TZR-S4-02 |
| B-053 | Purge | Rapports post-purge agrégés | Must | 3 | écart confirmé | TZR-S4-02 |
| B-054 | Purge | Test automatique de purge | Must | 2 | présent à confirmer | TZR-S4-02 |
| B-055 | Events | Journaliser toutes les transitions | Must | 3 | écart confirmé | TZR-S4-02 |
| B-056 | Events | API d'historique d'une candidature | Should | 2 | différé | TZR-S4-02 |
| B-057 | Deploy | Configuration nginx | Must | 3 | recette requise | TZR-S4-03 |
| B-058 | Deploy | Template d'environnement | Must | 1 | présent à confirmer | TZR-S1-02 |
| B-059 | Deploy | Manifeste d'intégration | Must | 2 | présent à confirmer | TZR-S4-03 |
| B-060 | Deploy | Builds de production | Must | 2 | présent à confirmer | TZR-S4-03 |
| B-061 | Demo | Serveur de démonstration | Should | 3 | présent à confirmer | TZR-S4-03 |
| B-062 | Demo | Ressources CV synthétiques | Must | 1 | présent à confirmer | TZR-S4-03 |
| B-063 | Demo | UI de démonstration | Should | 3 | présent à confirmer | TZR-S4-03 |
| B-064 | Tests | Tests de migrations idempotentes | Must | 2 | écart confirmé | TZR-S1-03 |
| B-065 | Tests | Tests 401 de toutes les routes RH | Must | 2 | présent à confirmer | TZR-S2-03 |
| B-066 | Tests | Tests de validation des fichiers | Must | 3 | présent à confirmer | TZR-S2-01 |
| B-067 | Tests | Tests d'idempotence email | Must | 2 | présent à confirmer | TZR-S4-01 |
| B-068 | Tests | Tests IA sans décision d'embauche | Must | 2 | présent à confirmer | TZR-S3-01 |
| B-069 | Tests | Tests responsive | Must | 3 | recette requise | TZR-S2-02 |
| B-070 | Tests | Tests d'accessibilité | Must | 3 | recette requise | TZR-S2-02 |
| B-071 | Tests | Test d'email réel | Must | 2 | recette requise | TZR-S4-01 |
| B-072 | Docs | README complet | Must | 2 | présent à confirmer | TZR-S4-03 |
| B-073 | Docs | Spécification OpenAPI | Must | 3 | présent à confirmer | TZR-S4-03 |
| B-074 | Docs | Guide sécurité, confidentialité et IA | Must | 2 | présent à confirmer | TZR-S4-03 |
| B-075 | Docs | Guide d'intégration TechZone | Must | 2 | présent à confirmer | TZR-S4-03 |

## Règles GitHub Flow

1. Une issue passe à `Ready` seulement si son objectif, ses dépendances, son hors
   périmètre et ses critères d'acceptation sont explicites.
2. Le développeur crée `feature/<numero-issue>-<sujet>` depuis `main` et ouvre
   rapidement une pull request brouillon contenant `Closes #<numero>`.
3. Une issue ne peut être `In progress` que pour un travail effectivement engagé.
4. L'ouverture de la revue fait passer l'issue à `In review`.
5. Une fusion exige la CI `verify`, une approbation, les conversations résolues,
   `npm run verify` et `git diff --check` sans erreur.
6. La fusion se fait par squash ; la branche est supprimée et l'issue passe à
   `Done` automatiquement.

## Publication contrôlée

Le script valide toujours les brouillons avant d'appeler GitHub et ne modifie pas
le corps d'une issue existante sans `--sync`.

```bash
# À faire une seule fois sur le poste du propriétaire.
gh auth refresh -h github.com -s project

# Contrôles sans mutation distante.
npm run backlog:validate
npm run backlog:dry-run

# Première publication : S1 et S2 uniquement.
node scripts/github-backlog.mjs publish --sprints S1,S2 --apply
```

Pour publier un sprint futur, sa revue doit d'abord passer `publish: true` dans
ses trois brouillons. La commande refuse donc actuellement S3 et S4. L'option
`--sync` est réservée à une resynchronisation volontaire des issues déjà créées.

## Portes de livraison réservées au propriétaire

Ces obligations ne sont pas assignées au développeur et ne constituent pas une
décision RH automatisable :

- validation métier du parcours et des textes envoyés aux candidats ;
- validation juridique et formalité CMIL avant traitement réel ;
- rotation de toute ancienne clé compromise et fourniture des secrets hors Git ;
- autorisation explicite d'utiliser OpenAI, Turnstile et SMTP en production ;
- décision finale de mise en production et acceptation des risques résiduels.

## Revue du 19 août

Avant toute publication de S3/S4, vérifier les issues terminées, la capacité
réelle, les risques remontés, les changements d'API et les dépendances avec
TechZone. Mettre à jour les brouillons versionnés, puis publier uniquement les
issues encore nécessaires avec `scripts/github-backlog.mjs`.
