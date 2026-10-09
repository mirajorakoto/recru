import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./portal.css";
import { loadTurnstile } from "./turnstile";

/**
 * Espace candidat (CDC §7.3, §8, §24, §31).
 * Routes gérées sous /candidat :
 *   /candidat                    tableau de bord (ou connexion / création de compte)
 *   /candidat/candidatures       suivi des candidatures
 *   /candidat/entretiens         convocations
 *   /candidat/notifications      notifications
 *   /candidat/profil             profil, mot de passe, données personnelles
 *   /candidat/mot-de-passe-oublie
 *   /candidat/reinitialisation?token=…   (lien envoyé par email par le backend)
 */

export const PORTAL_BASE = "/candidat";

const PIPELINE_LABELS = {
  nouvelle: "Reçue", en_analyse: "En cours d'étude", cv_analyse: "Dossier étudié", preselectionnee: "Présélectionnée",
  entretien: "Entretien programmé", evaluation: "Entretien réalisé", en_attente: "En attente de décision",
  acceptee: "Décision favorable", refusee: "Non retenue"
};
const PIPELINE_TONES = { acceptee: "green", refusee: "red", preselectionnee: "blue", entretien: "amber", evaluation: "amber", en_attente: "slate" };
const TRACK_STEPS = ["Reçue", "Étudiée", "Présélectionnée", "Entretien", "Décision"];
const TRACK_INDEX = { nouvelle: 0, en_analyse: 0, cv_analyse: 1, preselectionnee: 2, entretien: 3, evaluation: 3, en_attente: 3, acceptee: 4, refusee: 4 };
const MODE_LABELS = { onsite: "Sur site", visio: "Visioconférence", phone: "Téléphone" };
const INTERVIEW_STATUS = { planned: ["Planifié", "blue"], done: ["Réalisé", "green"], cancelled: ["Annulé", "slate"] };
const TABS = [["", "Accueil"], ["candidatures", "Mes candidatures"], ["entretiens", "Mes entretiens"], ["notifications", "Notifications"], ["profil", "Mon profil"]];

/* ------------------------------------------------------------------ outils */
async function portalRequest(apiBaseUrl, path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: "include",
    ...options,
    headers: options.body ? { "Content-Type": "application/json", ...(options.headers || {}) } : options.headers
  });
  const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Erreur ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}
const body = (value) => JSON.stringify(value);

