# TechZone Recrutement

Socle applicatif du produit TechZone Recrutement, conçu pour être repris, développé et intégré dans `www.techzone.lat`.

Ce dépôt fournit un point de départ exécutable, les décisions déjà validées et les contrats attendus. Il ne constitue pas une implémentation figée : le développeur qui en reprend la responsabilité dispose de l'autonomie nécessaire pour améliorer, refactoriser ou remplacer les choix techniques, à condition de préserver les exigences métier, de sécurité, de confidentialité, d'intégration et de recette.

## Ce que contient ce dépôt

- un backend Express/SQLite montable sous `/api/recrutement` et `/api/admin/recrutement`;
- une interface publique React pour `/recrutement`;
- un panneau RH React réutilisant la session admin de l'hôte;
- un banc d'essai local avec données strictement fictives;
- le modèle de CV compatible ATS, son aperçu PDF et un prompt de conversion;
- les contrats d'intégration, de sécurité, de confidentialité et de recette.

## Démarrage local

Prérequis: Node.js 20+, npm et les outils de compilation requis par `better-sqlite3`.

```bash
npm ci
npm run setup:env
npm run docs:generate
npm run dev
```

`npm run setup:env` fonctionne sous Windows et Linux et ne remplace jamais un
fichier `.env` existant.

Ouvrir `http://localhost:5173/recrutement` ou `http://localhost:5173/admin/recrutement`.

Le banc d'essai utilise toujours une authentification RH fictive et une analyse IA déterministe : il n'envoie jamais de document à OpenAI. Seule l'intégration backend de production active Responses API lorsque le chef de projet lui transmet explicitement la clé serveur.

## Vérification

```bash
npm run verify
```

L'intégration de production est décrite dans `docs/7-integration-techzone.md`. La validation juridique et la formalité CMIL restent des prérequis de mise en ligne.

## Ordre de lecture recommandé

1. `docs/1-reprise-projet.md` : comprendre le mandat, l'autonomie et les livrables attendus.
2. `docs/2-cahier-des-charges.md` : maîtriser le périmètre fonctionnel et les règles métier.
3. `docs/3-securite-confidentialite-ia.md` : identifier les contraintes non négociables avant toute décision technique.
4. `docs/4-reference-design.md` : comprendre les conventions visuelles publiques et administratives.
5. `docs/5-modele-donnees.md` : étudier les entités, les états et la politique de conservation.
6. `docs/6-openapi.yaml` : examiner précisément le contrat des API.
7. `docs/7-integration-techzone.md` : préparer le raccordement au site et aux services existants.
8. `docs/8-variables-environnement.md` : configurer les paramètres et secrets nécessaires.
9. `docs/9-recette-livraison.md` : vérifier les conditions permettant de considérer le produit comme livré.
10. `docs/10-backlog-github.md` : piloter les sprints, les issues et les preuves de livraison.
11. `docs/11-diagnostic-et-livraison.md` : diagnostic de reprise, écarts corrigés, décisions à arbitrer et risques résiduels après audit.
12. `docs/12-checklist-validation-playwright.md` : checklist exécutable de validation API, UI et intégrations à remettre à l’agent Playwright.
