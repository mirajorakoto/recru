# Checklist de validation exhaustive — API et interfaces

Cette checklist est le contrat de recette à remettre à l’agent chargé des tests
Playwright. Elle couvre le périmètre V1 décrit dans le cahier des charges.
Une case n’est validée que si le test est reproductible, automatisé et exécuté
avec des données fictives.

## État réel audité et règle d’usage

### Mise à jour au 9 septembre 2026

Les écarts internes `CONT-03` à `CONT-16` ont été corrigés ou réduits par des
tests ciblés : cycle irréversible, échéances UTC, réservation IA atomique,
purge planifiée, DTO publics/RH, pagination et filtres, actions RH, validation
de dépôt, journal d'audit et idempotence d'email. Les dépendances sont aussi à
jour (`npm audit` ne signale aucune vulnérabilité). La table qui suit trace
désormais la fermeture de chaque écart et distingue explicitement les limites
qui dépendent encore de l’exploitation.

La recette isolée prouve la session RH hôte, le vhost nginx et son certificat
sur `recrutement.techzone.lat`. Restent externes au module la sauvegarde et la
restauration atomiques de la base partagée, les prestataires réels du site
principal et les validations juridiques. Le serveur de production refuse de
démarrer sans l'adaptateur hôte, plutôt que de servir une session RH fictive.

Le prévol principal rejoué le 9 septembre 2026 refuse aussi explicitement
`deployment/recruitment.env` tant que `SESSION_SECRET` et
`VITE_TURNSTILE_SITE_KEY` n'y sont pas définis. Le premier doit être la valeur
déjà utilisée par le middleware de session de l'hôte; la seconde doit provenir
d'un widget Cloudflare Turnstile créé pour l'origine principale. Aucune
autorité Cloudflare n'est disponible sur ce VPS et la paire officielle de test
reste techniquement interdite hors de la recette isolée.

Le 9 septembre 2026, le certificat présenté par `www.techzone.lat` expirait le
18 août 2026. Ce défaut de l'hôte bloque la recette publique HTTPS : il doit
être renouvelé puis vérifié avec la validation TLS active, jamais contourné par
une option client qui ignore le certificat. Le même jour, `www.techzone.lat`
résolvait vers `13.247.123.11`, hors de ce VPS, et le minuteur Certbot local
était en échec : le renouvellement doit donc être réalisé sur l'hôte cible ou
après correction du DNS, jamais forcé depuis ce VPS.

Depuis cette mise à jour, Playwright 1.63 est installé et `npm run test:e2e`
exécute Chromium sur `127.0.0.1` : liste et détail publics, URL d'offre inconnue,
cockpit RH de démonstration, navigation clavier et largeurs mobile, tablette et
bureau. `npm run test:integration`
monte aussi le module réel sur SQLite et stockage temporaires, avec faux
Turnstile, IA et SMTP. `npm run verify` exécute les deux recettes; la recette
isolée complète cette preuve par un cookie de session hôte temporaire.

**Verdict : recette d'intégration réelle disponible sur
`https://recrutement.techzone.lat`.** Le 9 septembre 2026, le conteneur isolé
écoutant uniquement sur `127.0.0.1:3012`, le vhost nginx et son certificat
TLS dédié ont été vérifiés. La garde RH hôte retourne `401` sans cookie et
`200` avec une session temporaire; `deployment:external-check` valide aussi
ses origines HTTPS. La configuration Turnstile est chargée au runtime par JSON
sans cache; une route API inconnue y retourne aussi un JSON `404`,
tandis que le fallback SPA reste limité aux routes d’interface. Cette recette utilise exclusivement la
paire Turnstile officielle de test, une IA déterministe et un transport email
non émetteur : elle ne vaut ni mise en production ni preuve des prestataires
externes réels.

`npm run deployment:test:verify` rejoue sur ce sous-domaine les contrôles
health, refus anonyme, session RH, attributs du cookie, Turnstile, en-têtes,
fallback SPA et interdiction de servir le stockage. La commande ne journalise
ni cookie ni valeur sensible.

`npm run deployment:test:session` programme aussi le nettoyage de son compte
et cookie synthétiques à l’expiration. Une réexécution remplace le minuteur
précédent; si ce minuteur ne peut pas être armé, la session est immédiatement
supprimée au lieu de rester active sans échéance.

### Éléments réellement vérifiés dans l’arbre courant

