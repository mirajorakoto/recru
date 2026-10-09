---
id: TZR-S1-03
title: "[S1] Rendre les migrations SQLite versionnées et rejouables"
sprint: S1
milestone: "S1 — Socle fiable"
due: 2026-08-12
points: 5
priority: Must
area: Foundation
assignee: mirajorakoto
publish: true
source_ids: B-004,B-007,B-008,B-009,B-010,B-011,B-012,B-064
depends_on: TZR-S1-01
---

## Résumé

Ce travail sécurise toute évolution future du schéma en remplaçant
l'initialisation monolithique par des migrations versionnées et rejouables. Il
couvre les tables de recrutement (B-007 à B-012), l'écart confirmé sur le
système de migrations (B-004) et les tests d'idempotence (B-064).

## Objectif

Remplacer l'initialisation monolithique actuelle par des migrations ordonnées,
atomiques et idempotentes qui fonctionnent sur une base neuve comme sur une base
V1 existante.

## Contexte actuel

Le schéma crée les tables avec `CREATE TABLE IF NOT EXISTS`, puis inscrit la
version 1. Ce mécanisme ne permet pas encore de faire évoluer sûrement une base
déjà déployée.

## Travail attendu

- Introduire un registre ordonné de migrations avec transaction par version.
- Préserver les données et contraintes du schéma existant.
- Vérifier l'activation des clés étrangères et les index nécessaires.
- Tester une base neuve, une base déjà en version 1, une double exécution et l'échec atomique d'une migration.
- Documenter la procédure d'ajout et de retour arrière opérationnel d'une migration.

## Critères d'acceptation

- [ ] Chaque version est appliquée exactement une fois et enregistrée après succès.
- [ ] Deux exécutions successives ne modifient ni les données ni le schéma.
- [ ] Une migration défaillante ne laisse pas une version partiellement appliquée.
- [ ] Une base correspondant au socle actuel est mise à niveau sans perte de données.
- [ ] Les tests couvrent les tables et contraintes de recrutement attendues.

## Hors périmètre

- Changement de moteur de base de données.
- Migration de données candidates de production.

## Vérifications

```bash
npm test --workspace @techzone/recruitment-backend
npm run verify
git diff --check
```

## Traçabilité Excel

B-004, B-007 à B-012, B-064.

<!-- backlog-key: TZR-S1-03 -->
