# Diagnostic et bilan de livraison

Ce document répond au format de retour attendu par `1-reprise-projet.md` :
compréhension du produit, état du socle, écarts identifiés, plan réalisé, et
décisions nécessitant arbitrage. Il est rédigé après plusieurs sessions de
travail plutôt qu'en tout début de reprise, et couvre donc à la fois le
diagnostic initial et le bilan de ce qui a été livré depuis.

## Compréhension du produit et du périmètre

Le module recrutement TechZone est un monorepo npm workspaces autonome
(`backend`, `public-ui`, `admin-ui`, `demo`) destiné à être intégré dans le
site existant `www.techzone.lat`. Il couvre un parcours candidat public
(consultation d'offres, dépôt de candidature chiffré) et un cockpit RH
(gestion des offres, revue de candidatures assistée par IA, décision humaine
exclusive, envoi d'email de sélection). L'authentification admin est déléguée
à l'hôte TechZone (`requireAdminSession` injecté), sans mécanisme
d'authentification propre au module.

## État du socle après installation et vérifications

Vérifications exécutées depuis un clone propre :

```bash
npm ci
npm test
npm run verify   # docs:generate + test + build
```

État actualisé au 9 septembre 2026 : **54 tests backend, les tests public-ui
et admin-ui, neuf scénarios Playwright Chromium et les builds des trois
packages front sont verts.** La recette isolée HTTPS complète cette preuve
avec un adaptateur de session hôte, nginx, Turnstile de test et stockage hors
webroot. Les prérequis encore externes à ce dépôt sont consolidés dans
`docs/12-checklist-validation-playwright.md` et `task.md`.

## Écarts identifiés et corrigés

Par ordre chronologique de découverte :

1. **Conflit de versions `vitest`** — `4.1.10` à la racine coexistait avec
   `2.1.9` dans les workspaces, causant l'échec silencieux des matchers
   `@testing-library/jest-dom` (`Invalid Chai property`). Résolu en alignant
   toutes les versions sur `2.1.9`.
2. **Validation d'environnement absente au démarrage** — `demo-server.js`
   lisait `process.env` directement sans validation ni chargement explicite
   du `.env` racine. Ajout de `packages/backend/src/config.js` (schéma Zod,
   chargement explicite du fichier racine), intégré avant l'ouverture du port.
3. **Migrations non versionnées** — `schema.js` faisait un `CREATE TABLE IF
   NOT EXISTS` monolithique, sans garantie d'atomicité en cas d'échec partiel.
   Refactorisé en moteur de migrations versionnées et transactionnelles.
4. **Fuite de l'identifiant interne auto-incrémenté** — `toPublicJob` ne
   filtrait pas `id`, et le frontend l'utilisait pour soumettre une
   candidature (`POST /offres/:id/candidatures`), exposant publiquement le
   volume et le rythme de création des offres. Voir décision n°1 ci-dessous.
5. **Régression nginx introduite par le point précédent** — la regex
   `[0-9]+` du bloc `location` ne matchait plus un `public_id` UUID,
   cassant `client_max_body_size` sur la route réelle. Corrigée en
   `[0-9a-f-]+`.
6. **Absence de blocage `/media` documenté** — aucune règle nginx
   n'empêchait explicitement un accès direct au stockage. Un bloc défensif a
   été ajouté à titre préventif (voir décision n°2 ci-dessous).
7. **Fuite de chemins serveur ou de données dans les erreurs** — les erreurs
   `fs`/`crypto` de déchiffrement (chemin absolu inclus) et les erreurs du
   fournisseur IA pouvaient atteindre la base de données (`analysis_error`),
   les événements ou les logs serveur. `sanitizeStorageError` masque les
   chemins au déchiffrement et le worker enregistre désormais un motif
   générique, sans texte brut du fournisseur.
8. **Historique d'événements non exposé (B-056)** — `recordEvent` écrivait
   déjà les événements mais aucune route ne permettait de les relire. Ajout
   de `listEvents` et `GET /admin/candidatures/:id/events`.
9. **Confirmation de décision RH manquante (B-045)** — un clic sur "Marquer
   rejeté" changeait la décision sans confirmation, contrairement à l'envoi
   d'email qui en avait une. Ajoutée pour cohérence.
10. **Corruptions d'encodage** — plusieurs fichiers (`admin-ui/src/index.jsx`,
    `admin-ui/src/styles.css`, `test/module.test.js`, `docs/6-openapi.yaml`)
    contenaient des accents corrompus (`Ã©`, `â€™`), dont deux visibles par les
    utilisateurs RH directement dans l'interface (placeholder d'éditeur,
    icône d'avertissement). Tous réparés en UTF-8.
11. **Spécification OpenAPI désynchronisée** — décrivait encore l'ancien
    contrat `id` numérique pour la route de candidature, omettait la route
    d'événements (B-056) et la route de téléchargement de fichier. Corrigée.

Chaque correction ci-dessus a été accompagnée d'un test automatisé
reproductible avant d'être considérée close.

## Plan réalisé, par jalon

- **Jalon 1 — Audit du socle** : installation depuis un clone propre,
  confirmation de `npm ci`/`npm test`/`npm run verify`, correction du bug
  `vitest` bloquant.
- **Jalon 2 — Fiabilité du démarrage et des données** : validation Zod de la
  configuration, migrations versionnées atomiques.
- **Jalon 3 — Durcissement du parcours candidat** : migration vers
  `public_id`, correction UI (texte parasite, état d'expiration Turnstile).
- **Jalon 4 — Isolation et confidentialité RH** : isolation croisée des
  fichiers testée, correction de la régression nginx, blocage défensif
  `/media`, suppression des fuites de chemin serveur.
- **Jalon 5 — Complétude fonctionnelle** : historique d'événements (B-056).
- **Jalon 6 — Qualité de l'interface RH** : confirmation de décision (B-045),
  réparation des corruptions d'encodage visibles utilisateur.
- **Jalon 7 — Cohérence documentaire** : synchronisation de la spécification
  OpenAPI avec le contrat d'API réel.
- **Jalon 8 — Validation avec services réels** : IA (OpenAI) et email (SMTP)
  testés en conditions réelles sur données strictement synthétiques.

## Décisions structurantes nécessitant un arbitrage

Ces deux décisions ont un impact réel sur l'intégration ou la sécurité et
n'ont pas fait l'objet d'un arbitrage préalable formel, contrairement à ce
que demande `1-reprise-projet.md`. Elles sont signalées ici pour validation :

1. **Changement du contrat d'API public** (`id` numérique → `public_id`
   UUID pour la route de candidature). Justification : évite d'exposer le
   volume et le rythme de création des offres à tout visiteur. Impact : tout
   intégrateur externe s'appuyant sur l'ancien contrat casse. Aucun
   intégrateur externe connu à ce jour (le module n'est pas encore déployé
   en production), donc le risque de rupture est jugé faible, mais la
   décision reste à valider explicitement.
2. **Bloc défensif nginx pour `/media`** (`deployment/nginx-recruitment.conf`)
   ajouté sur la base d'une **supposition non vérifiée** du chemin web réel,
   faute d'accès à la configuration globale du vhost `www.techzone.lat`. Ce
   bloc ne protège rien de réel si le vrai chemin diffère. À confirmer et
   corriger dès que la configuration du vhost est disponible.
3. **Champ « Téléphone » présenté comme facultatif dans l'UI publique alors
   qu'il reste obligatoire côté serveur.** Les maquettes livrées le 9
   septembre 2026 (`maquettes/03_recrutement_postuler.png`) étiquettent ce
   champ « Téléphone (facultatif) », sans astérisque ni contrainte visible.
   Le contrat existant (`docs/6-openapi.yaml`, `phone` dans `required`, et
   `packages/backend/src/routes.js` : `cleanString(req.body.phone, 50, true)`)
   l'exige toujours. `packages/public-ui/src/index.jsx` a été aligné sur la
   maquette (aucune validation client bloquante sur ce champ) sans modifier
   le serveur, qui reste la source de vérité. Un dossier envoyé sans
   téléphone est donc refusé par l'API avec un message générique (« Un champ
   obligatoire est manquant. ») affiché dans le formulaire, ce qui reste une
   expérience dégradée. À arbitrer : soit corriger la maquette (champ
   requis, astérisque), soit assouplir `phone` côté serveur et OpenAPI.