function go(to) {
  window.history.pushState({}, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
function Link({ to, children, className = "", onClick, ...rest }) {
  return <a className={className} href={to} onClick={(event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault(); onClick?.(); go(to);
  }} {...rest}>{children}</a>;
}

const parseDate = (value) => {
  if (!value) return null;
  const text = String(value);
  const date = new Date(/Z|[+-]\d{2}:?\d{2}$/.test(text) ? text : `${text.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};
const TZ = "Indian/Antananarivo";
const fmtDay = (value) => { const d = parseDate(value); return d ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeZone: TZ }).format(d) : "—"; };
const fmtTime = (value) => { const d = parseDate(value); return d ? new Intl.DateTimeFormat("fr-FR", { timeStyle: "short", timeZone: TZ }).format(d) : "—"; };
const fmtShort = (value) => { const d = parseDate(value); return d ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: TZ }).format(d) : "—"; };
function relative(value) {
  const d = parseDate(value); if (!d) return "";
  const minutes = Math.floor((Date.now() - d.getTime()) / 60000);
  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `Il y a ${days} j` : fmtShort(d);
}
const reference = (publicId) => `TZR-${String(publicId || "").replace(/[^0-9a-f]/gi, "").slice(0, 6).toUpperCase() || "000000"}`;
const isUrl = (text) => /^https?:\/\//i.test(String(text || ""));
const initialsOf = (name) => String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");

function PIcon({ name }) {
  const paths = {
    bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
    file: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></>,
    check: <path d="m5 12 5 5 9-10" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    pin: <><path d="M12 22s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></>,
    shield: <><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" /></>,
    download: <><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></>,
    alert: <><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></>
  };
  return <svg aria-hidden="true" className="tp-icon" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="18">{paths[name]}</svg>;
}

function Badge({ tone = "slate", children }) { return <span className={`tp-badge is-${tone}`}>{children}</span>; }
function Notice({ tone = "error", children }) { return children ? <p className={`tp-notice is-${tone}`} role={tone === "error" ? "alert" : "status"}><PIcon name={tone === "error" ? "alert" : "check"} />{children}</p> : null; }
function Empty({ title, children, action }) { return <div className="tp-empty"><strong>{title}</strong>{children ? <p>{children}</p> : null}{action}</div>; }
function Loading({ label = "Chargement…" }) { return <p className="tp-loading" role="status"><span className="tp-spinner" aria-hidden="true" />{label}</p>; }
function Input({ label, hint, error, ...props }) {
  return <label className={`tp-field${error ? " has-error" : ""}`}><span>{label}</span><input {...props} />{hint ? <small>{hint}</small> : null}{error ? <small className="tp-err">{error}</small> : null}</label>;
}

/* ------------------------------------------------ hook partagé : compte courant */
export function useCandidateAccount(apiBaseUrl) {
  const [state, setState] = useState({ account: null, loading: true });
  const refresh = useCallback(async () => {
    try { const { compte } = await portalRequest(apiBaseUrl, "/compte/moi"); setState({ account: compte, loading: false }); return compte; }
    catch { setState({ account: null, loading: false }); return null; }
  }, [apiBaseUrl]);
  useEffect(() => { refresh(); }, [refresh]);
  return { ...state, refresh, setAccount: (account) => setState({ account, loading: false }) };
}

/* ------------------------------------------------------- authentification */
const safeBack = (value) => (typeof value === "string" && /^\/(?!\/)/.test(value) ? value : "");
const passwordRule = (value) => value.length >= 10 && /[A-Za-z]/.test(value) && /\d/.test(value);

function AuthScreen({ apiBaseUrl, onAuthenticated, initialMode = "login", turnstileSiteKey = "" }) {
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({ email: "", password: "", full_name: "", phone: "", candidate_location: "", portfolio_url: "", consent: false });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [token, setToken] = useState("");
  const captchaRef = useRef(null);
  const needsCaptcha = mode === "register" && Boolean(turnstileSiteKey);
  const set = (name, value) => setForm((c) => ({ ...c, [name]: value }));

  useEffect(() => {
    if (!needsCaptcha || !captchaRef.current) return undefined;
    let cancelled = false; let widgetId;
    loadTurnstile().then((turnstile) => {
      if (!cancelled && turnstile) widgetId = turnstile.render(captchaRef.current, { sitekey: turnstileSiteKey, callback: setToken, "expired-callback": () => setToken(""), "error-callback": () => setToken("") });
    }).catch((caught) => !cancelled && setError(caught.message));
    return () => { cancelled = true; if (widgetId !== undefined && window.turnstile) window.turnstile.remove(widgetId); };
  }, [needsCaptcha, turnstileSiteKey]);

  async function submit(event) {
    event.preventDefault(); setError("");
    if (mode === "register") {
      if (!form.phone.trim() || !form.candidate_location.trim()) { setError("Le téléphone et la ville sont obligatoires pour un compte complet."); return; }
      if (!passwordRule(form.password)) { setError("Le mot de passe doit contenir au moins 10 caractères, une lettre et un chiffre."); return; }
      if (!form.consent) { setError("Votre consentement est requis pour créer un compte."); return; }
    }
    setPending(true);
    try {
      const payload = mode === "login" ? { email: form.email, password: form.password } : { ...form, turnstile_token: token || (turnstileSiteKey ? "" : "local-demo") };
      const { compte } = await portalRequest(apiBaseUrl, mode === "login" ? "/compte/connexion" : "/compte/inscription", { method: "POST", body: body(payload) });
      onAuthenticated(compte);
    } catch (caught) { setError(caught.message); } finally { setPending(false); }
  }
  return <div className="tp-auth">
    <div className="tp-auth-intro">
      <h1>Votre espace candidat</h1>
      <p>Pour postuler, il faut un compte complet. <strong>Votre identifiant est votre adresse e-mail.</strong> Vous suivez ensuite chaque candidature grâce à sa référence.</p>
      <ul>
        <li><PIcon name="file" />Postulez en déposant seulement votre CV : votre profil est déjà renseigné.</li>
        <li><PIcon name="bell" />Recevez un e-mail et une notification à chaque étape de votre dossier.</li>
        <li><PIcon name="calendar" />Ajoutez vos entretiens à votre agenda.</li>
        <li><PIcon name="shield" />Une IA aide les recruteurs à lire les dossiers ; la décision reste humaine.</li>
      </ul>
    </div>
    <form className="tp-card tp-auth-form" onSubmit={submit}>
      <div className="tp-switch" role="tablist" aria-label="Accès">
        <button aria-selected={mode === "login"} className={mode === "login" ? "is-on" : ""} onClick={() => { setMode("login"); setError(""); }} role="tab" type="button">Connexion</button>
        <button aria-selected={mode === "register"} className={mode === "register" ? "is-on" : ""} onClick={() => { setMode("register"); setError(""); }} role="tab" type="button">Créer un compte</button>
      </div>
      {mode === "register" ? <Input autoComplete="name" label="Nom complet" maxLength={160} onChange={(e) => set("full_name", e.target.value)} required value={form.full_name} /> : null}
      <Input autoComplete="email" hint={mode === "register" ? "C’est votre identifiant de connexion." : undefined} label="Adresse e-mail (identifiant)" onChange={(e) => set("email", e.target.value)} required type="email" value={form.email} />
      <Input autoComplete={mode === "login" ? "current-password" : "new-password"} hint={mode === "register" ? "Au moins 10 caractères, avec une lettre et un chiffre." : undefined} label="Mot de passe" onChange={(e) => set("password", e.target.value)} required type="password" value={form.password} />
      {mode === "register" ? <>
        <div className="tp-row">
          <Input autoComplete="tel" label="Téléphone *" maxLength={50} onChange={(e) => set("phone", e.target.value)} required type="tel" value={form.phone} />
          <Input label="Ville *" maxLength={160} onChange={(e) => set("candidate_location", e.target.value)} required value={form.candidate_location} />
        </div>
        <Input label="Portfolio ou profil en ligne (facultatif)" onChange={(e) => set("portfolio_url", e.target.value)} placeholder="https://…" type="url" value={form.portfolio_url} />
        <label className="tp-check"><input checked={form.consent} onChange={(e) => set("consent", e.target.checked)} type="checkbox" /><span>J'accepte que TechZone traite mes données pour gérer mes candidatures. Une IA peut assister l'analyse, sans décision automatique. Je peux supprimer mon compte à tout moment.</span></label>
        {needsCaptcha ? <div aria-label="Vérification anti-robot" ref={captchaRef} /> : null}
      </> : null}
      <Notice>{error}</Notice>
      <button className="tz-btn tz-btn-primary tz-btn-block" disabled={pending || (needsCaptcha && !token)} type="submit">{pending ? "Veuillez patienter…" : mode === "login" ? "Se connecter" : "Créer mon compte"}</button>
      {mode === "login" ? <Link className="tp-link" to={`${PORTAL_BASE}/mot-de-passe-oublie`}>Mot de passe oublié ?</Link> : null}
    </form>
  </div>;
}

function ForgotPassword({ apiBaseUrl }) {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault(); setError("");
    try { await portalRequest(apiBaseUrl, "/compte/mot-de-passe-oublie", { method: "POST", body: body({ email }) }); setDone(true); }
    catch (caught) { setError(caught.message); }
  }
  return <div className="tp-narrow"><form className="tp-card tp-auth-form" onSubmit={submit}>
    <h1>Mot de passe oublié</h1>
    {done ? <Notice tone="ok">Si un compte existe pour cette adresse, un lien de réinitialisation valable 1 heure vient d'être envoyé.</Notice> : <>
      <p>Saisissez l'adresse de votre compte : nous vous enverrons un lien pour choisir un nouveau mot de passe.</p>
      <Input autoComplete="email" label="Adresse e-mail" onChange={(e) => setEmail(e.target.value)} required type="email" value={email} />
      <Notice>{error}</Notice>
      <button className="tz-btn tz-btn-primary tz-btn-block" type="submit">Envoyer le lien</button></>}
    <Link className="tp-link" to={PORTAL_BASE}>Retour à la connexion</Link>
  </form></div>;
}

function ResetPassword({ apiBaseUrl, token }) {
  const [password, setPassword] = useState("");
  const [state, setState] = useState({ done: false, error: "" });
  async function submit(event) {
    event.preventDefault();
    if (!passwordRule(password)) { setState({ done: false, error: "Au moins 10 caractères, avec une lettre et un chiffre." }); return; }
    try { await portalRequest(apiBaseUrl, "/compte/reinitialisation", { method: "POST", body: body({ token, password }) }); setState({ done: true, error: "" }); }
    catch (caught) { setState({ done: false, error: caught.message }); }
  }
  return <div className="tp-narrow"><form className="tp-card tp-auth-form" onSubmit={submit}>
    <h1>Nouveau mot de passe</h1>
    {state.done ? <><Notice tone="ok">Mot de passe mis à jour. Vous pouvez vous connecter.</Notice><Link className="tz-btn tz-btn-primary tz-btn-block" to={PORTAL_BASE}>Se connecter</Link></> : <>
      {!token ? <Notice>Ce lien est incomplet. Demandez un nouveau lien de réinitialisation.</Notice> : null}
      <Input autoComplete="new-password" hint="Au moins 10 caractères, avec une lettre et un chiffre." label="Nouveau mot de passe" onChange={(e) => setPassword(e.target.value)} required type="password" value={password} />
      <Notice>{state.error}</Notice>
      <button className="tz-btn tz-btn-primary tz-btn-block" disabled={!token} type="submit">Enregistrer</button></>}
  </form></div>;
}

/* --------------------------------------------------------------- données */
function usePortalData(apiBaseUrl, enabled) {
  const [data, setData] = useState({ applications: [], interviews: [], notifications: [], unread: 0, loading: true, error: "" });
  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const [apps, interviews, notifs] = await Promise.all([
        portalRequest(apiBaseUrl, "/compte/candidatures"), portalRequest(apiBaseUrl, "/compte/entretiens"), portalRequest(apiBaseUrl, "/compte/notifications")
      ]);
      setData({ applications: apps.candidatures || [], interviews: interviews.entretiens || [], notifications: notifs.notifications || [], unread: notifs.unread || 0, loading: false, error: "" });
    } catch (caught) { setData((c) => ({ ...c, loading: false, error: caught.message })); }
  }, [apiBaseUrl, enabled]);
  useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id); }, [load]);
  return { ...data, reload: load };
}

/* ---------------------------------------------------------------- calendrier */
function icsEscape(text) { return String(text || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
const icsDate = (date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
export function buildIcs(interview) {
  const start = parseDate(interview.scheduled_at);
  if (!start) return "";
  const end = new Date(start.getTime() + (Number(interview.duration_min) || 45) * 60000);
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TechZone//Recrutement//FR", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:interview-${interview.id}@techzone.lat`, `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(start)}`, `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(`Entretien — ${interview.job_title}`)}`, `LOCATION:${icsEscape(interview.location || MODE_LABELS[interview.mode] || "")}`,
    `DESCRIPTION:${icsEscape(`Entretien (${MODE_LABELS[interview.mode] || interview.mode}) pour le poste « ${interview.job_title} ».`)}`,
    "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}
function downloadIcs(interview) {
  const url = URL.createObjectURL(new Blob([buildIcs(interview)], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = `entretien-${interview.id}.ics`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------------------------------------------ vues */
function Tracker({ application }) {
  const withdrawn = application.hr_decision === "withdrawn";
  const index = TRACK_INDEX[application.pipeline_status] ?? 0;
  const rejected = application.pipeline_status === "refusee";
  return <ol aria-label="Progression de la candidature" className={`tp-track${withdrawn ? " is-off" : ""}`}>{TRACK_STEPS.map((label, i) => {
    const state = withdrawn ? "" : i < index ? "is-done" : i === index ? (rejected && i === 4 ? "is-bad" : "is-now") : "";
    const text = i === 4 && application.pipeline_status === "acceptee" ? "Décision favorable" : i === 4 && rejected ? "Non retenue" : label;
    return <li className={state} key={label}><i aria-hidden="true">{state === "is-done" ? "✓" : i + 1}</i><span>{text}</span></li>;
  })}</ol>;
}

function ApplicationCard({ application, onWithdraw }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const withdrawn = application.hr_decision === "withdrawn";
  const closed = withdrawn || ["acceptee", "refusee"].includes(application.pipeline_status);
  const tone = withdrawn ? "slate" : PIPELINE_TONES[application.pipeline_status] || "slate";
  const label = withdrawn ? "Candidature retirée" : PIPELINE_LABELS[application.pipeline_status] || "Reçue";
  async function confirmWithdraw() {
    setError("");
    try { await onWithdraw(application); } catch (caught) { setError(caught.message); }
  }
  return <article className="tp-card tp-app">
    <header><div><h3>{application.job_title}</h3><p className="tp-ref">Référence <strong>{application.reference || reference(application.public_id)}</strong></p><p className="tp-muted">Déposée le {fmtShort(application.created_at)}</p></div><Badge tone={tone}>{label}</Badge></header>
    <Tracker application={application} />
    {application.processing_status === "analysis_failed" ? <Notice tone="ok">Votre dossier est en cours de vérification manuelle par notre équipe.</Notice> : null}
    <footer>
      {application.job_slug ? <Link className="tp-link" to={`/recrutement/${application.job_slug}`}>Revoir l'offre</Link> : <span />}
      {!closed ? (asking
        ? <div className="tp-confirm"><span>Retirer cette candidature ?</span><button className="tz-btn tz-btn-outline" onClick={() => setAsking(false)} type="button">Annuler</button><button className="tp-danger" onClick={confirmWithdraw} type="button">Oui, retirer</button></div>
        : <button className="tp-quiet" onClick={() => setAsking(true)} type="button">Retirer ma candidature</button>) : null}
    </footer>
    <Notice>{error}</Notice>
  </article>;
}

function ApplicationsView({ data, onWithdraw }) {
  if (data.loading) return <Loading />;
  if (!data.applications.length) return <Empty action={<Link className="tz-btn tz-btn-primary" to="/recrutement">Découvrir les offres</Link>} title="Aucune candidature pour le moment">Postulez à une offre pour suivre ici l'avancement de votre dossier.</Empty>;
  return <div className="tp-stack">{data.applications.map((a) => <ApplicationCard application={a} key={a.public_id} onWithdraw={onWithdraw} />)}</div>;
}

function InterviewCard({ interview }) {
  const [label, tone] = INTERVIEW_STATUS[interview.status] || [interview.status, "slate"];
  const start = parseDate(interview.scheduled_at);
  return <article className={`tp-card tp-interview${interview.status === "cancelled" ? " is-cancelled" : ""}`}>
    <div className="tp-date" aria-hidden="true"><b>{start ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", timeZone: TZ }).format(start) : "—"}</b><span>{start ? new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: TZ }).format(start) : ""}</span></div>
    <div className="tp-interview-body">
      <div className="tp-between"><h3>{interview.job_title}</h3><Badge tone={tone}>{label}</Badge></div>
      <p><PIcon name="calendar" />{fmtDay(interview.scheduled_at)}, à {fmtTime(interview.scheduled_at)}<span className="tp-muted"> · {interview.duration_min} min</span></p>
      <p><PIcon name="pin" />{MODE_LABELS[interview.mode] || interview.mode}{interview.location ? <> — {isUrl(interview.location) ? <a href={interview.location} rel="noreferrer noopener" target="_blank">Lien de connexion</a> : interview.location}</> : null}</p>
      {interview.status === "planned" ? <div className="tp-actions"><button className="tz-btn tz-btn-outline" onClick={() => downloadIcs(interview)} type="button"><PIcon name="download" />Ajouter à mon agenda</button></div> : null}
    </div>
  </article>;
}

function InterviewsView({ data }) {
  if (data.loading) return <Loading />;
  const now = Date.now();
  const upcoming = data.interviews.filter((i) => i.status === "planned" && (parseDate(i.scheduled_at)?.getTime() || 0) >= now - 3600000);
  const others = data.interviews.filter((i) => !upcoming.includes(i)).reverse();
  if (!data.interviews.length) return <Empty title="Aucun entretien programmé">Si votre candidature est retenue, la convocation apparaîtra ici et vous recevrez une notification.</Empty>;
  return <div className="tp-stack">
    {upcoming.length ? <section><h2 className="tp-h2">À venir</h2><div className="tp-stack">{upcoming.map((i) => <InterviewCard interview={i} key={i.id} />)}</div></section> : null}
    {others.length ? <section><h2 className="tp-h2">Historique</h2><div className="tp-stack">{others.map((i) => <InterviewCard interview={i} key={i.id} />)}</div></section> : null}
  </div>;
}

function NotificationsView({ apiBaseUrl, data }) {
  const [busy, setBusy] = useState(false);
  async function mark(ids) {
    setBusy(true);
    try { await portalRequest(apiBaseUrl, "/compte/notifications/lues", { method: "POST", body: body(ids ? { ids } : {}) }); await data.reload(); } finally { setBusy(false); }
  }
  if (data.loading) return <Loading />;
  if (!data.notifications.length) return <Empty title="Aucune notification">Vous serez prévenu ici à chaque évolution de vos candidatures.</Empty>;
  return <div className="tp-stack">
    <div className="tp-between"><p className="tp-muted">{data.unread ? `${data.unread} non lue${data.unread > 1 ? "s" : ""}` : "Tout est lu"}</p>{data.unread ? <button className="tz-btn tz-btn-outline" disabled={busy} onClick={() => mark(null)} type="button">Tout marquer comme lu</button> : null}</div>
    <ul className="tp-notifs">{data.notifications.map((n) => <li className={n.read_at ? "" : "is-unread"} key={n.id}>
      <span className="tp-dot" aria-hidden="true" />
      <div><div className="tp-between"><strong>{n.title}</strong><small className="tp-muted">{relative(n.created_at)}</small></div><p>{n.body}</p>{!n.read_at ? <button className="tp-quiet" disabled={busy} onClick={() => mark([n.id])} type="button">Marquer comme lue</button> : null}</div>
    </li>)}</ul>
  </div>;
}

function ProfileView({ apiBaseUrl, account, data, onAccount, onDeleted, back }) {
  const [form, setForm] = useState({ full_name: account.full_name || "", phone: account.phone || "", candidate_location: account.candidate_location || "", portfolio_url: account.portfolio_url || "" });
  const [saved, setSaved] = useState({ ok: "", error: "" });
  const [pwd, setPwd] = useState({ current_password: "", new_password: "" });
  const [pwdState, setPwdState] = useState({ ok: "", error: "" });
  const [del, setDel] = useState({ open: false, password: "", error: "" });
  const set = (name, value) => setForm((c) => ({ ...c, [name]: value }));
  async function save(event) {
    event.preventDefault(); setSaved({ ok: "", error: "" });
    try { const { compte } = await portalRequest(apiBaseUrl, "/compte/moi", { method: "PATCH", body: body(form) }); onAccount(compte); setSaved({ ok: "Profil mis à jour.", error: "" }); }
    catch (caught) { setSaved({ ok: "", error: caught.message }); }
  }
  async function changePassword(event) {
    event.preventDefault(); setPwdState({ ok: "", error: "" });
    if (!passwordRule(pwd.new_password)) { setPwdState({ ok: "", error: "Au moins 10 caractères, avec une lettre et un chiffre." }); return; }
    try { await portalRequest(apiBaseUrl, "/compte/mot-de-passe", { method: "POST", body: body(pwd) }); setPwd({ current_password: "", new_password: "" }); setPwdState({ ok: "Mot de passe modifié. Vos autres sessions ont été déconnectées.", error: "" }); }
    catch (caught) { setPwdState({ ok: "", error: caught.message }); }
  }
  function exportData() {
    const payload = { exporte_le: new Date().toISOString(), compte: account, candidatures: data.applications, entretiens: data.interviews, notifications: data.notifications };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "mes-donnees-techzone.json";
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function erase(event) {
    event.preventDefault();
    try { await portalRequest(apiBaseUrl, "/compte", { method: "DELETE", body: body({ password: del.password }) }); onDeleted(); }
    catch (caught) { setDel((c) => ({ ...c, error: caught.message })); }
  }
  return <div className="tp-stack">
    <form className="tp-card tp-form" onSubmit={save}>
      <h2>Mes informations</h2>
      <p className="tp-muted">Seules les informations utiles à vos candidatures sont conservées. Votre CV est déposé avec chaque candidature.</p>
      <Input disabled hint="C’est votre identifiant de connexion." label="Adresse e-mail (identifiant)" value={account.email} />
      <div className="tp-row"><Input label="Nom complet" maxLength={160} onChange={(e) => set("full_name", e.target.value)} required value={form.full_name} /><Input label="Téléphone *" maxLength={50} onChange={(e) => set("phone", e.target.value)} required type="tel" value={form.phone} /></div>
      <div className="tp-row"><Input label="Ville *" maxLength={160} onChange={(e) => set("candidate_location", e.target.value)} required value={form.candidate_location} /><Input label="Portfolio ou profil en ligne" onChange={(e) => set("portfolio_url", e.target.value)} placeholder="https://…" type="url" value={form.portfolio_url} /></div>
      <Notice tone="ok">{saved.ok}</Notice><Notice>{saved.error}</Notice>
      <div className="tp-actions"><button className="tz-btn tz-btn-primary" type="submit">Enregistrer</button>{saved.ok && back ? <a className="tz-btn tz-btn-outline" href={back}>Continuer ma candidature</a> : null}</div>
    </form>
    <form className="tp-card tp-form" onSubmit={changePassword}>
      <h2>Mot de passe</h2>
      <div className="tp-row"><Input autoComplete="current-password" label="Mot de passe actuel" onChange={(e) => setPwd({ ...pwd, current_password: e.target.value })} required type="password" value={pwd.current_password} /><Input autoComplete="new-password" label="Nouveau mot de passe" onChange={(e) => setPwd({ ...pwd, new_password: e.target.value })} required type="password" value={pwd.new_password} /></div>
      <Notice tone="ok">{pwdState.ok}</Notice><Notice>{pwdState.error}</Notice>
      <div className="tp-actions"><button className="tz-btn tz-btn-outline" type="submit">Changer le mot de passe</button></div>
    </form>
    <section className="tp-card tp-form">
      <h2><PIcon name="shield" /> Mes données personnelles</h2>
      <p>Vos documents sont stockés chiffrés et accessibles uniquement aux recruteurs habilités. Une IA assiste l'analyse des CV ; elle ne prend jamais de décision. Les dossiers sont purgés automatiquement après la clôture des offres.</p>
      <div className="tp-actions"><button className="tz-btn tz-btn-outline" onClick={exportData} type="button"><PIcon name="download" />Télécharger mes données</button>{!del.open ? <button className="tp-danger-outline" onClick={() => setDel({ open: true, password: "", error: "" })} type="button">Supprimer mon compte</button> : null}</div>
      {del.open ? <form className="tp-danger-zone" onSubmit={erase}>
        <strong>Suppression définitive</strong>
        <p>Votre compte, vos candidatures, vos CV chiffrés et vos notifications seront effacés. Cette action est irréversible.</p>
        <Input autoComplete="current-password" label="Confirmez avec votre mot de passe" onChange={(e) => setDel({ ...del, password: e.target.value })} required type="password" value={del.password} />
        <Notice>{del.error}</Notice>
        <div className="tp-actions"><button className="tz-btn tz-btn-outline" onClick={() => setDel({ open: false, password: "", error: "" })} type="button">Annuler</button><button className="tp-danger" type="submit">Supprimer définitivement</button></div>
      </form> : null}
    </section>
  </div>;
}

function Overview({ account, data, goTo }) {
  const now = Date.now();
  const next = data.interviews.find((i) => i.status === "planned" && (parseDate(i.scheduled_at)?.getTime() || 0) >= now);
  const active = data.applications.filter((a) => a.hr_decision !== "withdrawn" && !["refusee"].includes(a.pipeline_status));
  const stats = [[data.applications.length, "Candidatures"], [active.length, "En cours"], [data.interviews.filter((i) => i.status === "planned").length, "Entretiens à venir"], [data.unread, "Notifications non lues"]];
  return <div className="tp-stack">
    <div className="tp-stats">{stats.map(([n, label]) => <div className="tp-card tp-stat" key={label}><b>{n}</b><span>{label}</span></div>)}</div>
    {next ? <section className="tp-card tp-next"><div><h2>Prochain entretien</h2><p><strong>{next.job_title}</strong></p><p>{fmtDay(next.scheduled_at)}, à {fmtTime(next.scheduled_at)} · {MODE_LABELS[next.mode] || next.mode}</p></div><button className="tz-btn tz-btn-primary" onClick={() => goTo("entretiens")} type="button">Voir les détails</button></section> : null}
    <div className="tp-two">
      <section className="tp-card"><div className="tp-between"><h2>Mes candidatures</h2><button className="tp-quiet" onClick={() => goTo("candidatures")} type="button">Tout voir</button></div>
        {data.applications.length ? <ul className="tp-mini">{data.applications.slice(0, 4).map((a) => <li key={a.public_id}><span>{a.job_title}<small className="tp-muted"> · {a.reference}</small></span><Badge tone={a.hr_decision === "withdrawn" ? "slate" : PIPELINE_TONES[a.pipeline_status] || "slate"}>{a.hr_decision === "withdrawn" ? "Retirée" : PIPELINE_LABELS[a.pipeline_status] || "Reçue"}</Badge></li>)}</ul> : <p className="tp-muted">Aucune candidature. <Link className="tp-link" to="/recrutement">Voir les offres</Link></p>}
      </section>
      <section className="tp-card"><div className="tp-between"><h2>Dernières notifications</h2><button className="tp-quiet" onClick={() => goTo("notifications")} type="button">Tout voir</button></div>
        {data.notifications.length ? <ul className="tp-mini">{data.notifications.slice(0, 4).map((n) => <li className={n.read_at ? "" : "is-unread"} key={n.id}><span>{n.title}</span><small className="tp-muted">{relative(n.created_at)}</small></li>)}</ul> : <p className="tp-muted">Rien de nouveau.</p>}
      </section>
    </div>
    <p className="tp-fineprint">Bonjour {account.full_name}. Les analyses automatisées ne sont qu'une aide à la lecture : chaque décision est prise par un recruteur.</p>
  </div>;
}

/* ------------------------------------------------------------------ portail */
export function CandidatePortal({ apiBaseUrl = "/api/recrutement", pathname, search = "", turnstileSiteKey = "" }) {
  const path = (pathname || window.location.pathname).replace(/\/$/, "");
  const section = path.slice(PORTAL_BASE.length).replace(/^\//, "");
  const { account, loading, setAccount } = useCandidateAccount(apiBaseUrl);
  const data = usePortalData(apiBaseUrl, Boolean(account));
  const query = useMemo(() => new URLSearchParams(search || window.location.search), [search]);
  const token = query.get("token") || "";
  const back = safeBack(query.get("retour"));

  if (section === "reinitialisation") return <main className="tp-page"><ResetPassword apiBaseUrl={apiBaseUrl} token={token} /></main>;
  if (section === "mot-de-passe-oublie") return <main className="tp-page"><ForgotPassword apiBaseUrl={apiBaseUrl} /></main>;
  if (loading) return <main className="tp-page"><Loading label="Chargement de votre espace…" /></main>;
  if (!account) return <main className="tp-page"><AuthScreen apiBaseUrl={apiBaseUrl} initialMode={query.get("mode") === "inscription" ? "register" : "login"} onAuthenticated={(compte) => { setAccount(compte); go(back || PORTAL_BASE); }} turnstileSiteKey={turnstileSiteKey} /></main>;

  const tab = TABS.some(([key]) => key === section) ? section : "";
  const goTo = (key) => go(key ? `${PORTAL_BASE}/${key}` : PORTAL_BASE);
  async function logout() { try { await portalRequest(apiBaseUrl, "/compte/deconnexion", { method: "POST" }); } catch { /* session déjà expirée */ } setAccount(null); go(PORTAL_BASE); }
  async function withdraw(application) { await portalRequest(apiBaseUrl, `/compte/candidatures/${application.public_id}/retrait`, { method: "POST", body: "{}" }); await data.reload(); }

  return <main className="tp-page">
    <header className="tp-head">
      <span aria-hidden="true" className="tp-avatar">{initialsOf(account.full_name)}</span>
      <div><h1>{account.full_name}</h1><p className="tp-muted">Identifiant : {account.email}</p></div>
      <button className="tp-quiet tp-logout" onClick={logout} type="button"><PIcon name="logout" />Se déconnecter</button>
    </header>
    <nav aria-label="Espace candidat" className="tp-tabs">{TABS.map(([key, label]) => <a aria-current={tab === key ? "page" : undefined} className={tab === key ? "is-on" : ""} href={key ? `${PORTAL_BASE}/${key}` : PORTAL_BASE} key={key || "home"} onClick={(event) => { event.preventDefault(); goTo(key); }}>{label}{key === "notifications" && data.unread ? <b>{data.unread}</b> : null}</a>)}</nav>
    <Notice>{data.error}</Notice>
    {!account.phone || !account.candidate_location ? <p className="tp-notice is-warn" role="status"><PIcon name="alert" />Votre profil est incomplet : ajoutez votre {[!account.phone && "téléphone", !account.candidate_location && "ville"].filter(Boolean).join(" et votre ")} pour pouvoir postuler. <a href={`${PORTAL_BASE}/profil${back ? `?retour=${encodeURIComponent(back)}` : ""}`} onClick={(event) => { event.preventDefault(); go(`${PORTAL_BASE}/profil${back ? `?retour=${encodeURIComponent(back)}` : ""}`); }}>Compléter mon profil</a></p> : null}
    <div className="tp-content">
      {tab === "" ? <Overview account={account} data={data} goTo={goTo} /> : null}
      {tab === "candidatures" ? <ApplicationsView data={data} onWithdraw={withdraw} /> : null}
      {tab === "entretiens" ? <InterviewsView data={data} /> : null}
      {tab === "notifications" ? <NotificationsView apiBaseUrl={apiBaseUrl} data={data} /> : null}
      {tab === "profil" ? <ProfileView account={account} apiBaseUrl={apiBaseUrl} back={back} data={data} onAccount={setAccount} onDeleted={() => { setAccount(null); go(PORTAL_BASE); }} /> : null}
    </div>
  </main>;
}