| Périmètre inspecté | Évidence | État constaté |
| --- | --- | --- |
| Module Express, routes, repository, sécurité et worker | `packages/backend/src/{routes,repository,security,worker,ai,index}.js` | Les invariants de cycle, concurrence, validation de dépôt, chiffrement, écoute loopback par défaut, mounts Compose minimaux, exclusion du contexte Docker, contrôle TLS externe sans fuite de valeur et analyse à revue humaine sont couverts par 54 tests backend. |
| Schéma et migration | `packages/backend/src/migrations/001_init.sql` et runner | Schéma transactionnel et rejouable, vérifié sur base neuve, existante et en échec atomique. |
| UI candidate | `packages/public-ui/src/index.jsx` et CSS | Liste, détail, dépôt, Turnstile et succès existent; le détail direct affiche les informations métier requises et l'URL inconnue conserve une navigation claire. |
| UI RH | `packages/admin-ui/src/index.jsx` et CSS | Offres, dossier, filtres, décision, retour à revoir, reprise IA et erreurs d'action sont présents dans la démo; la session réelle reste à raccorder. |
| Contrats et intégration | `docs/6-openapi.yaml`, `docs/7-integration-techzone.md`, nginx, Docker et manifest | `server.js` démarre avec l'adaptateur hôte réel sur SQLite partagée; le 9 septembre 2026, `recrutement.techzone.lat` a prouvé health, `401` RH anonyme et `200` avec la session temporaire. Les 15 routes Express sont contrôlées contre OpenAPI (méthode et garde RH), dont la syntaxe est validée par Redocly. Le code et `shared` hôte sont montés en lecture seule; seul SQLite est inscriptible. |
| Tests exécutés | `npm run verify` exécuté dans cet arbre | 54 tests backend, tests UI, 9 scénarios Chromium Playwright et builds verts. La recette réelle a aussi prouvé health, refus RH anonyme et accès par session temporaire. |
| Dépendances | `npm audit --audit-level=moderate` exécuté | Aucune vulnérabilité connue. |
| Configuration locale | `.env` chargé puis smoke test | Le développement écoute sur `127.0.0.1:3111`, distinct des services déjà présents sur 3001/3002; le fichier est ignoré par Git et en mode 0600. |
| Validation du backlog | `npm run backlog:validate` exécuté | Vert : 12 brouillons, 75 IDs et 236 points Excel. |
| Reproductibilité documentaire | `npm run verify` exécuté puis état Git relu | Vert : la génération documentaire ne laisse pas d'artefact suivi modifié quand les sources sont inchangées. |

Les tests établissent les propriétés locales utiles (migrations, session
injectée en test, chiffrement, isolation de fichier, analyse sans décision,
idempotence, purge et parcours navigateur). « Vert » ne signifie pas que les
preuves externes sont acquises.

### État de fermeture des écarts

Les références `P0` bloquent la sécurité, la conservation, le parcours Must
ou le déploiement. Les `P1` sont nécessaires pour l’API/UI complète promise.
Les `P2` sont du durcissement ou une décision d’exploitation à formaliser.

