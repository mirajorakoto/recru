import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Espace candidat (CDC §7.3, §8, §24, §31) servi sur /recrutement/compte :
 * inscription, connexion, mot de passe oublié / réinitialisation (?token=), profil,
 * changement de mot de passe, suivi des candidatures, convocations aux entretiens,
 * notifications, retrait d'une candidature et suppression du compte.
 * La candidature elle-même se fait depuis la page d'une offre : connecté, le candidat n'a plus
 * de captcha et sa candidature est rattachée à son compte.
 */

export const STATUS_LABELS = {
  nouvelle: "Reçue", en_analyse: "En cours d'étude", cv_analyse: "Dossier étudié", preselectionnee: "Présélectionnée",
  entretien: "Entretien programmé", evaluation: "Entretien réalisé", en_attente: "En attente de décision",
  acceptee: "Décision favorable", refusee: "Non retenue"
};
const PROGRESS_STEPS = ["nouvelle", "cv_analyse", "preselectionnee", "entretien", "evaluation", "acceptee"];
const MODE_LABELS = { onsite: "Sur site", visio: "Visioconférence", phone: "Téléphone" };
const TABS = [["applications", "Mes candidatures"], ["interviews", "Mes entretiens"], ["notifications", "Notifications"], ["profile", "Mon profil"]];

async function portalRequest(apiBaseUrl, path, options = {}) {
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers = { ...(options.headers || {}) };
  if (options.body && !isForm) headers["Content-Type"] = "application/json";
  const response = await fetch(`${apiBaseUrl}${path}`, { credentials: "same-origin", ...options, headers });
  const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Erreur ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short" }).format(date);
}

/** Compte candidat de la session courante (null si non connecté, undefined pendant le chargement). */
export function useCandidateAccount(apiBaseUrl) {
  const [account, setAccount] = useState(undefined);
  useEffect(() => {
    let alive = true;
    portalRequest(apiBaseUrl, "/compte/moi")
      .then((data) => { if (alive) setAccount(data.compte); })
      .catch(() => { if (alive) setAccount(null); });
    return () => { alive = false; };
  }, [apiBaseUrl]);
  return [account, setAccount];
}

function Field({ label, id, children }) {
  return <div className="tz-form-field"><label htmlFor={id}>{label}</label>{children}</div>;
}

function Message({ message }) {
  if (!message?.text) return null;
  return message.type === "error"
    ? <p className="tz-alert" role="alert">{message.text}</p>
    : <p className="tz-portal-ok" role="status">{message.text}</p>;
}

