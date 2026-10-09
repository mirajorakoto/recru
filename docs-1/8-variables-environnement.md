# Registre des variables d’environnement

Toutes les variables listées ici sont validées au démarrage par
`packages/backend/src/config.js` (schéma zod). Une variable obligatoire (dans
son mode) absente ou mal formée arrête le serveur avant l’écoute réseau, avec
un message citant le nom de la variable — jamais sa valeur.

| Variable | Portée | Obligatoire toujours | Obligatoire production | Rôle |
|---|---|---:|---:|---|
| `NODE_ENV` | serveur | oui (défaut `development`) | — | `development`, `test` ou `production` |
| `PORT` | serveur | oui (défaut `3111`) | — | Port d’écoute HTTP local, réservé à la boucle locale |
| `LISTEN_HOST` | serveur | oui (défaut `127.0.0.1`) | — | `127.0.0.1` hors conteneur; l’image fixe explicitement `0.0.0.0`, publié par Compose seulement sur loopback |
| `DB_PATH` | serveur | oui (défaut démo) | — | Chemin du fichier SQLite, résolu depuis la racine du dépôt si relatif |
| `RECRUITMENT_STORAGE_DIR` | serveur | oui (défaut démo) | — | Répertoire persistant privé |
| `RECRUITMENT_RETENTION_DAYS` | serveur | oui (défaut `180`) | — | Durée de rétention en jours |
| `RECRUITMENT_MAX_FILE_MB` | serveur | oui (défaut `10`) | — | Taille max par fichier |
| `PRIVACY_CONTACT_EMAIL` | contenu | oui | — | Contact des droits des candidats (email valide) |
| `RECRUITMENT_FILE_KEY` | serveur | non (clé de démo générée si absente) | oui | 32 octets base64 pour AES-256-GCM |
| `OPENAI_API_KEY` | serveur | non (vide accepté hors production) | oui | Clé d’un projet OpenAI dédié, avec limite de dépense |
| `OPENAI_MODEL` | serveur | oui (défaut `gpt-5.4-nano-2026-03-17`) | — | Identifiant du modèle |
| `OPENAI_TIMEOUT_MS` | serveur | oui (défaut `45000`) | — | Timeout par requête |
| `TURNSTILE_SECRET_KEY` | serveur | non (vide accepté hors production) | oui | Validation anti-robot |
| `VITE_TURNSTILE_SITE_KEY` | navigateur | non (vide accepté hors production) | oui | Seule clé publique du module |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | serveur | non (vide accepté hors production) | oui | Réutilisent le transport SMTP TechZone |
| `SMTP_PORT` | serveur | oui (défaut `465`) | — | Port SMTP |
| `SMTP_SECURE` | serveur | oui (défaut `true`) | — | TLS implicite |
| `SMTP_FROM` | serveur | non (valeur par défaut fournie) | — | Expéditeur affiché |

Ne jamais préfixer une clé OpenAI, SMTP ou de chiffrement avec `VITE_`.

Hors production (`NODE_ENV` différent de `production`), les variables marquées
« oui en production » restent acceptées vides : le serveur de démo fournit sa
propre clé de chiffrement de secours, son propre service IA déterministe et un
transport SMTP `jsonTransport` qui n’envoie rien réellement. Le contournement
Turnstile (`bypassTurnstile`) n’est jamais autorisé quand `NODE_ENV=production`.
