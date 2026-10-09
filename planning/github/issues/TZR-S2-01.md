---
id: TZR-S2-01
title: "[S2] Durcir la soumission candidat et le stockage documentaire privé"
sprint: S2
milestone: "S2 — Parcours candidat sécurisé"
due: 2026-08-19
points: 8
priority: Must
area: Security
assignee: mirajorakoto
publish: true
source_ids: B-014,B-015,B-017,B-018,B-021,B-022,B-023,B-024,B-025,B-066
depends_on: TZR-S1-02,TZR-S1-03
---

## Résumé

Ce sprint sécurise le parcours extérieur avant d'ouvrir les outils internes : il
est inutile de construire un cockpit RH si les candidatures ne peuvent pas être
déposées de manière fiable. Cette issue durcit la chaîne de soumission et de
stockage, de la validation du fichier au chiffrement sur disque (B-014, B-015,
B-017, B-018, B-021 à B-025, B-066).

## Objectif

Prouver et compléter la chaîne publique de dépôt afin qu'aucun fichier non
conforme, consentement absent ou accès direct ne contourne les protections.

## Contexte actuel

Le socle contient Turnstile, rate limiting, validation PDF/DOCX et chiffrement
AES-256-GCM. L'issue doit vérifier les frontières et compléter les cas non
couverts, sans remplacer une implémentation conforme.

## Travail attendu

- Tester extension, MIME, signature, structure DOCX, macros, archives dangereuses et limites compressées/décompressées.
- Vérifier le nettoyage en cas d'échec entre création du dossier, chiffrement et écriture des métadonnées.
- Vérifier consentement, anti-robot, rate limit, doublons et référence publique opaque.
- Garantir permissions privées, noms non prédictibles et absence de binaire en base.
- Ajouter les tests négatifs et documenter les limites résiduelles.

## Critères d'acceptation

- [ ] CV PDF/DOCX valide accepté, lettre facultative et CV obligatoire.
- [ ] Faux PDF, DOCM, macro, archive dangereuse et dépassements sont rejetés avec un message français exploitable.
- [ ] Aucun fichier orphelin ni dossier partiel ne subsiste après une erreur.
- [ ] Le contenu sur disque est chiffré et la réponse publique ne révèle ni chemin ni analyse.
- [ ] Turnstile et rate limiting sont actifs hors mode de démonstration.

## Hors périmètre

- Analyse IA du contenu, traitée en S3.
- Stockage de documents candidats réels pendant les tests.

## Vérifications

```bash
npm test --workspace @techzone/recruitment-backend
npm run verify
git diff --check
```

## Traçabilité Excel

B-014, B-015, B-017, B-018, B-021 à B-025, B-066.

<!-- backlog-key: TZR-S2-01 -->
