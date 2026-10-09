# Guide d’intégration TechZone

## Contrat hôte vérifié

Le site actuel utilise React 18/Vite 5, Express 4, `better-sqlite3`, `express-session`, un cookie `HttpOnly` et un middleware `requireAdminSession`. Le module ne remplace aucun de ces choix. Le composant public n’importe pas React Router: l’hôte peut donc le monter dans sa route générique `/recrutement/*` sans imposer une mise à niveau transversale au reste du site.

## Backend

Le point d'entrée autonome `packages/backend/server.js` exige en production
`RECRUITMENT_HOST_ADAPTER`, un module privé hors du dépôt. Il doit exporter la
connexion SQLite partagée `db`, le middleware existant `requireAdminSession` et,
pour l'entrée autonome, `sessionMiddleware`, qui hydrate `req.session` depuis
le cookie hôte avant le garde, et `requireAdminOrigin`, le contrôle CSRF/origine
existant. Il peut aussi exporter `resolveMediaAsset`. Le transport SMTP reste
configuré par les variables SMTP du service. L'absence ou l'invalidité de cet
adaptateur arrête le processus avant l'écoute réseau : aucun login, JWT ou
contournement RH local n'est prévu.

Installer le module dans un répertoire suivi par le dépôt principal puis créer une instance avec le transport SMTP déjà configuré par l'hôte :

```js
const { createRecruitmentModule } = require("@techzone/recruitment-backend");

const recruitment = createRecruitmentModule({
  db: getDb(),
  requireAdminSession,
  transporter: getTransporter(),
  resolveMediaAsset: getMediaAssetById,
  config: {
    storageDir: env.recruitmentStorageDir,
    fileKey: env.recruitmentFileKey,
    retentionDays: env.recruitmentRetentionDays,
    maxFileMb: env.recruitmentMaxFileMb,
    turnstileSecret: env.turnstileSecret,
    openAiApiKey: env.openAiApiKey,
    openAiModel: env.openAiModel,
    smtpFrom: env.smtpFrom
  }
});

app.use("/api/recrutement", recruitment.publicRouter);
app.use("/api/admin/recrutement", requireTrustedAdminOrigin(env.allowedOrigins));
app.use("/api/admin/recrutement", recruitment.adminRouter);
recruitment.start();
```

Appeler `recruitment.stop()` pendant l’arrêt gracieux du processus. Les migrations sont idempotentes et utilisent la connexion SQLite partagée.

### Entrée autonome conteneurisée

Pour exécuter `packages/backend/server.js` dans son propre conteneur tout en
réutilisant la session du site, copier
`deployment/recruitment-host-adapter.example.cjs` dans un emplacement privé,
hors Git, puis copier les deux fichiers d'environnement modèles en `0600` :

```text
deployment/recruitment.env.template -> deployment/recruitment.env
deployment/compose.env.template -> deployment/compose.env
```

`DB_PATH`, `SESSION_SECRET`, `SESSION_COOKIE_NAME`, `CORS_ORIGIN` et
`ADMIN_ORIGIN` de `recruitment.env` doivent être identiques à ceux du backend
hôte. `TECHZONE_HOST_BACKEND_ROOT` monte ce backend — et ses dépendances Node —
en lecture seule. `TECHZONE_HOST_DB_DIRECTORY` monte uniquement son répertoire
SQLite en écriture afin que la base, son journal WAL et son fichier SHM puissent
être modifiés; il doit viser le même répertoire que `DB_PATH`. Le
`RECRUITMENT_HOST_ADAPTER_SOURCE` monte l'adaptateur privé en lecture seule à
l'emplacement configuré par `RECRUITMENT_HOST_ADAPTER`.
`TRUST_PROXY_HOPS=1` est obligatoire pour ces vhosts : Express ne fait
confiance qu'au saut nginx local et utilise alors l'adresse client transmise
pour la limitation de dépôts. Ne pas augmenter cette valeur ni exposer le port
conteneur directement.
Vérifier la configuration avant tout démarrage :

```bash
docker compose --env-file deployment/compose.env config --quiet
```

Sur un hôte autorisé à utiliser Docker, la recette isolée suivante construit
l'image puis vérifie le health check de production et le refus RH anonyme avec
un adaptateur, une SQLite et des secrets de fixture. Elle ne monte ni la base
ni le cookie réels et nettoie son conteneur :

```bash
npm run test:container
```