| ID | Priorité | Constat vérifiable | Correction attendue et preuve de fermeture |
| --- | --- | --- | --- |
| CONT-01 | P0 | Corrigé : `Dockerfile` construit sans masquer d'échec, conserve seulement les dépendances de production et lance `/app/packages/backend/server.js`. `npm run test:container` construit l'image, vérifie l'absence d'outils de test puis démarre une fixture de production avec health check et refus RH anonyme sur loopback. | Rejouer la recette après chaque modification de l'image. |
| CONT-01b | P0 | Corrigé pour la recette isolée : `docker-compose.recruitment-test.yml` publie seulement `127.0.0.1:3012`, utilise son volume candidat et cookie propres, puis `deployment:test:preflight` valide ses fichiers privés et mounts. Les clés Turnstile officielles de test sont acceptées seulement avec les marqueurs de recette isolée. | Rejouer le prévol avant chaque redéploiement; ne jamais copier ces clés dans l'environnement principal. |
| CONT-02 | P0 | Corrigé pour la recette isolée : l'adaptateur hôte réel s'exécute avec le backend et son module `shared` montés en lecture seule, et SQLite en écriture. Le 9 septembre 2026, `https://recrutement.techzone.lat/api/admin/recrutement/offres` a répondu `401` sans cookie, puis `200` avec une session temporaire signée et expirant après deux heures. | La production principale doit encore fournir sa propre session et ses paramètres sans réutiliser le cookie de recette. |
| CONT-03 | P0 | Corrigé : le cycle est irréversible (`draft → published → closed → archived`); une réouverture est refusée et la purge n’agit plus sur une offre réouverte. | Test de transition et test de purge dans `module.test.js`. |
| CONT-04 | P0 | Corrigé : l’échéance est validée, normalisée en ISO UTC et contrôlée sur la liste, le détail et le dépôt. | Tests de frontière d’échéance dans `module.test.js`. |
| CONT-05 | P0 | Corrigé : la réservation IA est atomique; deux workers concurrents ne peuvent obtenir le même dossier. | Test multi-worker avec un unique appel IA dans `module.test.js`. |
| CONT-06 | P0 | Corrigé : `createPurgeScheduler` lance une purge périodique unique, observable et arrêtée proprement. | Tests du scheduler et de la rétention dans `module.test.js`. |
| CONT-07 | P0 | Corrigé : la liste RH est paginée, bornée, filtrée et utilise un DTO sans analyse complète ni chemin privé. | Test pagination/filtres/DTO dans `module.test.js`. |
| CONT-08 | P0 | Corrigé : le cockpit RH propose « à revoir » et relance IA, avec confirmation, états pending et erreurs accessibles. | Tests UI et Playwright locaux. |
| CONT-09 | P0 | Corrigé : le détail public affiche employeur, lieu, contrat et mode de travail. | Scénario Playwright d’accès direct. |
| CONT-10 | P1 | Corrigé : les filtres RH sont validés côté API et présents dans le cockpit avec pagination. | Tests de combinaison et d’absence de résultat. |
| CONT-11 | P1 | Corrigé pour les routes : OpenAPI décrit désormais les 15 routes, y compris la relance, et un test compare méthode et garde RH à `routes.js`. Le DTO public est séparé du DTO RH afin de ne pas promettre le statut interne. | Maintenir le test de parité à chaque route ajoutée et compléter les exemples de réponse si une intégration cliente en requiert. |
| CONT-12 | P1 | Corrigé : la validation centralise bornes, slug, dates, email, URL, identifiants et contraintes d’offre; les erreurs sont métier. | Tests négatifs par champ dans `module.test.js`. |
| CONT-13 | P1 | Corrigé pour le vhost conteneurisé : PDF/DOCX et `portfolio_url` sont validés, et `TRUST_PROXY_HOPS=1` est imposé en production. `server.js` ne fait donc confiance qu’au saut nginx local pour calculer l’IP du rate-limit; un port conteneur exposé directement ou plusieurs sauts font échouer le prévol. | Pour un futur déploiement multi-instance, remplacer le store mémoire du rate-limit par un store partagé et ajouter une recette de charge. |
| CONT-14 | P1 | Corrigé : reprise IA, échecs IA/SMTP et transitions importantes produisent des événements sans contenu sensible; la purge expose son résultat agrégé. | Tests d’historique, reprise, échecs et rétention. |
| CONT-15 | P1 | Corrigé : l’idempotence d’email est gérée par le serveur et la version de brouillon, avec confirmation RH explicite. | Test d’aller-retour de décision et d’unicité d’envoi. |
| CONT-16 | P2 | Corrigé : `toPublicJob` utilise une allowlist et ne retourne aucune métadonnée interne. | Test de contrat public. |
| CONT-17 | P2 | Partiellement externe : le vhost de recette bloque `/media/recrutement/` et le stockage n’est pas web-servi; aucune sauvegarde/restauration chiffrée de la base SQLite partagée n’est automatisée afin de ne pas exporter les données d’autres services du VPS. | Le propriétaire doit définir une sauvegarde atomique, chiffrée et testée sur le périmètre de la base partagée. |
| CONT-18 | P0 | Corrigé : dépendances mises à niveau, `npm audit --audit-level=moderate` ne remonte aucune vulnérabilité et Playwright est installé après cette validation. | Rejouer l'audit à chaque mise à jour des dépendances. |
| CONT-19 | P1 | Corrigé : `npm run backlog:validate` est vert avec les brouillons et métadonnées alignés. | Rejouer la validation en CI. |
| CONT-20 | P1 | Corrigé : la génération ATS est déterministe; `npm run verify` n’a pas créé de diff après génération. | Contrôle `git diff --check` à chaque lot. |
| CONT-21 | P0 | Le certificat de `www.techzone.lat` restait expiré lors du contrôle du 9 septembre 2026. Son DNS visait alors `13.247.123.11`, hors de ce VPS, tandis que le minuteur Certbot local était en échec : un renouvellement local ne peut donc pas le réparer. En revanche, `recrutement.techzone.lat` possède désormais un certificat dédié valide jusqu'au 8 décembre 2026, obtenu et installé par Certbot sans désactiver la validation TLS. | Renouveler le certificat sur l'hôte que cible le DNS, ou corriger le DNS vers l'hôte qui porte le vhost, avant toute recette qui cible `www.techzone.lat`; ne jamais utiliser un contournement de certificat. |

### Ordre d’implémentation imposé

1. Corriger CONT-01 à CONT-06 et ajouter leurs tests unitaires/intégration.
   Ce sont des défauts de déploiement, de conservation ou de concurrence : il
   serait irresponsable de commencer par embellir l’UI avant eux.
2. Construire les DTO et la pagination (CONT-07, CONT-10 à CONT-12), mettre à
   jour OpenAPI dans le même changement, puis adapter l’UI RH.