function AuthForms({ apiBaseUrl, onAuthenticated, resetToken }) {
  const [view, setView] = useState(resetToken ? "reset" : "login");
  const [form, setForm] = useState({ email: "", password: "", password2: "", full_name: "", phone: "", candidate_location: "", consent: false });
  const [message, setMessage] = useState({ type: "", text: "" });
  const [pending, setPending] = useState(false);
  const set = (name, value) => setForm((current) => ({ ...current, [name]: value }));
  const titles = { login: "Connexion", register: "Créer mon compte", forgot: "Mot de passe oublié", reset: "Nouveau mot de passe" };

  async function submit(event) {
    event.preventDefault();
    setPending(true); setMessage({ type: "", text: "" });
    try {
      if (view === "login") {
        const result = await portalRequest(apiBaseUrl, "/compte/connexion", { method: "POST", body: JSON.stringify({ email: form.email, password: form.password }) });
        onAuthenticated(result.compte);
      } else if (view === "register") {
        if (form.password !== form.password2) throw new Error("Les deux mots de passe ne correspondent pas.");
        const result = await portalRequest(apiBaseUrl, "/compte/inscription", { method: "POST", body: JSON.stringify({ email: form.email, password: form.password, full_name: form.full_name, phone: form.phone, candidate_location: form.candidate_location, consent: form.consent }) });
        onAuthenticated(result.compte);
      } else if (view === "forgot") {
        await portalRequest(apiBaseUrl, "/compte/mot-de-passe-oublie", { method: "POST", body: JSON.stringify({ email: form.email }) });
        setMessage({ type: "ok", text: "Si un compte existe avec cet email, un lien de réinitialisation vient d'être envoyé (valable 1 heure)." });
      } else {
        if (form.password !== form.password2) throw new Error("Les deux mots de passe ne correspondent pas.");
        await portalRequest(apiBaseUrl, "/compte/reinitialisation", { method: "POST", body: JSON.stringify({ token: resetToken, password: form.password }) });
        window.history.replaceState({}, "", window.location.pathname);
        setMessage({ type: "ok", text: "Mot de passe modifié. Vous pouvez maintenant vous connecter." });
        setView("login");
      }
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally { setPending(false); }
  }

  return <main className="tz-container tz-section"><form className="tz-form-card tz-portal-auth" onSubmit={submit}>
    <h1>{titles[view]}</h1>
    {view !== "reset" ? <Field id="pa-email" label="Adresse e-mail"><input autoComplete="email" id="pa-email" required type="email" value={form.email} onChange={(event) => set("email", event.target.value)} /></Field> : null}
    {view === "register" ? <>
      <Field id="pa-name" label="Nom complet"><input autoComplete="name" id="pa-name" required value={form.full_name} onChange={(event) => set("full_name", event.target.value)} /></Field>
      <Field id="pa-phone" label="Téléphone"><input autoComplete="tel" id="pa-phone" value={form.phone} onChange={(event) => set("phone", event.target.value)} /></Field>
      <Field id="pa-loc" label="Ville ou région (facultatif)"><input id="pa-loc" value={form.candidate_location} onChange={(event) => set("candidate_location", event.target.value)} /></Field>
    </> : null}
    {view !== "forgot" ? <Field id="pa-pass" label={view === "login" ? "Mot de passe" : "Mot de passe (10 caractères minimum, avec lettres et chiffres)"}><input autoComplete={view === "login" ? "current-password" : "new-password"} id="pa-pass" minLength={view === "login" ? undefined : 10} required type="password" value={form.password} onChange={(event) => set("password", event.target.value)} /></Field> : null}
    {view === "register" || view === "reset" ? <Field id="pa-pass2" label="Confirmer le mot de passe"><input autoComplete="new-password" id="pa-pass2" required type="password" value={form.password2} onChange={(event) => set("password2", event.target.value)} /></Field> : null}
    {view === "register" ? <label className="tz-consent"><input checked={form.consent} onChange={(event) => set("consent", event.target.checked)} required type="checkbox" /><span>J'accepte que mes données soient traitées uniquement pour gérer mes candidatures. Je peux supprimer mon compte et mes données à tout moment.</span></label> : null}
    <Message message={message} />
    <button className="tz-btn tz-btn-primary" disabled={pending} type="submit">{pending ? "Patientez…" : titles[view]}</button>
    <div className="tz-portal-links">
      {view !== "login" ? <button onClick={() => setView("login")} type="button">J'ai déjà un compte</button> : null}
      {view !== "register" ? <button onClick={() => setView("register")} type="button">Créer un compte</button> : null}
      {view === "login" ? <button onClick={() => setView("forgot")} type="button">Mot de passe oublié ?</button> : null}
    </div>
  </form></main>;
}

function Applications({ apiBaseUrl, version, onChanged }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    portalRequest(apiBaseUrl, "/compte/candidatures").then((data) => setItems(data.candidatures || [])).catch((caught) => setError(caught.message));
  }, [apiBaseUrl, version]);
  async function withdraw(item) {
    if (!window.confirm(`Retirer votre candidature au poste « ${item.job_title} » ?`)) return;
    try { await portalRequest(apiBaseUrl, `/compte/candidatures/${item.public_id}/retrait`, { method: "POST", body: "{}" }); onChanged(); }
    catch (caught) { setError(caught.message); }
  }
  if (error) return <p className="tz-alert" role="alert">{error}</p>;
  if (!items) return <p className="tz-status-text" role="status">Chargement…</p>;
  if (!items.length) return <div><p>Vous n'avez pas encore postulé.</p><a className="tz-btn tz-btn-primary" href="/recrutement">Voir les offres en cours</a></div>;
  return <div className="tz-portal-list">{items.map((item) => {
    const withdrawn = item.hr_decision === "withdrawn";
    const index = PROGRESS_STEPS.indexOf(item.pipeline_status);
    return <article className="tz-form-card tz-portal-item" key={item.public_id}>
      <h3>{item.job_title}</h3>
      <p>Reçue le {formatDate(item.created_at)} · Référence {String(item.public_id).slice(0, 8).toUpperCase()}</p>
      <p><strong>{withdrawn ? "Candidature retirée" : STATUS_LABELS[item.pipeline_status] || "En cours d'étude"}</strong></p>
      {!withdrawn && item.pipeline_status !== "refusee" ? <ol aria-label="Avancement" className="tz-portal-steps">{PROGRESS_STEPS.map((step, position) => <li className={position <= index ? "is-done" : ""} key={step}>{STATUS_LABELS[step]}</li>)}</ol> : null}
      {!withdrawn && !["acceptee", "refusee"].includes(item.pipeline_status) ? <button className="tz-btn tz-btn-outline" onClick={() => withdraw(item)} type="button">Retirer ma candidature</button> : null}
    </article>;
  })}</div>;
}

function Interviews({ apiBaseUrl, version }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    portalRequest(apiBaseUrl, "/compte/entretiens").then((data) => setItems(data.entretiens || [])).catch((caught) => setError(caught.message));
  }, [apiBaseUrl, version]);
  if (error) return <p className="tz-alert" role="alert">{error}</p>;
  if (!items) return <p className="tz-status-text" role="status">Chargement…</p>;
  if (!items.length) return <p>Aucun entretien programmé pour le moment. Vous serez prévenu(e) ici et par email.</p>;
  return <div className="tz-portal-list">{items.map((item) => <article className="tz-form-card tz-portal-item" key={item.id}>
    <h3>{item.job_title}</h3>
    <p><strong>{formatDate(item.scheduled_at)}</strong> · {item.duration_min} min</p>
    <p>{MODE_LABELS[item.mode] || item.mode}{item.location ? ` · ${item.location}` : ""}</p>
    {item.status === "cancelled" ? <p className="tz-field-error">Entretien annulé</p> : null}
  </article>)}</div>;
}

