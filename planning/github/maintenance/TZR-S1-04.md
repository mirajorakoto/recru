# TZR-S1-04 — Corriger les vulnérabilités npm

Suivi de maintenance local, hors des douze issues qui tracent les 75 lignes du
classeur historique. Il ne doit donc pas être chargé par `backlog:validate`.

## Objectif

Corriger les vulnérabilités remontées par `npm audit` avant toute nouvelle
dépendance et revalider l'application complète.

## Critères de fermeture

- aucune vulnérabilité critique ou haute dans `npm audit`;
- `npm run verify` est vert après mise à jour;
- les modérées éventuellement restantes sont documentées avec leur portée et
  une date de revue.