3. Compléter les deux parcours UI (CONT-08, CONT-09, CONT-15) avec des états
   accessibles et des tests Playwright réels.
4. Corriger les dépendances et la validation de pilotage (CONT-18, CONT-19),
   avant l’ajout de Playwright afin de ne pas empiler une nouvelle dépendance
   sur une chaîne déjà vulnérable.
5. Rendre la vérification reproductible (CONT-20), sans quoi une PR propre
   paraît artificiellement modifiée après son propre contrôle.
6. Durcir l’exploitation et l’audit (CONT-13, CONT-14, CONT-16, CONT-17),
   brancher l’hôte et réaliser la recette humaine/juridique.

Chaque correction doit comporter : migration si les données persistées sont
touchées, test de régression, adaptation OpenAPI/documentation et scénario
Playwright correspondant ci-dessous. Ne pas corriger un symptôme UI en
contournant l’API : les invariants doivent être imposés côté serveur.

### Décisions à figer avant de coder

- **Cycle d’offre :** recommandation : `draft → published → closed → archived`
  sans réouverture. Si une réouverture est voulue, elle doit avoir un nom, une
  autorisation, une date de clôture remise à zéro et une règle de conservation
  écrite.
- **Email de sélection :** préciser s’il est strictement unique par dossier ou
  s’il existe plusieurs brouillons/version d’envoi. Dans les deux cas la clé
  d’idempotence doit être créée par le serveur, pas devinée par le navigateur.
- **Purge :** choisir le propriétaire du scheduler (module ou hôte), sa
  fréquence, la métrique/alerte d’échec et la preuve de suppression des
  fichiers avant mise en ligne.
- **Production :** nom réel du cookie, protection CSRF/origine, `trust proxy`,
  limite d’upload nginx, emplacement hors webroot, sauvegardes et restauration
  sont des paramètres de l’hôte. Ils ne peuvent pas être déduits de ce dépôt.

### Traçabilité complète du backlog B-001 à B-075

Cette table évite de confondre un périmètre visible avec un périmètre complet.
Chaque plage doit avoir au moins une preuve dans cette page ou dans la suite de
tests indiquée; les contrôles humains ne sont jamais simulés comme réussis.

| Backlog | État de l’audit | Preuve/continuité obligatoire |
| --- | --- | --- |
| B-001–B-006 Infrastructure | Socle workspace, Express, SQLite, image Debian et tests présents; l'image de déploiement démarre avec son health check sur loopback. | CONT-01, `test:container`, migrations et health check conteneur. |
| B-007–B-012 Modèle/migrations | Tables et runner présents, tests d’idempotence verts. | API-RH-04, API-DOS-01, migration de tout correctif de cycle de vie. |
| B-013–B-018 Sécurité | Middleware injecté, chiffrement, Turnstile, rate limit et nettoyage sont couverts; la recette isolée prouve aussi le proxy nginx, le cookie RH et le stockage non public. | API-RH-01/02, API-PUB-07/11/12, API-DOS-06 à 09, CONT-02/13/17. |
| B-019–B-029 Parcours candidat | API, détail métier, dépôt chiffré et parcours responsive existent; Playwright contrôle la navigation clavier et les largeurs 320/768/1440. | API-PUB-01 à 12, UI-PUB-01 à 09, CONT-04/09. |
| B-030–B-035 IA | Worker, Structured Outputs, garde-fou non décisionnel et réservation atomique sont couverts par test concurrent. | API-DOS-03 à 05, CONT-05 et test multi-worker. |
| B-036–B-045 Cockpit RH | CRUD/détail/décision, pagination, filtres, reprise IA et état « à revoir » sont présents et testés. | API-RH-03 à 10, API-DOS-01/11, UI-RH-02 à 08, CONT-07/08/10. |
| B-046–B-051 Email | Brouillon, nettoyage, idempotence, confirmation RH et états d’échec sont imposés côté serveur. | API-MAIL-01 à 08, UI-RH-09/10, CONT-15. |
| B-052–B-056 Conservation/audit | Purge planifiée, rapport agrégé et historique candidat sont présents sans contenu sensible. | API-DOS-10/11, CONT-06/14. |
| B-057–B-063 Déploiement/démo | Manifest, nginx, image fonctionnelle et raccordement de session hôte sont prouvés dans la recette isolée HTTPS. | CONT-01/02/17, health check, test nginx réel. |
| B-064–B-071 Tests | Tests Node, Vitest et neuf scénarios Playwright existent, dont dépôt synthétique, clavier et responsive; la recette isolée prouve la session hôte sur son sous-domaine. | Étendre les scénarios métier au besoin et joindre le rapport CI. |
| B-072–B-075 Documentation | Documentation et OpenAPI couvrent les routes réelles, leurs méthodes et la garde RH; les risques de raccordement hôte restent ouverts. | CONT-11/17 et revue propriétaire. |
| Hors Excel — TZR-S1-04 | Audit npm et pilotage de dépendances ajoutés par une issue locale. | CONT-18/19; ne pas ignorer l’échec du validateur ou les alertes critiques/hautes. |
| Hors Excel — génération | Ressources CV générées lors de `verify`. | CONT-20; le contrôle lui-même ne doit pas créer un diff imprévisible. |