function Notifications({ apiBaseUrl, version, onRead }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    portalRequest(apiBaseUrl, "/compte/notifications").then(setData).catch((caught) => setError(caught.message));
  }, [apiBaseUrl, version]);
  async function markAll() {
    try { await portalRequest(apiBaseUrl, "/compte/notifications/lues", { method: "POST", body: "{}" }); onRead(); }
    catch (caught) { setError(caught.message); }
  }
  if (error) return <p className="tz-alert" role="alert">{error}</p>;
  if (!data) return <p className="tz-status-text" role="status">Chargement…</p>;
  return <div>
    {data.unread ? <button className="tz-btn tz-btn-outline" onClick={markAll} type="button">Tout marquer comme lu ({data.unread})</button> : null}
    <ul className="tz-portal-notifications">{data.notifications.map((item) => <li className={item.read_at ? "" : "is-unread"} key={item.id}><strong>{item.title}</strong><p>{item.body}</p><small>{formatDate(item.created_at)}</small></li>)}</ul>
    {data.notifications.length === 0 ? <p>Aucune notification.</p> : null}
  </div>;
}

function Profile({ apiBaseUrl, account, onUpdated, onDeleted }) {
  const [form, setForm] = useState({ full_name: account.full_name || "", phone: account.phone || "", candidate_location: account.candidate_location || "", portfolio_url: account.portfolio_url || "" });
  const [passwords, setPasswords] = useState({ current_password: "", new_password: "" });
  const [deletePassword, setDeletePassword] = useState("");
  const [message, setMessage] = useState({ type: "", text: "" });
  async function save(event) {
    event.preventDefault();
    try { const result = await portalRequest(apiBaseUrl, "/compte/moi", { method: "PATCH", body: JSON.stringify(form) }); onUpdated(result.compte); setMessage({ type: "ok", text: "Profil enregistré." }); }
    catch (caught) { setMessage({ type: "error", text: caught.message }); }
  }
  async function changePassword(event) {
    event.preventDefault();
    try { await portalRequest(apiBaseUrl, "/compte/mot-de-passe", { method: "POST", body: JSON.stringify(passwords) }); setPasswords({ current_password: "", new_password: "" }); setMessage({ type: "ok", text: "Mot de passe modifié ; vos autres sessions ont été déconnectées." }); }
    catch (caught) { setMessage({ type: "error", text: caught.message }); }
  }
  async function erase(event) {
    event.preventDefault();
    if (!window.confirm("Supprimer définitivement votre compte, vos candidatures et vos CV ? Cette action est irréversible.")) return;
    try { await portalRequest(apiBaseUrl, "/compte", { method: "DELETE", body: JSON.stringify({ password: deletePassword }) }); onDeleted(); }
    catch (caught) { setMessage({ type: "error", text: caught.message }); }
  }
  return <div className="tz-portal-list">
    <Message message={message} />
    <form className="tz-form-card" onSubmit={save}><h2>Mes informations</h2>
      <Field id="pp-email" label="Adresse e-mail"><input disabled id="pp-email" value={account.email} /></Field>
      <Field id="pp-name" label="Nom complet"><input id="pp-name" required value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></Field>
      <Field id="pp-phone" label="Téléphone"><input id="pp-phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
      <Field id="pp-loc" label="Ville ou région"><input id="pp-loc" value={form.candidate_location} onChange={(event) => setForm({ ...form, candidate_location: event.target.value })} /></Field>
      <Field id="pp-url" label="Portfolio (URL)"><input id="pp-url" type="url" value={form.portfolio_url} onChange={(event) => setForm({ ...form, portfolio_url: event.target.value })} /></Field>
      <button className="tz-btn tz-btn-primary" type="submit">Enregistrer</button></form>
    <form className="tz-form-card" onSubmit={changePassword}><h2>Changer le mot de passe</h2>
      <Field id="pw-cur" label="Mot de passe actuel"><input autoComplete="current-password" id="pw-cur" required type="password" value={passwords.current_password} onChange={(event) => setPasswords({ ...passwords, current_password: event.target.value })} /></Field>
      <Field id="pw-new" label="Nouveau mot de passe"><input autoComplete="new-password" id="pw-new" minLength={10} required type="password" value={passwords.new_password} onChange={(event) => setPasswords({ ...passwords, new_password: event.target.value })} /></Field>
      <button className="tz-btn tz-btn-outline" type="submit">Modifier</button></form>
    <form className="tz-form-card" onSubmit={erase}><h2>Supprimer mon compte</h2>
      <p>Vos données personnelles, candidatures et CV chiffrés seront effacés définitivement.</p>
      <Field id="pd-pass" label="Confirmez avec votre mot de passe"><input autoComplete="current-password" id="pd-pass" required type="password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} /></Field>
      <button className="tz-btn tz-btn-outline tz-portal-danger" type="submit">Supprimer définitivement</button></form>
  </div>;
}

