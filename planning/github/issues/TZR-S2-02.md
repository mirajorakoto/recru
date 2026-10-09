---
id: TZR-S2-02
title: "[S2] Finaliser le parcours public responsive et accessible"
sprint: S2
milestone: "S2 — Parcours candidat sécurisé"
due: 2026-08-19
points: 8
priority: Must
area: Public
assignee: mirajorakoto
publish: true
source_ids: B-019,B-020,B-026,B-027,B-028,B-029,B-069,B-070
depends_on: TZR-S1-01,TZR-S2-01
---

## Résumé

Cette issue finalise l'interface publique pour qu'elle soit utilisable au
clavier et sur mobile, avec des messages d'erreur compréhensibles. Elle couvre
les API et UI du parcours candidat (B-019, B-020, B-026 à B-029), complétés par
les tests responsive (B-069) et d'accessibilité (B-070).

## Objectif

Livrer le parcours offres → détail → candidature → confirmation utilisable au
clavier et sur mobile, avec des erreurs compréhensibles et sans exposition de
l'analyse interne.

## Contexte actuel

Les pages et routes publiques existent. Le formulaire utilise des champs fichier
natifs, mais le comportement responsive, le parcours clavier, les erreurs et la
promesse de glisser-déposer ne disposent pas encore d'une recette complète.

## Travail attendu

- Vérifier les règles de visibilité des offres publiées, clôturées et expirées.
- Finaliser les états chargement, vide, erreur, envoi, expiration Turnstile et confirmation.
- Rendre l'upload accessible ; n'ajouter le glisser-déposer que s'il conserve un champ clavier natif.
- Tester 320 px, tablette et bureau ainsi que labels, focus, ordre de tabulation et annonces d'erreur.
- Ajouter des tests automatisés utiles et une fiche de recette avec captures synthétiques.

## Critères d'acceptation

- [ ] Brouillons, offres clôturées et offres expirées ne sont pas candidatables.
- [ ] Le parcours complet fonctionne à 320 px sans débordement bloquant.
- [ ] Tous les champs ont un nom accessible, un focus visible et des erreurs associées.
- [ ] La confirmation affiche uniquement une référence opaque.
- [ ] Les tests et captures n'utilisent aucune donnée personnelle réelle.

## Hors périmètre

- Compte candidat, vivier et planification d'entretien.
- Refonte visuelle hors de `docs/4-reference-design.md`.

## Vérifications

```bash
npm test --workspace @techzone/recruitment-public
npm run build --workspace @techzone/recruitment-public
npm run verify
git diff --check
```

## Traçabilité Excel

B-019, B-020, B-026 à B-029, B-069, B-070.

<!-- backlog-key: TZR-S2-02 -->