## Règle de vérité

Playwright en mode headless est requis pour les parcours navigateur et peut
utiliser son contexte `request` pour les API. Il ne suffit toutefois pas à
prouver le chiffrement sur disque, la purge, les reprises du worker, l’envoi
SMTP réellement unique en concurrence ou le raccordement à la vraie session de
l’hôte. Ces contrôles doivent être exécutés dans le même pipeline avec des
adaptateurs de test (base SQLite temporaire, stockage temporaire, faux SMTP et
faux service IA). Déclarer ces tests comme « validés par le navigateur » serait
trompeur.

Ne jamais utiliser de candidat réel, de CV réel, de clé réelle ni de boîte
mail non contrôlée. Utiliser des PDF/DOCX synthétiques minimaux et un nom de
domaine de test, par exemple `candidate@example.test`.

## Architecture de test actuelle et extensions nécessaires

Playwright est verrouillé dans `package.json`, Chromium est la seule cible et
`playwright.config.cjs` démarre/arrête les deux serveurs de démonstration sur
loopback. Les traces sont conservées uniquement à l'échec.
`packages/backend/test/integration.test.js` crée déjà par test une SQLite et
un stockage chiffré temporaires, avec faux Turnstile, IA, SMTP et session RH
de fixture. Il reste à brancher la session hôte réelle.

Structure minimale recommandée :

```text
tests/e2e/
  fixtures/recruitment-harness.{js,ts}  # SQLite + stockage mkdtemp + faux IA/SMTP/Turnstile
  fixtures/documents.{js,ts}            # PDF/DOCX synthétiques, jamais un CV
  public.spec.{js,ts}                   # UI-PUB-*
  admin.spec.{js,ts}                    # UI-RH-* avec session E2E hôte
  api-public.spec.{js,ts}               # API-PUB-* via request
  api-admin.spec.{js,ts}                # API-RH-*, API-DOS-*, API-MAIL-*
  worker-and-retention.spec.{js,ts}     # concurrence, retry, purge et disque
```

Le harness E2E doit créer par test une base SQLite et un répertoire avec
`mkdtemp`, injecter `fetchImpl` pour Turnstile, et exposer des compteurs
strictement de test : appels IA, appels SMTP, fichiers chiffrés et événements.
Il ne doit jamais être inclus dans le point d’entrée de production. Le faux
SMTP doit bloquer ou échouer à la demande afin de tester les courses et les
reprises; le faux IA doit pouvoir être lent, invalide ou en erreur.

Les commandes suivantes sont incluses dans `npm run verify` :

```bash
npm run test:e2e          # Chromium headless avec serveurs loopback gérés
npm run test:integration  # API réelle, SQLite et stockage temporaires isolés
npm run verify            # inclut Node, Vitest, Playwright et builds
git diff --check
```

Une suite qui utilise le serveur de démonstration actuel ne peut pas prouver
`UI-RH-01`, car ce serveur accepte inconditionnellement toute requête RH. Il
faut un harness séparé qui monte le même middleware injecté avec une session
E2E explicitement valide/invalide, puis une recette finale contre le middleware
hôte réel.

## Préconditions et conventions

- Démarrer l’API et le frontend avec une base, un dossier de stockage et des
  secrets temporaires isolés par exécution.
- Le faux Turnstile accepte le jeton `e2e-turnstile-ok` et refuse tout autre
  jeton. Le faux SMTP conserve les appels en mémoire. Le faux service IA
  retourne une matrice de critères déterministe et expose un mode erreur.
- Préparer au minimum : une offre publiée ouverte, une offre brouillon, une
  offre clôturée, une offre partenaire et une candidature synthétique par
  offre utile. Les données sont créées par l’API RH, jamais par une copie de
  base de production.
- Prévoir deux contextes Playwright : `anonymous` sans cookie et `rh` avec le
  cookie de la vraie session hôte dans l’environnement d’intégration, ou son
  équivalent strictement dédié à l’E2E. Aucun JWT ou route de connexion propre
  au module ne doit être ajouté pour les tests.
- Chaque test API vérifie le code HTTP, le contrat JSON et l’absence de
  données techniques interdites (`encrypted_path`, `iv`, `auth_tag`, chemin
  absolu, `analysis_json` dans une liste). Chaque scénario UI contrôle aussi
  les erreurs affichées, pas seulement le statut réseau.
