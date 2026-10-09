---
id: TZR-S1-01
title: "[S1] Auditer et qualifier le socle de reprise"
sprint: S1
milestone: "S1 — Socle fiable"
due: 2026-08-12
points: 3
priority: Must
area: Foundation
assignee: mirajorakoto
publish: true
source_ids: B-001,B-002,B-003,B-006
depends_on: none
---

## Résumé

Ce sprint pose les conditions d'une livraison sereine en remplaçant les statuts
théoriques du classeur Excel par des preuves issues du code et de l'exécution
locale. Cette issue ouvre S1 : elle identifie ce qui fonctionne, les écarts à
corriger et les ajustements nécessaires pour les sprints suivants.

## Objectif

Établir une photographie vérifiable du dépôt avant de modifier l'architecture et
remplacer les statuts théoriques du classeur par des preuves issues du code, des
tests et de l'exécution locale.

## Contexte actuel

Le monorepo, Express, SQLite, les interfaces Vite et la CI existent déjà. Le
backlog Excel marque pourtant les 75 items « À faire ». Cette issue est un audit,
pas une autorisation de réécrire ce qui fonctionne.

## Travail attendu

- Lire `docs/1-reprise-projet.md` à `docs/3-securite-confidentialite-ia.md` avant toute modification.
- Installer depuis un clone propre et exécuter les vérifications documentées.
- Examiner les 75 lignes de `docs/10-backlog-github.md` et joindre une preuve à chaque changement d'état proposé.
- Lister les écarts, risques, décisions à arbitrer et dépendances avec l'hôte TechZone.
- Proposer les ajustements S2 nécessaires sans élargir unilatéralement le périmètre.

## Critères d'acceptation

- [ ] `npm ci`, `npm run verify` et `git diff --check` réussissent depuis un clone propre.
- [ ] L'absence de marqueurs de conflit et de secrets suivis est vérifiée.
- [ ] Chaque écart signalé cite un fichier, un test ou un résultat reproductible.
- [ ] Les éléments déjà conformes ne sont ni reconstruits ni estimés comme un nouveau développement.
- [ ] Un commentaire d'issue synthétise les risques et le plan S2 proposé.

## Hors périmètre

- Refactorisation opportuniste du produit.
- Utilisation de documents candidats réels.
- Mise en production ou configuration de secrets.

## Vérifications

```bash
npm ci
npm run verify
git diff --check
rg -n '<<<<<<<|=======|>>>>>>>' --glob '!package-lock.json'
```

## Traçabilité Excel

Propriété principale : B-001, B-002, B-003, B-006. Audit transversal : B-001 à
B-075.

<!-- backlog-key: TZR-S1-01 -->
