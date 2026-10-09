# Routes réelles utilisées par les fronts (routes.js)

Admin : `/api/admin/recrutement` (session RH de l'hôte) — Public/candidat : `/api/recrutement`.
Rôles : **lecteur** = GET seulement ; **recruteur** = tout le recrutement ; **admin** = + `/equipe`, `/comptes`, `/audit`, écriture de `/parametres`, `DELETE /candidatures/:id`.
Tant qu'aucun administrateur n'est enregistré dans `recruitment_staff`, l'utilisateur de la session hôte est traité comme admin (amorçage) ; ensuite, `config.adminEmails` ou `POST /equipe`.

## Admin
| Écran (CDC §) | Route |
|---|---|
| Profil/rôle courant | GET `/moi` → `{email, display_name, role}` |
| Offres §9 | GET/POST `/offres`, GET/PATCH/DELETE `/offres/:id` (champs : `department`, `required_diploma`, `required_experience`, `seniority`, `languages[]`, `criteria[{label,required,category}]`) |
| Candidatures §11 | GET `/candidatures`, GET `/candidatures/:id` (+ `notes`), PATCH `/candidatures/:id/decision`, POST `/candidatures/:id/retry-analysis`, `/email-draft`, `/emails/send`, GET `/candidatures/:id/events`, `/fichiers/:fid` |
| Dépôt de CV par un recruteur §12 | POST `/candidatures` (multipart : `job_id, full_name, email, phone, cv, cover_letter?, consent`) |
| Pipeline §11 | PATCH `/candidatures/:id/pipeline` `{status}` — `nouvelle, en_analyse, cv_analyse, preselectionnee, entretien, evaluation, en_attente, acceptee, refusee` (notifie le candidat) |
| Effacement §31 | DELETE `/candidatures/:id` (admin) |
| Questions §18 | POST `/candidatures/:id/interview-questions` |
| Notes | POST `/candidatures/:id/notes` `{text}` |
| Recherche §23 | GET `/candidatures/recherche?q&skills&education&min_experience&min_score&job_id&pipeline_status&hr_decision&sort&limit&offset` → `{rows,total}` |
| Dashboard §22 | GET `/tableau-de-bord` |
| Entretiens §20 | GET `/entretiens?status&application_id`, POST `/entretiens`, PATCH `/entretiens/:id` (notifie le candidat : email + espace candidat) |
| Évaluations §21 | GET/POST `/candidatures/:id/evaluations` |
| Personnel §8 | GET/POST `/equipe` (dernier admin protégé) |
| Comptes candidats §8 | GET `/comptes`, POST `/comptes/:id/activer|desactiver`, DELETE `/comptes/:id` |
| Journal §30-31 | GET `/audit` |
| Paramètres IA | GET/PATCH `/parametres/analyse-ia` (lus à chaque analyse) |

## Candidat (public)
POST `/compte/inscription|connexion|deconnexion|mot-de-passe-oublie|reinitialisation|mot-de-passe` ·
GET/PATCH `/compte/moi` · GET `/compte/candidatures|entretiens|notifications` · POST `/compte/notifications/lues` ·
POST `/compte/candidatures/:publicId/retrait` · DELETE `/compte` ·
POST `/offres/:publicId/candidatures` (rattachée au compte si connecté, sans captcha).
Session : cookie HttpOnly `rc_session` (jeton HS256 dérivé de la clé de chiffrement, révoqué au changement de mot de passe).