Le contexte Docker exclut explicitement les `.env`, les fichiers privés de
déploiement, l'adaptateur hôte et le stockage candidat : aucun de ces fichiers
n'est transmis au démon pendant la construction. Le stage runtime ne conserve
que les dépendances de production et le backend, pas Playwright, Vitest, les
tests ni les scripts manuels.

Avant le premier lancement avec les valeurs réelles, exécuter :

```bash
npm run deployment:preflight
npm run deployment:external-check
```

Cette commande ne révèle jamais les valeurs; elle vérifie les permissions
`0600`, les variables production, leur validation par le schéma du serveur, le
type des montages, les chemins, le rendu Docker Compose et que le port loopback
demandé est disponible. Elle vérifie aussi que la base SQLite hôte attendue
existe et que son fichier comme son répertoire sont inscriptibles. Elle doit
réussir avant tout `docker compose up`. Sa lecture SQLite est strictement en
lecture seule et confirme les tables de sessions et d'administrateurs requises
par l'adaptateur.

Le contrôle externe valide les certificats TLS des origines `CORS_ORIGIN` et
`ADMIN_ORIGIN` avec la vérification TLS active. Il ne modifie aucun vhost et
doit aussi réussir avant une recette publique; il échoue actuellement tant que
le certificat de l'hôte n'est pas renouvelé.

L'entrée autonome écoute par défaut sur `127.0.0.1`; l'image Docker fixe
explicitement son écoute interne sur `0.0.0.0:3001`, mais Compose la publie
seulement sur le port loopback `RECRUITMENT_HOST_PORT`. Le modèle utilise `3011`, dont la
disponibilité est contrôlée par le prévol avant chaque déploiement sur ce VPS
partagé.
Conserver cette valeur identique dans `deployment/nginx-recruitment.conf`, à
insérer dans le vhost hôte avant son proxy générique `/api/`; ses deux locations
transmettent les routes publiques et RH et limitent les dépôts à 21 Mo.

La base est partagée entre deux processus : l'adaptateur configure un délai
SQLite borné; une sauvegarde cohérente doit arrêter les deux services ou utiliser
un mécanisme SQLite adapté, jamais copier le fichier pendant une écriture.

## Frontend public

Dans le `BrowserRouter` existant, monter `RecruitmentPublicRoutes` comme élément de la route `/recrutement/*`. Le composant gère les quatre sous-chemins avec l’History API et le vhost actuel possède déjà le fallback SPA nécessaire aux accès directs.

```jsx
<RecruitmentPublicRoutes
  apiBaseUrl="/api/recrutement"
  turnstileSiteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
/>
```

Le composant charge le widget Cloudflare Turnstile en mode explicite lorsque la clé publique est fournie et transmet son jeton dans `turnstile_token`. Le banc d’essai le contourne uniquement hors production.

## Admin

Ajouter un onglet `Recrutement` au tableau `tabs` existant et rendre:

```jsx
<RecruitmentAdminPanel apiBaseUrl="/api/admin/recrutement" />
```

Tous les appels utilisent `credentials: "include"`. Ne pas ajouter de login, JWT ou stockage navigateur.

## Médias et documents

- L’image d’une offre est choisie dans `media_assets` par l’adaptateur existant.
- Les CV/LM sont chiffrés dans `RECRUITMENT_STORAGE_DIR`, persistant hors releases, mode `0700`.
- Les sauvegardes doivent couvrir ensemble SQLite et ce dossier, être chiffrées et expirer avec la même politique de 180 jours.

## Nginx et service applicatif

Partir des exemples dans `deployment/`. Ajouter `client_max_body_size 21m` uniquement sur le chemin de candidature. Le traitement IA est asynchrone; aucun timeout proxy long n’est requis. Ajouter les nouvelles variables au fichier d’environnement du service, jamais au build frontend. Ne copier aucune valeur d’exemple en production.

## Checklist chef de projet

1. Résoudre et compiler la branche hôte de référence.
2. Vérifier l’absence de secret et de donnée réelle dans le module.
3. Installer les dépendances verrouillées et exécuter `npm run verify`.
4. Exécuter les migrations sur une copie de la base.
5. Configurer stockage, clé de chiffrement, Turnstile, OpenAI et SMTP.
6. Vérifier `/api/health`, les routes publiques, le cookie admin et un dossier synthétique.
7. Effectuer un seul test SMTP vers une boîte contrôlée puis vérifier le rendu HTML/texte.
8. Obtenir la validation juridique et accomplir la formalité CMIL avant publication.