## Validations réelles effectuées (post-diagnostic initial)

Deux points de la recette manuelle, initialement listés comme non faits,
ont depuis été validés avec de vrais services externes, sur des données
strictement synthétiques :

- **IA réelle (OpenAI Responses API)** — validée via
  `packages/backend/scripts/test-real-ai.js` avec la clé de production. Le
  modèle répond honnêtement en cas d'absence de preuve (`assessment:
  "not_found"`), ne prend jamais de décision d'embauche
  (`human_review_notice: true`, aucun champ `accepted`), et respecte le
  schéma JSON strict attendu.
- **Envoi email réel (SMTP production TechZone)** — validé via
  `packages/backend/scripts/test-real-email.js`, d'abord sur un compte Gmail
  de test puis confirmé avec `mail.spacemail.com` / `contact@techzone.lat`
  (config SMTP réelle de production). Authentification, envoi et rendu
  HTML/texte confirmés.

Ces deux scripts sont volontairement séparés de `demo-server.js` (jamais
utilisé avec des services réels) et de `server.js` (point d'entrée
production, toujours bloqué par l'absence de vraie session admin
TechZone). Ils n'envoient et ne traitent que des données fictives,
conformément aux interdictions de `9-recette-livraison.md`.

## Interfaces admin manquantes (signalé le 9 septembre 2026)

Le cockpit RH (`packages/admin-ui/src/index.jsx`) déclare cinq onglets de
navigation — Tableau de bord, Offres, Candidatures, Pipeline, Équipe,
Paramètres — mais `implementedTabs` ne couvre que
`["dashboard", "offers", "candidates"]`. **Pipeline**, **Équipe** et
**Paramètres** sont visibles dans la barre latérale mais désactivés
(`disabled`) et n'ont aucun composant associé : cliquer dessus ne fait rien.

Cet écart correspond exactement au périmètre déjà cadré mais non codé par :

- `docs/16-cahier-des-charges-pipeline-equipe.md` (onglets Pipeline et
  Équipe — vue Kanban par étape, répartition de charge RH);
- `docs/17-cahier-des-charges-parametrage-conformite.md` (onglet
  Paramètres — étapes du pipeline, critères d'analyse IA, conservation des
  données).

Le prompt de maquette (`docs/13-prompt-maquette-rh-ia-chatgpt-image.md`,
écrans 6 à 8) décrit déjà l'UI cible pour ces trois onglets. Aucun de ces
écrans n'a été implémenté pendant ce chantier, qui portait sur les quatre
maquettes publiques (`maquettes/01` à `04`, voir
`docs/19-prompts-images-maquettes-publiques.md`) et non sur le cockpit RH.
À reprendre dans un lot dédié, en s'appuyant sur les cahiers des charges
16 et 17 déjà rédigés.

## Limites connues et risques résiduels

- La configuration nginx globale du vhost `www.techzone.lat` n'a jamais été
  consultée ; le bloc défensif `/media` ajouté est une hypothèse (voir
  décision n°2 ci-dessus).
- Les critères de recette manuelle liés à l'affichage réel (responsive
  320px/tablette, accessibilité clavier/ARIA — B-069, B-070) n'ont pas été
  vérifiés au-delà d'une lecture du code CSS/JSX.
- La vraie session admin TechZone n'est pas encore branchée dans
  `server.js` — bloque tout déploiement réel tant que l'hôte ne la fournit
  pas.
- La validation juridique et la formalité CMIL restent, comme prévu par le
  mandat, des étapes humaines et organisationnelles hors du périmètre
  technique de cette mission.
