# Mises à jour du package recrutement (couverture du cahier des charges)

## Démarrage
```bash
npm install                 # à la racine du monorepo (workspaces)
npm run dev                 # build des UI + API de démo (packages/backend/demo-server.js)
node --test                 # tests backend (dans packages/backend)
npm test --workspace @techzone/recruitment-admin
npm test --workspace @techzone/recruitment-public
```
Variables facultatives du `.env` racine (toutes ont une valeur par défaut sûre, voir `src/config.js`) :

| Variable | Rôle |
|---|---|
| `RECRUITMENT_ADMIN_EMAILS` | e-mails (séparés par des virgules) créés administrateurs au démarrage |
| `RECRUITMENT_PUBLIC_BASE_URL` | URL publique, utilisée dans le lien de réinitialisation du mot de passe candidat |
| `RECRUITMENT_COOKIE_SECURE` | cookie de session candidat `Secure` (par défaut : oui en production) |
| `RECRUITMENT_SESSION_TTL_HOURS` | durée de la session candidat (168 h par défaut) |
| `RECRUITMENT_AUTH_RATE_LIMIT` | tentatives d'authentification candidat / 15 min / IP (20) |
| `RECRUITMENT_ACK_EMAIL` | `true` pour envoyer un email d'accusé de réception (la notification dans l'espace candidat est toujours créée) |
| `RECRUITMENT_TIMEZONE` | fuseau des dates dans les notifications (`Indian/Antananarivo`) |
| `RECRUITMENT_DEMO_USER` | (demo-server) `rh-demo@…` admin, `recruteur-demo@…`, `lecteur-demo@…` pour essayer les rôles |

## Backend (`packages/backend`)
- **`src/schema.js`** *(nouveau)* : met à niveau la base SQLite au démarrage (colonnes offres/candidatures, comptes candidats, personnel, entretiens, évaluations, notifications, compétences, paramètres). Appelé par `createRepository()` avant toute requête : corrige « table recruitment_jobs has no column named department ».
- **`src/repository.js`** : accès aux nouvelles tables, effacement complet transactionnel (fichiers supprimés après commit), recherche multicritère, statistiques, rôles RH.
- **`src/routes.js`** : portail candidat (`/compte/*`), pipeline, dépôt de CV par un recruteur, effacement, notifications, rôles lecteur / recruteur / admin appliqués côté serveur, journalisation des consultations et téléchargements, slugs réservés (`compte`, `ressources`).
- **`src/ai.js`** : extraction du profil, score explicable (§16), questions d'entretien (§18), consignes RH (`hr_guidance`).
- **`src/security.js`**, **`src/notifications.js`**, **`src/index.js`**, **`src/config.js`**, **`server.js`**, **`demo-server.js`**, **`src/worker.js`** (la purge de rétention efface aussi entretiens, évaluations, notifications).
- **Tests** : `test/recruitment-cdc.integration.test.js` *(nouveau : parcours complet de la soutenance, rôles, mot de passe oublié, effacement, score sur 4 CV fictifs)*, `module.test.js` (contrat IA avec profil), `config.test.js`, `openapi-contract.test.js`.
- **`scripts/generate-openapi-paths.js`** *(nouveau)* → `docs/6-openapi.generated-paths.yaml` : les 44 chemins du module à fusionner dans `docs/6-openapi.yaml`.

## Front admin (`packages/admin-ui`)
Dossier nettoyé (copie parasite `src/mnt/…` et doublon `index_test.jsx` supprimés ; le test à jour est `src/index.test.jsx`). Les 12 pages et la fiche candidat ont été vérifiées contre le vrai backend.

## Front public (`packages/public-ui`)
- **`src/Portal.jsx`** *(nouveau)* : espace candidat sur `/recrutement/compte` (inscription, connexion, mot de passe oublié/réinitialisation, profil, suivi des candidatures, convocations, notifications, retrait, suppression du compte).
- **`src/index.jsx`** : lien « Mon espace », formulaire de candidature rattaché au compte (pas de captcha une fois connecté), téléphone obligatoire (la base l'exige), page de succès avec lien de suivi.
- **`src/styles.css`**, **`src/index.test.jsx`**.

## Limites connues
- 4 tests backend dépendent de fichiers absents de l'archive (`docker-compose.yml`, `.dockerignore`, `scripts/deployment-external-check.mjs`) : à lancer dans le dépôt complet.
- Pas de vérification de l'adresse e-mail à l'inscription : les candidatures anonymes existantes ne sont donc pas rattachées automatiquement à un compte.
- Le serveur de production exige toujours l'adaptateur hôte (`RECRUITMENT_HOST_ADAPTER`) pour l'authentification RH.