- Les identifiants ci-dessous doivent devenir les titres ou annotations des
  tests Playwright. Conserver les captures, traces et vidéo seulement pour les
  échecs; elles peuvent contenir des données synthétiques de candidature.

## Portes bloquantes

La livraison échoue sans exception si l’un de ces points échoue :

- session RH absente ou contournable ;
- offre publiée sans critère objectif explicite ;
- candidature ou fichier candidat public ;
- document non chiffré au repos ou accessible sous `/media` ;
- analyse IA contenant une décision automatique ;
- email envoyé sans décision RH `selected` et confirmation explicite ;
- même clé d’idempotence générant plus d’un envoi ;
- utilisation d’une donnée réelle au cours de la recette.

## Checklist API publique

| ID | Action Playwright `request` | Attendu |
| --- | --- | --- |
| API-PUB-01 | `GET /api/recrutement/offres` avec offres publiée, brouillon, clôturée et expirée | `200`; seules les offres publiées et non expirées sont retournées; `total` est cohérent. |
| API-PUB-02 | `GET /offres/:slug` d’une offre publiée ouverte | `200`; contrat, lieu, employeur/partenaire, critères et urgence sont corrects; aucun champ RH ni identifiant interne. |
| API-PUB-03 | Même route pour brouillon, clôturée, expirée et slug inconnu | `404` dans chaque cas; aucune information sur l’offre masquée. |
| API-PUB-04 | Déposer sans consentement explicite | `400`; aucun dossier, événement ou fichier créé. |
| API-PUB-05 | Déposer sans CV, avec email invalide, sans nom ou sans téléphone | `400` explicite; aucune écriture partielle. |
| API-PUB-06 | Déposer un CV PDF valide, avec et sans lettre DOCX valide | `202`, UUID public et état `queued`; les deux variantes sont acceptées. |
| API-PUB-07 | Déposer PDF factice, DOCX invalide, DOCM/macro, archive à chemin dangereux ou surdimensionnée | `400`; message utile; aucune écriture de fichier. |
| API-PUB-08 | Déposer deux fois le même email (casse différente) sur la même offre | premier `202`, second `409`; un seul dossier est conservé. |
| API-PUB-09 | Déposer le même email sur deux offres différentes | deux `202`; l’unicité est bien limitée à l’offre. |
| API-PUB-10 | Déposer sur UUID inconnu, brouillon, clôturé ou expiré | `404`/`410` conforme au contrat; aucune donnée écrite. |
| API-PUB-11 | Soumettre sans jeton, avec jeton refusé, puis avec jeton accepté | rejet `400`, rejet `400`, puis succès `202`; le bypass est impossible dans la configuration de production. |
| API-PUB-12 | Dépasser la limite de candidatures depuis une même IP de test | réponse de limitation conforme; une nouvelle fenêtre permet à nouveau le dépôt. |

## Checklist API RH : session et offres

| ID | Action | Attendu |
| --- | --- | --- |
| API-RH-01 | Rejouer toutes les routes `/api/admin/recrutement/*` sans cookie RH | `401` ou réponse du middleware hôte; aucune route ne répond avec des données. |
| API-RH-02 | Appeler les mêmes routes avec la session RH | accès limité aux opérations documentées; l’acteur de décision est l’utilisateur de session. |
| API-RH-03 | `GET /offres` RH | `200`; toutes les offres sont visibles, sans modifier leur état. |
| API-RH-04 | `POST /offres` brouillon valide, puis `PATCH` de chaque champ | `201`, puis `200`; valeurs persistées et critères optionnels/requis préservés. |
| API-RH-05 | Créer/publier sans critère, critère vide, type de contrat/mode/statut invalide ou partenaire sans nom | `400`; aucune offre invalide publiée. |
| API-RH-06 | Publier une offre brouillon après ajout d’au moins un critère | `200`; elle apparaît dans l’API publique avec ses seuls champs publics. |
| API-RH-07 | Passer successivement une offre en `closed` puis `archived` | `200`; elle disparaît immédiatement du public; ses dates d’état sont cohérentes. |
| API-RH-08 | Supprimer un brouillon sans candidature, puis une offre non supprimable | `204`, puis `409`; ne jamais supprimer une offre avec candidature ou déjà publiée. |
| API-RH-09 | Créer ou modifier avec slug dupliqué | erreur contrôlée `400` ou `409`, jamais `500`; l’offre existante reste intacte. |
| API-RH-10 | Injecter HTML/script dans signature, nom d’expéditeur, adresse de réponse et texte d’offre | validation/nettoyage attendu; aucune exécution ni en-tête SMTP injecté. |

## Checklist API RH : dossiers, IA et documents

