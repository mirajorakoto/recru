# Comptes et identités de recette

## But et règle de sécurité

Ce registre définit le minimum d'identités fictives nécessaires pour rejouer
toute la recette, locale et isolée HTTPS. Il est versionné afin que les tests
soient reproductibles, mais il ne contient **jamais** de mot de passe, cookie,
jeton de session, clé Turnstile non publique, clé SMTP ou clé IA. Un dépôt Git
privé ne transforme pas un secret en donnée sûre.

Le module n'a pas de compte candidat ni de compte RH propre. Le portail de
recette valide un compte administrateur **existant** de TechZone, puis crée
uniquement le cookie de session isolé du sous-domaine.

## Jeu minimal

| Identité ou état | Rôle et périmètre | Création / accès | Nettoyage | Recette couverte |
| --- | --- | --- | --- | --- |
| Visiteur anonyme | Aucun compte. Consulte les offres publiques et doit être refusé par les API RH. | Nouveau contexte navigateur sans cookie. | Fermer le contexte. | Consultation, offre inconnue, refus `401` RH, en-têtes et stockage non public. |
| `candidate@example.test` | Candidat fictif. Aucune authentification ni accès au cockpit. | Créé par le harness d'intégration via le dépôt public avec document synthétique PDF/DOCX. | Base SQLite et stockage temporaires supprimés à la fin du test. | Dépôt, consentement, chiffrement, IA, email de test, purge et idempotence. |
| `candidate-e2e-<horodatage>@example.test` | Candidat fictif propre à Playwright. | Créé par le scénario navigateur public. | Donnée de démonstration locale seulement ; ne jamais le créer sur une base de production. | Formulaire public de bout en bout. |
| `rh.integration@example.test` | Identité RH injectée uniquement dans le harness Node. Elle représente la session hôte, pas un compte de connexion. | `packages/backend/test/integration.test.js` injecte le middleware de fixture. | Harness temporaire supprimé. | Toutes les routes RH, dossier, décisions humaines, historique et email confirmé. |
| `recrutement-browser-test@techzone.invalid` | Unique compte RH de recette à utiliser dans le navigateur réel. | `npm run deployment:test:browser-account` crée un mot de passe aléatoire, conservé exclusivement dans `deployment/private/identifiants-recette.md` (mode `0600`). Ouvrir `/admin/recrutement` et saisir ces identifiants. | Suppression automatique après deux heures, ou `npm run deployment:test:session:cleanup`. | Vhost HTTPS, connexion navigateur, refus anonyme, API RH et rendu du cockpit. |
| `recrutement-test-session@techzone.invalid` | Ancre d'automatisation HTTPS, uniquement si aucune identité admin active de l'hôte n'est disponible. | `npm run deployment:test:session` crée une session signée expirant en deux heures. | Suppression automatique programmée ; au besoin `npm run deployment:test:session:cleanup`. | Vérification automatisée du vhost et de la session. |

Ces cinq lignes sont un maximum conceptuel, pas cinq comptes persistants :
le visiteur et les candidats n'ont aucun compte, deux identités ne vivent que
dans des bases temporaires, et l'ancre HTTPS est supprimée après la recette.
Dans l'installation courante où un administrateur hôte actif existe, la
dernière ligne ne crée même pas d'utilisateur : elle crée seulement une
session temporaire liée à cet administrateur.

## Exécution complète

1. Lancer `npm run verify` : il crée ses bases, fichiers et services factices
   dans des répertoires temporaires. Aucun service externe ni compte réel n'est
   nécessaire.
2. Pour le portail isolé `recrutement.techzone.lat`, lancer dans cet ordre :
   `npm run deployment:test:preflight`, le redéploiement Compose, puis
   `npm run deployment:test:session` et `npm run deployment:test:verify`.
3. Pour vérifier l'écran RH depuis un navigateur humain, lancer
   `npm run deployment:test:browser-account`, ouvrir `/admin/recrutement` et
   utiliser l'identité privée créée par cette commande. La route publique
   `/recrutement` ne donne volontairement pas accès au cockpit.
4. À la fin d'une recette manuelle, lancer
   `npm run deployment:test:session:cleanup` si l'on ne souhaite pas attendre
   l'expiration automatique.

## Interdits

- Ne pas documenter ni commiter un mot de passe, une valeur de cookie, une
  session exportée ou une clé dans ce fichier, une issue ou une capture.
- Ne pas créer un compte RH local ou une route de connexion pour contourner le
  middleware de session de l'hôte.
- Ne pas réutiliser `@example.test` ou `@techzone.invalid` pour une personne,
  une boîte mail ou une candidature réelle.
- Ne pas utiliser la session de recette comme accès permanent au cockpit.

## Évolution nécessaire pour une recette humaine

Le portail de recette conserve l'authentification hôte : il ne duplique pas les
utilisateurs et ne stocke aucun mot de passe. Sa seule responsabilité est de
créer, après validation réussie par l'hôte, le cookie isolé nécessaire au
sous-domaine de recette.
