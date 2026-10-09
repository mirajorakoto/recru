# Suivi de livraison MVP

Ce fichier est le point de reprise du chantier. Les secrets et valeurs de
configuration réelles restent exclusivement dans les fichiers `.env` ignorés.

## Lot 0 — État initial

- [x] Enregistrer les changements existants : `135e397`.
- [x] Vérifier que le dépôt ne contient pas de fichier `.env` local suivi.
- [x] Auditer le code, la configuration effective et les documents de livraison.
- [x] Exécuter les validations de référence et consigner leurs résultats : `npm run verify` vert, mais génération documentaire initialement non déterministe.

## Lot 1 — Fonctionnalité et sécurité

- [x] Unifier la validation de configuration et retirer le fichier de déploiement contenant des valeurs sensibles du suivi Git.
- [x] Bloquer le banc d'essai sur `127.0.0.1` et rendre les ressources ATS déterministes.
- [x] Corriger le cycle de vie des offres, les échéances, la réservation IA atomique et la purge périodique.
- [x] Ajouter des DTO explicites, une pagination bornée et des filtres RH validés.
- [x] Mettre à niveau les dépendances et rétablir la validation du backlog : `npm audit` sans vulnérabilité connue, `npm run backlog:validate` vert.
- [x] Compléter le cockpit RH : filtres, pagination, retour « à revoir », relance IA, états d'action et clé d'idempotence par brouillon.
- [x] Durcir le dépôt candidat et le journal d'audit : PDF complet, URL portfolio, reprise IA, échec SMTP et échec IA tracés sans donnée sensible.
- [x] Ajouter une recette Playwright locale sur loopback : liste/détail publics,
  route inconnue, cockpit RH, navigation clavier et écrans mobile/tablette/bureau.
- [x] Vérifier les flux candidat, RH, IA, courriel, stockage chiffré et rétention de bout en bout avec une fixture isolée (`npm run test:integration`).
- [x] Démarrer `server.js` en production avec un adaptateur hôte de fixture, health check et refus RH anonyme.
- [x] Rendre l'écoute de l'entrée autonome privée par défaut; l'image Docker seule écoute sur son interface interne, publiée par Compose uniquement sur loopback.
- [x] Contrôler les 15 routes Express contre OpenAPI (chemin, méthode et garde RH).
- [x] Valider la syntaxe OpenAPI 3.1 avec Redocly.
- [x] Éliminer les défauts internes observables du MVP et ajouter les tests ciblés.
  Les validations dépendantes de l'hôte restent explicitement listées ci-dessous.

## Lot 2 — Exploitation locale sûre

- [x] Vérifier que le démarrage de développement est configuré pour la boucle locale.
- [x] Exécuter le smoke test local : `/api/health` répond sur `127.0.0.1:3111` et `ss` confirme l'absence d'écoute réseau publique.
- [x] Vérifier l'image de déploiement : `npm run test:container` construit l'image et valide health/401 avec une fixture sur loopback; Compose reste configuré sur le port `3011`. L'adaptateur privé de session hôte reste requis en production.
- [x] Exclure du contexte Docker les environnements privés, l'adaptateur hôte et le stockage candidat; une régression est couverte par test.
- [x] Réduire l'image runtime aux dépendances de production et au backend; le smoke test refuse les outils et scripts de test résiduels.
- [x] Préparer les montages hôte et variables de déploiement non sensibles dans des fichiers privés `0600`.
- [x] Monter le code hôte en lecture seule et son seul répertoire SQLite en écriture, afin de préserver les sessions et candidatures sans rendre le code modifiable.
- [x] Vérifier au prévol la présence et les permissions du fichier SQLite hôte et de son répertoire, sans écrire dans la base réelle.
- [x] Vérifier en lecture seule que la base hôte contient les tables de session
  et d'administrateurs requises par l'adaptateur.
