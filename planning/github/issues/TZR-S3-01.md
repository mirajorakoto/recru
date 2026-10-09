---
id: TZR-S3-01
title: "[S3] Fiabiliser le worker IA et les garde-fous de décision humaine"
sprint: S3
milestone: "S3 — IA et API RH"
due: 2026-08-26
points: 8
priority: Must
area: AI
assignee: mirajorakoto
publish: false
source_ids: B-030,B-031,B-032,B-033,B-034,B-035,B-068
depends_on: TZR-S1-02,TZR-S1-03,TZR-S2-01
---

## Résumé

Ce travail de S3 fiabilise l'analyse assistée sans jamais automatiser une
décision d'embauche. Il couvre le worker asynchrone, l'appel structuré OpenAI,
le stockage de l'analyse, la gestion des erreurs et les tests prouvant que
l'IA ne décide pas (B-030 à B-035, B-068).

## Objectif

Garantir une analyse asynchrone reprenable, strictement limitée aux critères
explicites de l'offre et incapable de prendre ou d'influencer automatiquement la
décision RH finale.

## Travail attendu

- Vérifier les transitions de traitement, la reprise après crash, les retries bornés et la relance manuelle.
- Valider la sortie Structured Outputs avant tout stockage.
- Marquer les documents comme données non fiables et neutraliser les instructions qu'ils contiennent.
- Séparer durablement `analysis_json` et `hr_decision`.
- Tester timeout, réponse invalide, reprise d'un traitement orphelin et absence de champ décisionnel.

## Critères d'acceptation

- [ ] Un dossier ne reste pas bloqué en `processing` après interruption.
- [ ] Les tentatives automatiques sont bornées et une relance RH est possible.
- [ ] `store:false`, fichiers inline et schéma strict sont utilisés.
- [ ] Aucun champ `accepted`, `rejected` ou équivalent n'est accepté.
- [ ] Toute analyse affiche qu'une vérification humaine est obligatoire.

## Hors périmètre

- Classement automatique ou décision d'embauche.
- Envoi automatique d'un email à partir de l'analyse.

## Vérifications

```bash
npm test --workspace @techzone/recruitment-backend
npm run verify
git diff --check
```

## Traçabilité Excel

B-030 à B-035, B-068.

<!-- backlog-key: TZR-S3-01 -->
