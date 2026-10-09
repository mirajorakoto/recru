// Utilitaires purs du module RH : appels API, constantes alignées sur le backend, formats.

export async function apiRequest(apiBaseUrl, path, options = {}) {
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: "include",
    ...options,
    headers: options.body && !isForm ? { "Content-Type": "application/json", ...(options.headers || {}) } : options.headers
  });
  const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Erreur HTTP ${response.status}`);
    error.status = response.status;
    if (response.status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event("rh:unauthorized"));
    throw error;
  }
  return payload;
}

export const json = (value) => JSON.stringify(value ?? {});

/* Pipeline CDC §11 — valeurs identiques à PIPELINE_STATUSES de routes.js */
export const PIPELINE_STATUSES = [
  ["nouvelle", "Nouvelle", "slate"],
  ["en_analyse", "En analyse", "indigo"],
  ["cv_analyse", "CV analysé", "indigo"],
  ["preselectionnee", "Présélectionnée", "blue"],
  ["entretien", "Entretien", "amber"],
  ["evaluation", "Évaluation", "amber"],
  ["en_attente", "En attente", "slate"],
  ["acceptee", "Acceptée", "green"],
  ["refusee", "Refusée", "red"]
];
export const PIPELINE_LABELS = Object.fromEntries(PIPELINE_STATUSES.map(([v, l]) => [v, l]));
export const PIPELINE_TONES = Object.fromEntries(PIPELINE_STATUSES.map(([v, , t]) => [v, t]));
export const PIPELINE_MAIN = ["nouvelle", "cv_analyse", "preselectionnee", "entretien", "evaluation", "acceptee"];

export const DECISION_LABELS = { to_review: "À revoir", selected: "Retenu", rejected: "Rejeté", withdrawn: "Retiré" };
export const DECISION_TONES = { to_review: "amber", selected: "green", rejected: "red", withdrawn: "slate" };
export const PROCESSING_LABELS = { received: "Reçue", queued: "En file", processing: "En analyse", analysis_ready: "Analyse prête", analysis_failed: "Analyse échouée" };
export const JOB_STATUS_LABELS = { draft: "Brouillon", published: "Publiée", closed: "Clôturée", archived: "Archivée" };
export const JOB_STATUS_TONES = { draft: "slate", published: "green", closed: "amber", archived: "slate" };
export const JOB_NEXT = { draft: ["published"], published: ["closed"], closed: ["archived"], archived: [] };
export const JOB_NEXT_LABELS = { published: "Publier", closed: "Clôturer", archived: "Archiver" };
export const CONTRACT_TYPES = [["stage", "Stage"], ["cdd", "CDD"], ["cdi", "CDI"], ["alternance", "Alternance"], ["freelance", "Freelance"], ["interim", "Intérim"], ["autre", "Autre"]];
export const WORK_MODES = [["onsite", "Sur site"], ["hybrid", "Hybride"], ["remote", "À distance"]];
export const SENIORITY = [["", "Non précisé"], ["junior", "Junior"], ["confirme", "Confirmé"], ["senior", "Senior"]];
export const CATEGORY_LABELS = { competence: "Compétence", experience: "Expérience", formation: "Formation", langue: "Langue", autre: "Autre critère" };
export const CATEGORY_WEIGHTS = { competence: 40, experience: 20, formation: 15, langue: 10, autre: 15 };
export const RECOMMENDATION_LABELS = { strong_match: "Forte correspondance", match: "Correspondance", uncertain: "À vérifier", weak_match: "Faible correspondance" };
export const RECOMMENDATION_TONES = { strong_match: "green", match: "blue", uncertain: "amber", weak_match: "red" };
export const EDUCATION_OPTIONS = [["", "Tous niveaux"], ["bac", "Bac"], ["bac+2", "Bac+2"], ["bac+3", "Bac+3"], ["bac+5", "Bac+5"], ["doctorat", "Doctorat"], ["autre", "Autre"]];
export const INTERVIEW_STATUS_LABELS = { planned: "Planifié", done: "Réalisé", cancelled: "Annulé" };
export const INTERVIEW_STATUS_TONES = { planned: "blue", done: "green", cancelled: "slate" };
export const INTERVIEW_MODES = [["onsite", "Sur site"], ["visio", "Visioconférence"], ["phone", "Téléphone"]];
export const STAFF_ROLES = [["admin", "Administrateur"], ["recruteur", "Recruteur / RH"], ["lecteur", "Lecteur"]];
export const ROLE_LABELS = Object.fromEntries(STAFF_ROLES);
export const EVALUATION_CRITERIA = [["technical", "Compétences techniques"], ["communication", "Communication"], ["motivation", "Motivation"], ["experience", "Expérience"], ["adaptability", "Adaptabilité"]];
export const EVAL_RECO = { favorable: "Favorable", reserve: "Réservé", defavorable: "Défavorable" };
export const EVAL_RECO_TONES = { favorable: "green", reserve: "amber", defavorable: "red" };

export const EVENT_LABELS = {
  application_received: "Candidature reçue",
  application_created_by_staff: "Candidature saisie par le RH",
  application_withdrawn: "Candidature retirée",
  application_erased: "Dossier effacé",
  analysis_completed: "Analyse IA terminée",
  analysis_failed: "Analyse IA en échec",
  analysis_retry_requested: "Relance de l'analyse",
  interview_questions_generated: "Questions d'entretien générées",
  hr_decision_changed: "Décision RH modifiée",
  pipeline_status_changed: "Étape du pipeline modifiée",
  hr_note_added: "Note RH ajoutée",
  hr_viewed: "Dossier consulté",
  file_downloaded: "Document téléchargé",
  selection_email_sent: "Email de sélection envoyé",
  selection_email_failed: "Échec d'envoi de l'email",
  interview_scheduled: "Entretien planifié",
  interview_updated: "Entretien modifié",
  evaluation_submitted: "Évaluation enregistrée",
  job_created: "Offre créée",
  job_status_changed: "Statut d'offre modifié",
  job_deleted: "Offre supprimée",
  staff_upserted: "Membre de l'équipe modifié",
  account_registered: "Compte candidat créé",
  account_activated: "Compte candidat activé",
  account_deactivated: "Compte candidat désactivé",
  account_erased: "Compte candidat effacé",
  account_password_changed: "Mot de passe modifié",
  account_password_reset: "Mot de passe réinitialisé",
  password_reset_email_failed: "Échec email de réinitialisation",
  hr_score_set: "Note RH enregistrée",
  ai_criteria_updated: "Critères d'analyse IA modifiés"
};
export const EVENT_TONES = {
  analysis_failed: "red", selection_email_failed: "red", password_reset_email_failed: "red", application_erased: "red", account_erased: "red", job_deleted: "red",
  analysis_completed: "indigo", interview_questions_generated: "indigo", ai_criteria_updated: "indigo",
  hr_decision_changed: "green", selection_email_sent: "green", evaluation_submitted: "green",
  interview_scheduled: "amber", interview_updated: "amber", pipeline_status_changed: "blue"
};

export function eventDetail(event) {
  const d = event.details || {};
  if (event.event_type === "hr_decision_changed" && d.decision) return `Nouvelle décision : ${DECISION_LABELS[d.decision] || d.decision}`;
  if (event.event_type === "pipeline_status_changed") return `${PIPELINE_LABELS[d.from] || d.from || "—"} → ${PIPELINE_LABELS[d.to] || d.to}`;
  if (event.event_type === "analysis_completed" && d.model) return `Modèle : ${d.model}`;
  if (event.event_type === "hr_note_added" && d.note) return d.note;
  if (event.event_type === "job_status_changed") return `${JOB_STATUS_LABELS[d.from] || d.from} → ${JOB_STATUS_LABELS[d.to] || d.to}`;
  if (event.event_type === "staff_upserted") return `${d.email} · ${ROLE_LABELS[d.role] || d.role}${d.active === false ? " · désactivé" : ""}`;
  if (event.event_type === "interview_scheduled" && d.scheduled_at) return dateTime(d.scheduled_at);
  if (event.event_type === "evaluation_submitted" && d.total != null) return `Total ${d.total}/50 · ${EVAL_RECO[d.recommendation] || d.recommendation}`;
  if (event.event_type === "hr_score_set" && d.score != null) return `Note RH : ${d.score}/20`;
  if (event.event_type === "file_downloaded" && d.kind) return d.kind === "cv" ? "CV" : "Lettre de motivation";
  return "";
}

export function friendlyError(error) {
  if (error?.status === 403) return error.message || "Droits insuffisants pour cette action.";
  if (error?.status === 404) return error.message || "Ressource introuvable.";
  return error?.message || "Erreur inattendue.";
}

const TZ = "Indian/Antananarivo";
const safeDate = (value) => { const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d; };
export function dateShort(value) {
  const d = safeDate(value); if (!d) return "—";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: TZ }).format(d);
}
export function dateTime(value) {
  const d = safeDate(value); if (!d) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: TZ }).format(d);
}
export function timeOnly(value) {
  const d = safeDate(value); if (!d) return "—";
  return new Intl.DateTimeFormat("fr-FR", { timeStyle: "short", timeZone: TZ }).format(d);
}
export function dayLong(value) {
  const d = safeDate(value); if (!d) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeZone: TZ }).format(d);
}
// SQLite stocke « YYYY-MM-DD HH:MM:SS » en UTC sans suffixe.
export function parseDbDate(value) {
  if (!value) return null;
  const text = String(value);
  return safeDate(/Z|[+-]\d{2}:?\d{2}$/.test(text) ? text : `${text.replace(" ", "T")}Z`);
}
export function relativeDay(value) {
  const d = parseDbDate(value); if (!d) return "—";
  const minutes = Math.floor((Date.now() - d.getTime()) / 60000);
  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Hier";
  if (days < 7) return `Il y a ${days} j`;
  if (days < 60) return `Il y a ${Math.floor(days / 7)} sem.`;
  return dateShort(d);
}
export function toLocalInput(value) {
  const d = safeDate(value); if (!d) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const initials = (name) => String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("") || "?";
export const slugify = (text) => String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
export const plural = (n, one, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

export function stageOf(candidate) {
  return candidate?.pipeline_status || "nouvelle";
}

/* Score final = score IA (/100) + score d'entretien (/50) + note RH (/20) = /170 */
export const SCORE_MAX = { ia: 100, entretien: 50, rh: 20, final: 170 };
export const fmtScore = (value) => (value == null ? "—" : String(Number(Number(value).toFixed(1))));
export function finalTone(score) {
  if (score == null) return "slate";
  const pct = score / SCORE_MAX.final;
  return pct >= 0.7 ? "green" : pct >= 0.5 ? "blue" : pct >= 0.35 ? "amber" : "red";
}

/* Droits (miroir du contrôle d'accès de routes.js) */
export function permissions(role) {
  return { write: role === "admin" || role === "recruteur", admin: role === "admin" };
}

/* Export CSV — neutralise l'injection de formules tableur */
export function csvCell(value) {
  const text = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
export function downloadCsv(filename, header, rows) {
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportCandidatesCsv(candidates) {
  downloadCsv(`candidatures-${new Date().toISOString().slice(0, 10)}.csv`,
    ["Rang", "Référence", "Nom", "Email", "Téléphone", "Poste", "Étape", "Décision", "Score IA /100", "Entretien /50", "Note RH /20", "Score final /170", "Expérience (ans)", "Diplôme", "Reçue le"],
    candidates.map((c, i) => [c.rank ?? i + 1, c.reference, c.full_name, c.email, c.phone, c.job_title, PIPELINE_LABELS[stageOf(c)], DECISION_LABELS[c.hr_decision] || "", c.match_score, c.interview_score, c.hr_score, c.final_score, c.experience_years, c.education_level, c.created_at]));
}
