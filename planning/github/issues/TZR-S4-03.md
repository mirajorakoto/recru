---
id: TZR-S4-03
title: "[S4] Intégrer, déployer et recetter la V1"
sprint: S4
milestone: "S4 — Livraison V1"
due: 2026-09-02
points: 8
priority: Must
area: Operations
assignee: mirajorakoto
publish: false
source_ids: B-057,B-059,B-060,B-061,B-062,B-063,B-072,B-073,B-074,B-075
depends_on: TZR-S2-03,TZR-S3-01,TZR-S3-02,TZR-S3-03,TZR-S4-01,TZR-S4-02
---

## Résumé

Ce dernier sprint regroupe l'intégration, le déploiement, la recette et la
documentation de la V1 (B-057, B-059 à B-063, B-072 à B-075). La date butoir du
2 septembre reste ferme pour les éléments `Must` ; tout élément `Should` non
absorbable sera explicitement différé plutôt que déclaré terminé sans preuve.

## Objectif

Prouver que le module fini est intégrable dans TechZone, sécurisé aux frontières,
reproductible depuis un clone propre et documenté pour l'exploitation.

## Travail attendu

- Valider nginx, routes directes, en-têtes, stockage privé et assets.
- Vérifier le manifeste, OpenAPI, variables et guides contre le comportement réel.
- Exécuter les builds, tests, banc d'essai synthétique et recette manuelle complète.
- Documenter limites connues, risques résiduels et procédure de retour arrière.
- Soumettre les portes propriétaire sans les déclarer validées à sa place.

## Critères d'acceptation

- [ ] Un clone propre passe `npm ci` puis `npm run verify`.
- [ ] Les routes publiques et RH fonctionnent sous les préfixes d'intégration documentés.
- [ ] L'accès direct aux documents est bloqué par l'application et nginx.
- [ ] OpenAPI, manifeste, guides et variables correspondent au produit livré.
- [ ] Aucun traitement candidat réel n'est lancé avant les validations propriétaire et CMIL.

## Hors périmètre

- Validation juridique à la place de TechZone.
- Ajout de secrets ou d'exports de production au dépôt.

## Vérifications

```bash
npm ci
npm run verify
npm audit --omit=dev
git diff --check
```

## Traçabilité Excel

B-057, B-059 à B-063, B-072 à B-075.

<!-- backlog-key: TZR-S4-03 -->
