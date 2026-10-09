# Instructions de contribution

- Le code et les identifiants techniques sont en anglais; les interfaces et la documentation métier sont en français.
- Ne jamais ajouter de secret, donnée candidat réelle, export de production ou clé privée au dépôt.
- Ne jamais créer une décision d’embauche automatique. L’IA produit uniquement une analyse à vérifier par un RH.
- Toute nouvelle route `/api/admin/recrutement/*` doit réutiliser le middleware de session fourni par l’hôte.
- Conserver les documents candidats hors de tout dossier public et chiffrés au repos.
- Ajouter des commentaires concis uniquement lorsque l’intention, la sécurité ou la reproductibilité ne sont pas évidentes.
- Avant une pull request, exécuter `npm run verify` et vérifier que `git diff --check` ne signale rien.
