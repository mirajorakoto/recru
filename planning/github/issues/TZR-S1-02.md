---
id: TZR-S1-02
title: "[S1] Fiabiliser la configuration et le démarrage depuis la racine"
sprint: S1
milestone: "S1 — Socle fiable"
due: 2026-08-12
points: 3
priority: Must
area: Foundation
assignee: mirajorakoto
publish: true
source_ids: B-005,B-058
depends_on: TZR-S1-01
---

## Résumé

Ce travail consolide le socle technique en s'assurant que le démarrage local est
reproductible et que les variables sensibles sont validées avant tout accès
réseau. Il traite les écarts confirmés sur la configuration (B-005) et le
template d'environnement (B-058).

## Objectif

Garantir que `npm run dev`, lancé depuis la racine, charge et valide réellement
la configuration attendue avant d'utiliser OpenAI, Turnstile, SMTP ou le stockage
privé.

## Contexte actuel

`.env.example` et le template de déploiement existent, mais le script backend
lance directement `node demo-server.js`. Le chargement du `.env` racine et les
erreurs de configuration ne sont donc pas démontrés.

## Travail attendu

- Définir un schéma unique de validation des variables serveur.
- Charger explicitement le `.env` racine dans le démarrage local, sans incorporer de secret au build frontend.
- Séparer clairement les valeurs de démonstration des exigences de production.
- Aligner `.env.example`, le template de déploiement et `docs/8-variables-environnement.md`.
- Ajouter des tests de démarrage avec configuration valide et invalide.

## Critères d'acceptation

- [ ] `npm run dev` depuis la racine utilise les valeurs du `.env` racine.
- [ ] Une variable obligatoire absente ou invalide produit une erreur explicite avant l'écoute réseau.
- [ ] Les valeurs fictives et les contournements Turnstile restent strictement limités au banc d'essai.
- [ ] Aucun secret n'est journalisé, committé ou exposé à Vite.
- [ ] Les trois références de configuration sont cohérentes et testées.

## Hors périmètre

- Fourniture des secrets de production.
- Rotation des clés historiques, qui reste une responsabilité propriétaire.

## Vérifications

```bash
npm test --workspace @techzone/recruitment-backend
npm run dev
npm run verify
git diff --check
```

## Traçabilité Excel

B-005, B-058.

<!-- backlog-key: TZR-S1-02 -->
