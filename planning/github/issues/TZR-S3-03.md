---
id: TZR-S3-03
title: "[S3] Finaliser le cockpit RH et ses confirmations métier"
sprint: S3
milestone: "S3 — IA et API RH"
due: 2026-08-26
points: 8
priority: Must
area: HR
assignee: mirajorakoto
publish: false
source_ids: B-041,B-042,B-043,B-044,B-045
depends_on: TZR-S3-02
---

## Résumé

Cette issue finalise l'interface du cockpit RH en s'appuyant sur les API de
TZR-S3-02. Elle couvre le tableau des offres, le formulaire d'offre, la liste et
les filtres des candidatures, le détail et les décisions avec confirmation (B-041
à B-045), en traitant les écarts confirmés sur les filtres et les décisions.

## Objectif

Rendre la gestion des offres et la revue des candidatures utilisables par un RH,
avec filtres, états explicites, documents originaux et confirmations empêchant
les changements involontaires.

## Travail attendu

- Finaliser tableaux, filtres, pagination, états vides et erreurs.
- Vérifier le formulaire d'offre et les critères dynamiques sur mobile.
- Afficher documents, preuves, incertitudes et avertissement IA constant.
- Ajouter les quatre décisions, dont retour « à examiner », avec confirmation.
- Tester clavier, focus, fermeture du panneau et erreurs réseau.

## Critères d'acceptation

- [ ] Le cockpit reste utilisable sur mobile, tablette et bureau.
- [ ] Les filtres UI correspondent exactement aux paramètres de l'API.
- [ ] L'avertissement « analyse IA à vérifier » reste visible avec l'analyse.
- [ ] Aucun changement de décision ne part sans confirmation explicite.
- [ ] « Retenu » ne déclenche jamais directement un email.

## Hors périmètre

- Refonte globale de l'administration TechZone.
- Automatisation de la décision RH.

## Vérifications

```bash
npm test --workspace @techzone/recruitment-admin
npm run build --workspace @techzone/recruitment-admin
npm run verify
git diff --check
```

## Traçabilité Excel

B-041 à B-045.

<!-- backlog-key: TZR-S3-03 -->
