# Routes réelles utilisées par les fronts (routes.js)

Admin : `/api/admin/recrutement` — Public/candidat : `/api/recrutement`.
**Un seul compte RH** (administrateur + recruteur confondus) : plus d'équipe, de rôles ni de table `recruitment_staff`. Toutes les routes RH exigent la session de ce compte (cookie HttpOnly `rh_session`) ; sans session : 401 avec `code` = `setup_required` (aucun compte : l'écran propose la création) ou `login_required`.

## Accès RH (`/auth`, sans session sauf mention)
| Route | Rôle |
|---|---|
| GET `/auth/status` | `{configured, authenticated}` |
| POST `/auth/setup` `{email, display_name?, password}` | crée le compte RH — **uniquement tant qu'aucun compte n'existe** (sinon 409 `account_exists`) ; ouvre la session |
| POST `/auth/login` `{email, password}` | session ; 409 `setup_required` si aucun compte |
| POST `/auth/logout` | ferme la session |
| POST `/auth/forgot-password` `{email}` | génère un nouveau mot de passe et l'envoie à l'e-mail du compte RH (SMTP du `.env`) ; appliqué seulement si l'envoi réussit ; réponse 202 identique dans tous les cas |
| POST `/auth/password` `{current_password, new_password}` | session requise ; révoque les autres sessions |
| DELETE `/auth/account` `{password}` | session + mot de passe actuel requis ; supprime le compte RH (données de recrutement conservées) ; l'espace RH redevient « non configuré » |

Si l'hôte fournit son propre `requireAdminSession`, ces routes `/auth` ne sont pas montées.

## Admin
| Écran (CDC §) | Route |
|---|---|
| Profil courant | GET `/moi` → `{email, display_name, role: "rh"}` |
| Offres §9 | GET/POST `/offres`, GET/PATCH/DELETE `/offres/:id` (champs : `department`, `required_diploma`, `required_experience`, `seniority`, `languages[]`, `criteria[{label,required,category}]`) |
| Candidatures §11 | GET `/candidatures`, GET `/candidatures/:id` (+ `notes`), PATCH `/candidatures/:id/decision`, POST `/candidatures/:id/retry-analysis`, `/email-draft`, `/emails/send`, GET `/candidatures/:id/events`, `/fichiers/:fid` |
| Dépôt de CV par un recruteur §12 | POST `/candidatures` (multipart : `job_id, full_name, email, phone, cv, cover_letter?, consent`) |
| Pipeline §11 | PATCH `/candidatures/:id/pipeline` `{status}` — `nouvelle, en_analyse, cv_analyse, preselectionnee, entretien, evaluation, en_attente, acceptee, refusee` (notifie le candidat) |
| Effacement §31 | DELETE `/candidatures/:id` |
| Questions §18 | POST `/candidatures/:id/interview-questions` |
| Notes | POST `/candidatures/:id/notes` `{text}` |
| Recherche §23 | GET `/candidatures/recherche?q&skills&education&min_experience&min_score&job_id&pipeline_status&hr_decision&sort&limit&offset` → `{rows,total}` |
| Dashboard §22 | GET `/tableau-de-bord` |
| Entretiens §20 | GET `/entretiens?status&application_id`, POST `/entretiens`, PATCH `/entretiens/:id` (notifie le candidat : email + espace candidat) |
| Évaluations §21 | GET/POST `/candidatures/:id/evaluations` |
| Comptes candidats §8 | GET `/comptes`, POST `/comptes/:id/activer|desactiver`, DELETE `/comptes/:id` |
| Journal §30-31 | GET `/audit` |
| Paramètres IA | GET/PATCH `/parametres/analyse-ia` (lus à chaque analyse) |

## Candidat (public)
POST `/compte/inscription|connexion|deconnexion|mot-de-passe-oublie|reinitialisation|mot-de-passe` ·
GET/PATCH `/compte/moi` · GET `/compte/candidatures|entretiens|notifications` · POST `/compte/notifications/lues` ·
POST `/compte/candidatures/:publicId/retrait` · DELETE `/compte` ·
POST `/offres/:publicId/candidatures` (rattachée au compte si connecté, sans captcha).
Session : cookie HttpOnly `rc_session` (jeton HS256 dérivé de la clé de chiffrement, révoqué au changement de mot de passe).
