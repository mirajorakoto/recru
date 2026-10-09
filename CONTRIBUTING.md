# Contribution

1. Prendre une issue `Ready`, puis créer `feature/<numero-issue>-<sujet>` depuis `main`.
2. Utiliser uniquement des données synthétiques dans les tests et captures.
3. Mettre à jour contrat, tests et documentation lorsque l’API ou le schéma change.
4. Exécuter `npm run verify`, `git diff --check` et une recherche de secrets avant le push.
5. Ouvrir une pull request contenant `Closes #<numero-issue>` et documentant le besoin traité, les choix structurants, les vérifications exécutées et les éventuels impacts d'intégration.

Une pull request ne doit jamais automatiser la décision RH, ajouter un second mécanisme d’authentification ou rendre un document candidat public.