export function CandidatePortal({ apiBaseUrl = "/api/recrutement" }) {
  const [account, setAccount] = useCandidateAccount(apiBaseUrl);
  const [tab, setTab] = useState("applications");
  const [version, setVersion] = useState(0);
  const [unread, setUnread] = useState(0);
  const resetToken = useMemo(() => new URLSearchParams(window.location.search).get("token") || "", []);
  const bump = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    if (!account) return;
    portalRequest(apiBaseUrl, "/compte/notifications?unread=true").then((data) => setUnread(data.unread || 0)).catch(() => {});
  }, [apiBaseUrl, account, version]);

  async function logout() {
    await portalRequest(apiBaseUrl, "/compte/deconnexion", { method: "POST", body: "{}" }).catch(() => {});
    setAccount(null);
  }

  if (account === undefined) return <main className="tz-container tz-section"><p className="tz-status-text" role="status">Chargement…</p></main>;
  if (!account) return <AuthForms apiBaseUrl={apiBaseUrl} onAuthenticated={setAccount} resetToken={resetToken} />;
  return <main className="tz-container tz-section tz-portal">
    <div className="tz-portal-head"><div><p className="tz-portal-eyebrow">Espace candidat</p><h1>Bonjour {account.full_name}</h1></div>
      <div className="tz-portal-head-actions"><a className="tz-btn tz-btn-primary" href="/recrutement">Postuler à une offre</a><button className="tz-btn tz-btn-outline" onClick={logout} type="button">Se déconnecter</button></div></div>
    <nav aria-label="Sections de l'espace candidat" className="tz-portal-tabs">{TABS.map(([id, label]) => <button aria-current={tab === id ? "page" : undefined} className={tab === id ? "is-active" : ""} key={id} onClick={() => setTab(id)} type="button">{label}{id === "notifications" && unread ? <span className="tz-portal-badge">{unread}</span> : null}</button>)}</nav>
    <section>
      {tab === "applications" ? <Applications apiBaseUrl={apiBaseUrl} onChanged={bump} version={version} /> : null}
      {tab === "interviews" ? <Interviews apiBaseUrl={apiBaseUrl} version={version} /> : null}
      {tab === "notifications" ? <Notifications apiBaseUrl={apiBaseUrl} onRead={bump} version={version} /> : null}
      {tab === "profile" ? <Profile account={account} apiBaseUrl={apiBaseUrl} onDeleted={() => setAccount(null)} onUpdated={setAccount} /> : null}
    </section>
  </main>;
}

export default CandidatePortal;
