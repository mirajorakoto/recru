---
id: TZR-S4-02
title: "[S4] Industrialiser la purge, le journal et les rapports anonymisés"
sprint: S4
milestone: "S4 — Livraison V1"
due: 2026-09-02
points: 5
priority: Must
area: Operations
assignee: mirajorakoto
publish: false
source_ids: B-052,B-053,B-054,B-055,B-056
depends_on: TZR-S1-03,TZR-S3-02
---

## Résumé

Cette issue industrialise la conservation et la suppression des données après
180 jours, avec un journal des transitions et des rapports anonymisés (B-052 à
B-055). L'API d'historique détaillée (B-056) est classée `Should` et sera différée
explicitement si la capacité résiduelle est insuffisante.

## Objectif

Rendre la conservation de 180 jours exécutable et vérifiable, avec un journal
sans contenu documentaire et uniquement des statistiques anonymes après purge.

## Travail attendu

- Planifier une purge récurrente, idempotente et observable.
- Supprimer fichiers, candidatures, emails et données associées selon `closed_at`.
- Journaliser les transitions importantes sans recopier de CV ni texte personnel inutile.
- Produire seulement les agrégats nécessaires après suppression.
- Réévaluer l'API d'historique B-056 ; la différer explicitement si les `Must` consomment la capacité.

## Critères d'acceptation

- [ ] La purge supprime base et disque et peut être rejouée sans erreur.
- [ ] Une panne partielle est détectable et ne produit pas un faux succès.
- [ ] Les événements ne contiennent aucun extrait de document candidat.
- [ ] Les rapports ne permettent pas de réidentifier une personne.
- [ ] B-056 est soit livré et testé, soit marqué `différé` avec justification.

## Hors périmètre

- Vivier permanent de candidats.
- Conservation au-delà de la politique validée.

## Vérifications

```bash
npm test --workspace @techzone/recruitment-backend
npm run verify
git diff --check
```

## Traçabilité Excel

B-052 à B-056.

<!-- backlog-key: TZR-S4-02 -->
