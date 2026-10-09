# Plateforme de recrutement TechZone — packages

| Package | Rôle | Commandes |
|---|---|---|
| `backend` | API Express + SQLite + module IA (inchangé) | `npm run dev`, `npm test` |
| `admin-ui` | Console RH (React) : tableau de bord, offres, candidatures, pipeline, matching IA, recherche, entretiens, évaluations, rapports, alertes, équipe, journal d'audit, paramètres | `npm run build`, `npm test` |
| `public-ui` | Site candidat : offres, candidature, **espace candidat** (`/candidat`) | `npm run build`, `npm test` |

## Montage
```jsx
import { RecruitmentAdminPanel } from "@techzone/recruitment-admin";
import "@techzone/recruitment-admin/styles.css";
<RecruitmentAdminPanel apiBaseUrl="/api/admin/recrutement" />   // route /admin/recrutement

import { RecruitmentPublicRoutes } from "@techzone/recruitment-public";
import "@techzone/recruitment-public/styles.css";
<RecruitmentPublicRoutes apiBaseUrl="/api/recrutement" turnstileSiteKey={…} />   // routes /recrutement/* et /candidat/*
```
Le serveur doit renvoyer l'application publique pour `/candidat/*` (le lien de réinitialisation de mot de passe envoyé par email pointe sur `/candidat/reinitialisation?token=…`).

## Espace candidat (`/candidat`)
Inscription / connexion / mot de passe oublié, tableau de bord, suivi des candidatures (frise de progression, retrait), convocations d'entretien (export `.ics`), notifications, profil, changement de mot de passe, export JSON des données et suppression du compte. Quand le candidat est connecté, le formulaire de candidature est pré-rempli et le captcha est omis (comportement déjà prévu par le backend).

## Console RH
Navigation par `#/page` (liens directs `#/candidates/12`), palette `Ctrl+K`, thème clair/sombre, rôles admin / recruteur / lecteur appliqués à l'interface (voir `admin-ui/src/README-routes-admin.md` pour le contrat d'API).

## Circuit de recrutement simplifié (nouveau)
1. **Réception** : le candidat postule, un email « candidature reçue » part automatiquement, le CV est analysé par l'IA (score /100 par rapport à l'offre).
2. **Classement automatique** par offre (console RH → *Classement*) : tri par score final décroissant, sans saisie.
3. **Invitations groupées** : le RH coche les candidats (ou « les N meilleurs ») et envoie les invitations d'un clic ; les créneaux s'enchaînent (durée + pause), les conflits du recruteur sont évités, chaque candidat reçoit son email et la notification dans son espace. **Le bouton est grisé et l'API refuse (409) tant que la date limite de dépôt de l'offre n'est pas passée.** Les questions d'entretien sont préparées par l'IA à partir de l'offre et du CV dès la planification.
4. **Évaluation d'entretien** : 5 critères notés sur 10 → **/50** (moyenne si plusieurs évaluateurs).
5. **Note RH /20** saisie dans l'onglet *Décision* de la fiche.
6. **Score final = IA /100 + entretien /50 + RH /20 = /170** (« provisoire » tant qu'une composante manque). Le classement se remet à jour seul. La décision finale reste humaine.

Migration : au démarrage, les anciennes évaluations (5 × /5) sont converties automatiquement (× 2) et les scores recalculés.

### Nouvelles routes RH (à ajouter à `docs/6-openapi.yaml`, exigé par `openapi-contract.test.js`)
| Méthode | Route | Rôle |
|---|---|---|
| GET | `/offres/{id}/classement` | classement + état du verrou d'invitation (`interviews_open`, `interviews_opens_at`) |
| POST | `/offres/{id}/entretiens-groupes` | invitations en lot `{application_ids, start_at, duration_min, gap_min, mode, location, interviewer_email, notify_candidate}` → `{created, skipped}` ; 409 avant la date limite |
| PATCH | `/candidatures/{id}/score-rh` | `{score 0–20, comment}` |
Modifié : `POST /candidatures/{id}/evaluations` (notes 0–10), `POST /entretiens` (409 avant la date limite), `GET /candidatures/recherche?sort=final`, champs `interview_score`, `hr_score`, `final_score`, `final_complete` sur les candidatures.

### Tests
`backend`: `NODE_ENV=test PRIVACY_CONTACT_EMAIL=a@b.co node --test test/scoring.test.js` (nouveau). Les tests de déploiement (docker-compose, openapi) et 5 tests historiques (ex. nombre d'emails attendu) échouaient déjà avant ces changements ; ils dépendent de fichiers hors package ou d'attentes périmées.