| ID | Action | Attendu |
| --- | --- | --- |
| API-DOS-01 | `GET /candidatures` RH avec filtres `job_id`, `processing_status`, `hr_decision` | `200`; filtrage exact, ordre récent d’abord, pas de contenu d’analyse ni de métadonnées de chiffrement. |
| API-DOS-02 | Lire un dossier existant puis inexistant | `200` avec candidature, fichiers sans secrets et analyse; `404` sinon. |
| API-DOS-03 | Lancer le worker sur un dossier `queued` | état final `analysis_ready`; matrice strictement limitée aux critères de l’offre; avertissement de revue humaine présent; aucune clé `accepted`, `rejected`, `decision` ou équivalent. |
| API-DOS-04 | Simuler trois échecs IA et une relance RH | reprises plafonnées à trois, état `analysis_failed`, décision toujours `to_review`; `retry-analysis` remet uniquement le traitement en file. |
| API-DOS-05 | Simuler un traitement abandonné depuis plus de dix minutes | le worker le réclame une seule fois et le termine sans doublon. |
| API-DOS-06 | Télécharger un fichier avec session RH | contenu déchiffré exact, `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`. |
| API-DOS-07 | Télécharger sans session, avec fichier absent ou fichier d’un autre dossier | `401` puis `404`; aucune oracle d’existence et aucun octet de l’autre candidat. |
| API-DOS-08 | Corrompre un fichier chiffré dans le stockage temporaire puis le télécharger | `500` générique; réponse, événements et logs exploitables ne divulguent ni chemin de stockage ni clé. |
| API-DOS-09 | Vérifier le stockage directement dans le fixture d’intégration | fichiers hors dossier public, permissions restrictives, ciphertext différent du PDF/DOCX source, IV et tag présents; `GET /media/...` ne les sert jamais. |
| API-DOS-10 | Exécuter la purge avec une offre clôturée depuis plus de la rétention puis avec une offre récente | dossier, métadonnées et fichier expirés supprimés ensemble; données récentes conservées. |
| API-DOS-11 | Lire `GET /events` avant/après dépôt, analyse, changement RH et envoi | historique chronologique, acteur et détail utiles; pas de chemin, contenu de CV, secret ou HTML d’email. |

## Checklist API RH : décision et email

| ID | Action | Attendu |
| --- | --- | --- |
| API-MAIL-01 | Envoyer une décision hors énumération | `400`; décision précédente conservée. |
| API-MAIL-02 | Enregistrer `to_review`, `selected`, `rejected`, `withdrawn`, y compris un retour vers `to_review` | `200` pour chaque état autorisé; acteur, date et événement enregistrés. |
| API-MAIL-03 | Demander un brouillon sans dossier ou sans décision `selected` | `404` ou `409`; aucun appel IA d’email. |
| API-MAIL-04 | Demander un brouillon après `selected` | `200`; destinataire imposé à l’email candidat, expéditeur/réponse de l’offre, HTML nettoyé et signature nettoyée. |
| API-MAIL-05 | Tenter l’envoi sans `confirmed: true`, sans sujet, sans clé ou sans HTML | `409`/`400`; le faux SMTP ne reçoit rien. |
| API-MAIL-06 | Envoyer avec `selected` et confirmation | un appel SMTP, message RH correct, HTML/texte nettoyés, état `sent` et événement créés. |
| API-MAIL-07 | Lancer deux requêtes concurrentes avec la même clé d’idempotence | au plus un appel SMTP; réponses `200`/`200` ou `200`/`409` conformes; aucune double ligne envoyée. |
| API-MAIL-08 | Forcer un échec SMTP, puis rejouer la même clé | état `failed`, aucune fausse confirmation; la reprise contrôlée peut envoyer une seule fois. |

## Checklist UI publique dans Chromium headless

| ID | Parcours navigateur | Attendu observable |
| --- | --- | --- |
| UI-PUB-01 | Ouvrir directement `/recrutement` | chargement, liste des seules offres ouvertes, carte avec titre/résumé/lieu/employeur/contrat/urgence et lien utilisable. |
| UI-PUB-02 | Ouvrir directement `/recrutement/:slug`, puis revenir à la liste | informations exactes et critères explicitement affichés; navigation historique fonctionnelle. |
| UI-PUB-03 | Ouvrir URL inconnue, brouillon, clôturée ou expirée | message accessible; aucun détail masqué. |
| UI-PUB-04 | Ouvrir `/recrutement/:slug/postuler` | champs, limites, formats PDF/DOCX, caractère obligatoire du CV et de la case de consentement clairement visibles. |
| UI-PUB-05 | Soumettre sans champs, sans consentement, sans CV, avec mauvais fichier et avec API en erreur | blocage natif quand applicable et message d’erreur visible, annoncé via `role=alert`; bouton revient à l’état actif. |
| UI-PUB-06 | Soumettre un dossier synthétique valide | bouton passe par « Envoi… », une seule requête est faite, page de succès et référence UUID visible; aucun résultat IA affiché. |
| UI-PUB-07 | Activer Turnstile de test, expirer/refuser/accepter le jeton | bouton désactivé tant que le jeton manque, erreur d’expiration lisible, envoi permis après nouveau jeton. |
| UI-PUB-08 | Ouvrir la ressource CV ATS, télécharger DOCX, ouvrir PDF et copier le prompt | ressources accessibles; le texte ne prétend pas que l’ATS est un format et interdit l’invention de faits. |
| UI-PUB-09 | Tester à 320 px, 768 px et 1440 px; navigation Tab/Shift+Tab/Entrée/Espace | pas de débordement horizontal involontaire, ordre de focus logique, focus visible, contrôles et liens actionnables au clavier. |

