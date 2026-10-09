# Mises à jour du package recrutement (couverture du cahier des charges)

## Parcours simplifié du DRH (nouveau)
1. **Candidature reçue** → email automatique d'accusé de réception ; l'IA analyse le CV et attribue un **score /100**.
2. **Classement par offre** (page *Classement* de l'espace RH, `GET /offres/:id/classement`) : candidats triés par **score final**.
3. **Score final /170 = analyse IA (/100) + entretien (/50) + note RH (/20)**. Le score d'entretien est la moyenne des évaluations (5 critères notés de 1 à 10). La note RH (entier 0-20) se saisit dans le classement ou la fiche candidat. Tant qu'une composante manque, le score est marqué « provisoire ».
4. **Convocations** : le DRH coche les candidats (ou « les N premiers ») et envoie en un clic (`POST /offres/:id/convocations`) : un créneau par candidat, email de convocation automatique, questions d'entretien préparées par l'IA à partir de l'offre et du CV. **Verrouillé (bouton grisé) tant que la date limite de dépôt de l'offre n'est pas passée** (ou l'offre clôturée) ; c'est aussi appliqué côté serveur (409).
5. **Évaluation** de l'entretien → score /50 → le classement se met à jour ; liste finale triée par score final.

Migration : les anciennes évaluations (/25) sont converties automatiquement en /50 (notes doublées) au démarrage.

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
| `RECRUITMENT_ACK_EMAIL` | `true` par défaut : email automatique « candidature reçue » (avec la date limite). `false` pour le désactiver ; la notification dans l'espace candidat est toujours créée |
| `RECRUITMENT_TIMEZONE` | fuseau des dates dans les notifications (`Indian/Antananarivo`) |
| `RECRUITMENT_DEMO_USER` | (demo-server) `rh-demo@…` admin, `recruteur-demo@…`, `lecteur-demo@…` pour essayer les rôles |

## Backend (`packages/backend`)
- **`src/schema.js`** *(nouveau)* : met à niveau la base SQLite au démarrage (colonnes offres/candidatures, comptes candidats, personnel, entretiens, évaluations, notifications, compétences, paramètres). Appelé par `createRepository()` avant toute requête : corrige « table recruitment_jobs has no column named department ».
- **`src/repository.js`** : accès aux nouvelles tables, effacement complet transactionnel (fichiers supprimés après commit), recherche multicritère, statistiques, rôles RH.
- **`src/routes.js`** : portail candidat (`/compte/*`), pipeline, dépôt de CV par un recruteur, effacement, notifications, rôles lecteur / recruteur / admin appliqués côté serveur, journalisation des consultations et téléchargements, slugs réservés (`compte`, `ressources`).
- **`src/ai.js`** : extraction du profil, score explicable (§16), questions d'entretien (§18), consignes RH (`hr_guidance`).
- **`src/security.js`**, **`src/notifications.js`**, **`src/index.js`**, **`src/config.js`**, **`server.js`**, **`demo-server.js`**, **`src/worker.js`** (la purge de rétention efface aussi entretiens, évaluations, notifications).
- **Tests** : `test/recruitment-cdc.integration.test.js` *(nouveau : parcours complet de la soutenance, rôles, mot de passe oublié, effacement, score sur 4 CV fictifs, classement par score final, note RH, convocations groupées, verrou avant la date limite, conversion /25 → /50)*, `module.test.js` (contrat IA avec profil), `config.test.js`, `openapi-contract.test.js`.
- **`scripts/generate-openapi-paths.js`** *(nouveau)* → `docs/6-openapi.generated-paths.yaml` : les 44 chemins du module à fusionner dans `docs/6-openapi.yaml`.

## Front admin (`packages/admin-ui`)
Dossier nettoyé (copie parasite `src/mnt/…` et doublon `index_test.jsx` supprimés ; le test à jour est `src/index.test.jsx`). Nouveau : page **Classement** (`src/Ranking.jsx`), tuiles de score dans la fiche candidat, évaluations notées sur 10, bouton de planification grisé avant la date limite. `npm run test:e2e` lance un vrai serveur de démonstration et vérifie le parcours classement → note RH → convocations groupées.

## Front public (`packages/public-ui`)
- **`src/Portal.jsx`** *(nouveau)* : espace candidat sur `/recrutement/compte` (inscription, connexion, mot de passe oublié/réinitialisation, profil, suivi des candidatures, convocations, notifications, retrait, suppression du compte).
- **`src/index.jsx`** : lien « Mon espace », formulaire de candidature rattaché au compte (pas de captcha une fois connecté), téléphone obligatoire (la base l'exige), page de succès avec lien de suivi.
- **`src/styles.css`**, **`src/index.test.jsx`**.

## Limites connues
- 4 tests backend dépendent de fichiers absents de l'archive (`docker-compose.yml`, `.dockerignore`, `scripts/deployment-external-check.mjs`) : à lancer dans le dépôt complet.
- Pas de vérification de l'adresse e-mail à l'inscription : les candidatures anonymes existantes ne sont donc pas rattachées automatiquement à un compte.
- Le serveur de production exige toujours l'adaptateur hôte (`RECRUITMENT_HOST_ADAPTER`) pour l'authentification RH.
