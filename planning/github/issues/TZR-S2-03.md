---
id: TZR-S2-03
title: "[S2] Prouver l'isolation des routes RH et des documents"
sprint: S2
milestone: "S2 — Parcours candidat sécurisé"
due: 2026-08-19
points: 5
priority: Must
area: Security
assignee: mirajorakoto
publish: true
source_ids: B-013,B-016,B-040,B-065
depends_on: TZR-S1-01,TZR-S2-01
---

## Résumé

Cette issue prouve que les routes RH et les documents candidats sont isolés du
public. Elle repose sur le middleware de session admin existant (B-013), le
blocage des accès directs (B-016), le téléchargement privé (B-040) et les tests
de non-authentification (B-065).

## Objectif

Démontrer que toutes les fonctions RH réutilisent exclusivement la session admin
TechZone et que les documents ne sont accessibles que par une route contrôlée.

## Contexte actuel

Le module injecte `requireAdminSession`, les tests couvrent plusieurs réponses
401 et une configuration nginx bloque `/media`. L'intégration réelle et les cas
de téléchargement doivent être prouvés de bout en bout.

## Travail attendu

- Inventorier toutes les routes `/api/admin/recrutement/*` et tester l'absence de session.
- Vérifier session valide, session expirée et absence de second login ou JWT.
- Tester qu'un identifiant de fichier appartenant à un autre dossier ne peut pas être téléchargé.
- Vérifier les en-têtes de téléchargement, le nom de fichier et l'absence de cache public.
- Documenter la recette nginx directe sans exposer de chemin de stockage réel.

## Critères d'acceptation

- [ ] Toutes les routes RH retournent 401 sans session valide.
- [ ] Une session admin TechZone valide suffit, sans authentification propre au module.
- [ ] Un fichier n'est téléchargeable que depuis son dossier autorisé via la route RH.
- [ ] Les accès directs au stockage et à `/media` répondent 403 ou 404.
- [ ] Aucun chemin privé, clé ou contenu candidat n'apparaît dans les journaux ou réponses d'erreur.

## Hors périmètre

- Création d'un nouveau mécanisme d'authentification.
- Déploiement final, traité dans TZR-S4-03.

## Vérifications

```bash
npm test --workspace @techzone/recruitment-backend
npm run verify
git diff --check
```

## Traçabilité Excel

B-013, B-016, B-040, B-065.

<!-- backlog-key: TZR-S2-03 -->