- [x] Documenter une recette exacte et les écarts résiduels : `test:container`,
  `deployment:preflight` et la section des gaps externes ci-dessous.
- [x] Ajouter `deployment:external-check`, qui valide les certificats TLS des
  origines configurées sans modifier l'hôte.
- [x] Faire réutiliser au prévol le schéma de configuration du serveur pour
  refuser les valeurs de production mal formées avant lancement.

## Critères de clôture

- [x] `npm run verify` réussit : 54 tests backend, tests UI, 9 scénarios Playwright Chromium et builds verts.
- [x] `git diff --check` est propre et le worktree est propre après validation.
- [x] Les exigences de sécurité d'`AGENTS.md` sont satisfaites dans ce dépôt :
  session hôte injectée, aucune décision IA automatique, documents chiffrés et
  hors des dossiers publics, secrets ignorés par Git.
- [x] Chaque lot est committé séparément avec une preuve de validation.

## Lot 3 — Recette isolée `recrutement.techzone.lat`

- [x] Créer une pile Docker distincte : port loopback `3012`, volume candidat,
  cookie RH et clé de chiffrement dédiés.
- [x] Utiliser la paire Turnstile officielle de test exclusivement dans cette
  pile, avec IA déterministe et transport SMTP non émetteur.
- [x] Monter le module hôte `shared` en lecture seule et basculer l'image
  Debian afin de charger l'extension SQLite native de l'hôte.
- [x] Créer le vhost nginx dédié et le certificat TLS : certificat valide
  jusqu'au 8 décembre 2026.
- [x] Faire passer `deployment:external-check` contre le fichier isolé : le
  certificat présenté et les origines HTTPS sont valides.
- [x] Prouver `401` sans cookie et `200` avec une session RH de recette
  temporaire, expirant deux heures après sa création.
- [x] Réarmer à chaque création la suppression de la session et du compte RH
  synthétique après deux heures (`techzone-recruitment-test-session-cleanup.timer`).
- [x] Imposer un unique saut nginx de confiance afin que le rate-limit utilise
  l’IP client sans accepter une chaîne `X-Forwarded-For` forgée.
- [x] Renvoyer un JSON `404` pour une route `/api/*` inconnue, sans masquer
  une erreur d’intégration par le fallback SPA de la recette.
- [x] Charger la configuration publique Turnstile par JSON non mis en cache,
  sans avertissement Vite ni clé compilée dans les assets.
- [x] Désactiver l’empreinte `X-Powered-By` et ajouter les en-têtes de
  protection de contenu, référent et cadre à l’entrée autonome.
- [x] Rendre la recette HTTPS rejouable par `npm run deployment:test:verify`
  sans afficher le cookie ou les secrets temporaires.

## Gaps externes à remettre au propriétaire TechZone

- La recette isolée est autonome, mais la production principale requiert ses
  propres clé Turnstile, secret de session, SMTP et IA; ces valeurs ne doivent
  pas être reprises depuis l'environnement de test. Le prévol du 9 septembre
  2026 bloque actuellement sur `SESSION_SECRET` et
  `VITE_TURNSTILE_SITE_KEY` absents : fournir le secret déjà employé par le
  middleware hôte et créer le widget Cloudflare pour l'origine principale.
- Vérifier les sauvegardes chiffrées/restauration et les exigences
  juridiques/CMIL avant la production. Ces éléments ne sont pas simulables par
  la recette isolée.
- Renouveler le certificat TLS de `www.techzone.lat` sur l’hôte que cible son
  DNS, ou corriger ce DNS vers l’hôte qui porte le vhost. Le 9 septembre 2026,
  il résolvait vers `13.247.123.11`, hors de ce VPS, et le minuteur Certbot
  local échouait; aucun contournement de validation TLS ne doit être utilisé.
- L'accès par session hôte est prouvé sur le sous-domaine de recette; le
  cookie et son reçu restent sous `deployment/private/` en mode `0600` et sont
  à supprimer après recette.
