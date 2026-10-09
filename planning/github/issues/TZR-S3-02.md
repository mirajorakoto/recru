---
id: TZR-S3-02
title: "[S3] Compléter les API du cockpit RH"
sprint: S3
milestone: "S3 — IA et API RH"
due: 2026-08-26
points: 8
priority: Must
area: HR
assignee: mirajorakoto
publish: false
source_ids: B-036,B-037,B-038,B-039
depends_on: TZR-S1-03,TZR-S2-03,TZR-S3-01
---

## Résumé

Cette issue construit les fondations techniques du cockpit RH : CRUD des
offres, liste filtrable et paginée des candidatures, détail d'une candidature et
décision manuelle (B-036 à B-039). Les écarts confirmés sur la liste filtrable
(B-037) sont traités ici avant la finalisation de l'interface.

## Objectif

Fournir au cockpit RH des contrats stables pour administrer les offres, parcourir
les candidatures à volume réaliste et enregistrer une décision exclusivement
humaine.

## Travail attendu

- Vérifier le cycle brouillon, publication, clôture, archivage et suppression sûre des offres.
- Ajouter pagination et filtres déterministes des candidatures.
- Valider les changements de décision et journaliser l'acteur issu de la session.
- Empêcher toute publication sans critère objectif.
- Aligner implémentation, tests et `docs/6-openapi.yaml`.

## Critères d'acceptation

- [ ] Les listes sont paginées avec limites bornées et ordre stable.
- [ ] Les filtres offre, traitement et décision sont combinables et documentés.
- [ ] Une offre publiée contient au moins un critère explicite.
- [ ] La décision RH reste indépendante de l'analyse IA et porte son auteur.
- [ ] Toute modification de contrat est couverte par un test et OpenAPI.

## Hors périmètre

- Comptes partenaires et second système d'authentification.
- Campagnes de refus.

## Vérifications

```bash
npm test --workspace @techzone/recruitment-backend
npm run verify
git diff --check
```

## Traçabilité Excel

B-036 à B-039.

<!-- backlog-key: TZR-S3-02 -->