## Checklist UI RH dans Chromium headless

| ID | Parcours navigateur | Attendu observable |
| --- | --- | --- |
| UI-RH-01 | Ouvrir `/admin/recrutement` sans session puis avec la vraie session hôte | refus hôte sans session; cockpit fonctionnel avec session, sans seconde page de connexion ni token local. |
| UI-RH-02 | Vérifier les onglets Candidatures/Offres, compteurs, chargement et erreur API simulée | état actif clair, compteurs exacts, `role=alert` à l’erreur et bouton Actualiser récupère les données. |
| UI-RH-03 | Créer un brouillon via « Nouvelle offre » puis modifier chaque famille de champs | sauvegarde, réouverture et persistance; slug normalisé, partenaire requis seulement si pertinent, critères ajoutés/supprimés et indicateur requis manipulables. |
| UI-RH-04 | Tenter de publier sans critère, puis publier avec critère; clôturer et archiver | erreur API lisible dans le formulaire; changements réellement reflétés dans la liste publique après actualisation. |
| UI-RH-05 | Examiner la table candidats et ouvrir un dossier | identité synthétique, offre, statut et décision exacts; panneau fermable sans casser la liste. |
| UI-RH-06 | Télécharger CV/LM depuis le panneau | URL RH uniquement, téléchargement déclenché; aucune URL `/media` ni donnée chiffrée dans le DOM. |
| UI-RH-07 | Vérifier une analyse prête, en attente puis échouée | analyse présentée comme aide avec preuves/incertitudes; avertissement persistant qu’elle n’est pas une décision; aucune action IA n’applique une décision. |
| UI-RH-08 | Choisir chacun des quatre états RH, puis annuler/confirmer la boîte de confirmation | aucune mutation après annulation; mutation seulement après confirmation; l’état `à revoir` doit être accessible pour corriger une décision antérieure. |
| UI-RH-09 | Marquer `retenu` | aucun email n’est envoyé immédiatement; seulement après le choix explicite de générer le brouillon. |
| UI-RH-10 | Éditer sujet et HTML autorisé du brouillon, contrôler prévisualisation, annuler puis confirmer l’envoi | prévisualisation nettoyée; annulation sans SMTP; confirmation unique, retour utilisateur et historique mis à jour. |
| UI-RH-11 | Parcours clavier du tableau, formulaires, panneau, éditeur riche et modales natives | labels reliés, focus visible, aucun piège de focus, boutons avec noms accessibles; l’éditeur ne propose que gras, italique et listes. |
| UI-RH-12 | Tester à 320 px, 768 px et 1440 px | tableaux consultables sans recouvrir les actions, formulaires et panneau lisibles; aucun contrôle hors écran. |

## Contrat d’exécution de l’agent de validation

1. Maintenir Playwright avec Chromium uniquement et démarrer/arrêter les
   serveurs par `webServer`; ne pas dépendre d’un serveur lancé à la main.
2. Mettre les factories de données, le faux IA, le faux SMTP, le faux
   Turnstile et l’injection de session dans des fixtures versionnées. La
   production ne doit pas connaître ces points de contrôle.
3. Exécuter les groupes API et UI dans des contextes isolés. Les tests qui
   dépendent d’une course (idempotence) doivent être explicitement parallèles
   et vérifier le compteur SMTP, plutôt que supposer un ordre de réponse.
4. Ajouter un test de contrat qui compare toutes les routes et statuts à
   `docs/6-openapi.yaml`; toute nouvelle route RH doit aussi être exercée sans
   session pour confirmer le passage par le middleware injecté.
5. Exécuter ensuite `npm run verify` et `git diff --check`. Joindre le rapport
   Playwright, les traces d’échec et la liste des IDs validés/échoués à la PR.
6. Ne déclarer la recette complète qu’après les contrôles humains restants :
   session hôte réelle, test SMTP unique vers une boîte contrôlée, validation
   juridique/CMIL et configuration nginx réelle du stockage privé.
