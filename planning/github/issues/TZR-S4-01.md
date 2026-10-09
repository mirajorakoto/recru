---
id: TZR-S4-01
title: "[S4] Finaliser le workflow d'email de sélection"
sprint: S4
milestone: "S4 — Livraison V1"
due: 2026-09-02
points: 8
priority: Must
area: Email
assignee: mirajorakoto
publish: false
source_ids: B-046,B-047,B-048,B-049,B-050,B-051,B-067,B-071
depends_on: TZR-S3-02,TZR-S3-03
---

## Résumé

Cette issue clôt le cycle de vie positif d'une candidature avec un workflow
email sécurisé : génération du brouillon, édition, prévisualisation et envoi
idempotent (B-046 à B-051). Les tests d'idempotence (B-067) et un test d'email
réel en recette (B-071) complètent la livraison.

## Objectif

Livrer un brouillon éditable et prévisualisable, puis un envoi SMTP explicitement
confirmé et idempotent, sans confondre « retenu pour la suite » avec une embauche
définitive.

## Travail attendu

- Stabiliser la création, l'édition et la prévisualisation HTML/texte du brouillon.
- Nettoyer le HTML côté serveur après chaque édition.
- Verrouiller la transition atomique `sending` → `sent` ou `failed`.
- Permettre une reprise contrôlée d'un échec sans double envoi.
- Effectuer un test réel uniquement vers une boîte contrôlée.

## Critères d'acceptation

- [ ] Un brouillon est impossible avant la décision RH `selected`.
- [ ] Objet, HTML et texte sont éditables, prévisualisés et nettoyés.
- [ ] L'envoi exige une confirmation et une clé d'idempotence.
- [ ] Deux requêtes concurrentes avec la même clé produisent au plus un email.
- [ ] Le rendu HTML/texte est vérifié dans une boîte contrôlée, jamais chez un candidat réel.

## Hors périmètre

- Campagnes de refus ou relances automatiques.
- Promesse d'embauche définitive générée par IA.

## Vérifications

```bash
npm test --workspace @techzone/recruitment-backend
npm test --workspace @techzone/recruitment-admin
npm run verify
git diff --check
```

## Traçabilité Excel

B-046 à B-051, B-067, B-071.

<!-- backlog-key: TZR-S4-01 -->
