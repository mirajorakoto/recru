import { useCallback, useEffect, useMemo, useState } from "react";
import "./styles.css";

/**
 * Espace candidat (CDC §7.3, §8, §24, §31) : inscription, connexion, mot de passe oublié,
 * profil, offres + candidature avec CV, suivi des candidatures, convocations,
 * notifications, retrait d'une candidature et suppression du compte.
 * Monter <CandidatePortal apiBaseUrl="/api/recrutement" /> sur la route /candidat de l'app publique.
 */

const STATUS_LABELS = {
  nouvelle: "Reçue", en_analyse: "En cours d'étude", cv_analyse: "Dossier étudié", preselectionnee: "Présélectionnée",
  entretien: "Entretien programmé", evaluation: "Entretien réalisé", en_attente: "En attente de décision",
  acceptee: "Décision favorable", refusee: "Non retenue"
};
const MODE_LABELS = { onsite: "Sur site", visio: "Visioconférence", phone: "Téléphone" };
const TABS = [["offers", "Offres"], ["applications", "Mes candidatures"], ["interviews", "Mes entretiens"], ["notifications", "Notifications"], ["profile", "Mon profil"]];

async function portalRequest(apiBaseUrl, path, options = {}) {
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers = { ...(options.headers || {}) };
  if (options.body && !isForm) headers["Content-Type"] = "application/json";
  const response = await fetch(`${apiBaseUrl}${path}`, { credentials: "include", ...options, headers });
  const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Erreur ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

const formatDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short" }).format(date);
};

function Field({ label, children }) {
  return <label className="cp-field"><span>{label}</span>{children}</label>;
}

function AuthForms({ apiBaseUrl, onAuthenticated, initialView = "login", resetToken = "" }) {
  const [view, setView] = useState(initialView);
  const [form, setForm] = useState({ email: "", password: "", full_name: "", phone: "", candidate_location: "", consent: false, password2: "" });
  const [message, setMessage] = useState({ type: "", text: "" });
  const [pending, setPending] = useState(false);
  const set = (name, value) => setForm((current) => ({ ...current, [name]: value }));

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
      } else if (view === "reset") {
        if (form.password !== form.password2) throw new Error("Les deux mots de passe ne correspondent pas.");
        await portalRequest(apiBaseUrl, "/compte/reinitialisation", { method: "POST", body: JSON.stringify({ token: resetToken, password: form.password }) });
        setMessage({ type: "ok", text: "Mot de passe modifié. Vous pouvez vous connecter." });
        setView("login");
      }
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally { setPending(false); }
  }

  const titles = { login: "Connexion", register: "Créer mon compte", forgot: "Mot de passe oublié", reset: "Nouveau mot de passe" };
  return <form className="cp-card cp-auth" onSubmit={submit}>
    <h1>{titles[view]}</h1>
    {view !== "reset" ? <Field label="Email"><input autoComplete="email" required type="email" value={form.email} onChange={(event) => set("email", event.target.value)} /></Field> : null}
    {view === "register" ? <>
      <Field label="Nom complet"><input autoComplete="name" required value={form.full_name} onChange={(event) => set("full_name", event.target.value)} /></Field>
      <Field label="Téléphone"><input autoComplete="tel" value={form.phone} onChange={(event) => set("phone", event.target.value)} /></Field>
      <Field label="Ville ou région"><input value={form.candidate_location} onChange={(event) => set("candidate_location", event.target.value)} /></Field>
    </> : null}
    {view !== "forgot" ? <Field label={view === "login" ? "Mot de passe" : "Mot de passe (10 caractères min., lettres et chiffres)"}><input autoComplete={view === "login" ? "current-password" : "new-password"} minLength={view === "login" ? undefined : 10} required type="password" value={form.password} onChange={(event) => set("password", event.target.value)} /></Field> : null}
    {view === "register" || view === "reset" ? <Field label="Confirmer le mot de passe"><input autoComplete="new-password" required type="password" value={form.password2} onChange={(event) => set("password2", event.target.value)} /></Field> : null}
    {view === "register" ? <label className="cp-check"><input checked={form.consent} onChange={(event) => set("consent", event.target.checked)} required type="checkbox" /><span>J'accepte que mes données soient traitées uniquement pour gérer mes candidatures. Je peux supprimer mon compte à tout moment.</span></label> : null}
    {message.text ? <p className={message.type === "error" ? "cp-error" : "cp-ok"} role={message.type === "error" ? "alert" : "status"}>{message.text}</p> : null}
    <button className="cp-primary" disabled={pending} type="submit">{pending ? "Patientez…" : titles[view]}</button>
    <div className="cp-links">
      {view !== "login" ? <button onClick={() => setView("login")} type="button">J'ai déjà un compte</button> : null}
      {view !== "register" ? <button onClick={() => setView("register")} type="button">Créer un compte</button> : null}
      {view === "login" ? <button onClick={() => setView("forgot")} type="button">Mot de passe oublié ?</button> : null}
    </div>
  </form>;
}

function Offers({ apiBaseUrl, account, onApplied }) {
  const [offers, setOffers] = useState(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    portalRequest(apiBaseUrl, "/offres").then((data) => setOffers(data.offres || [])).catch((caught) => setError(caught.message));
  }, [apiBaseUrl]);
  if (error) return <p className="cp-error" role="alert">{error}</p>;
  if (!offers) return <p>Chargement des offres…</p>;
  if (selected) return <ApplyForm apiBaseUrl={apiBaseUrl} account={account} job={selected} onCancel={() => setSelected(null)} onDone={() => { setSelected(null); onApplied(); }} />;
  return <div className="cp-list">{offers.map((job) => <article className="cp-card" key={job.public_id}>
    <h3>{job.title}</h3>
    <p>{job.summary}</p>
    <ul className="cp-meta">{[job.location, job.contract_type, job.department, job.required_diploma && `Diplôme : ${job.required_diploma}`, job.required_experience && `Expérience : ${job.required_experience}`, (job.languages || []).length ? `Langues : ${job.languages.join(", ")}` : null].filter(Boolean).map((item) => <li key={item}>{item}</li>)}</ul>
    {job.application_deadline ? <p className="cp-note">Date limite : {formatDate(job.application_deadline)}</p> : null}
    <button className="cp-primary" onClick={() => setSelected(job)} type="button">Postuler</button>
  </article>)}{offers.length === 0 ? <p>Aucune offre ouverte pour le moment.</p> : null}</div>;
}

function ApplyForm({ apiBaseUrl, account, job, onCancel, onDone }) {
  const [phone, setPhone] = useState(account.phone || "");
  const [cv, setCv] = useState(null);
  const [letter, setLetter] = useState(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (!cv) { setError("Ajoutez votre CV (PDF ou DOCX)."); return; }
    setPending(true); setError("");
    try {
      const form = new FormData();
      form.append("phone", phone); form.append("consent", String(consent)); form.append("cv", cv);
      if (letter) form.append("cover_letter", letter);
      await portalRequest(apiBaseUrl, `/offres/${job.public_id}/candidatures`, { method: "POST", body: form });
      onDone();
    } catch (caught) { setError(caught.message); } finally { setPending(false); }
  }
  return <form className="cp-card" onSubmit={submit}>
    <h2>Postuler : {job.title}</h2>
    <p className="cp-note">Votre candidature sera rattachée à votre compte ({account.email}).</p>
    <Field label="Téléphone"><input required value={phone} onChange={(event) => setPhone(event.target.value)} /></Field>
    <Field label="CV (PDF ou DOCX, 10 Mo max.)"><input accept=".pdf,.docx" required type="file" onChange={(event) => setCv(event.target.files[0] || null)} /></Field>
    <Field label="Lettre de motivation (facultatif)"><input accept=".pdf,.docx" type="file" onChange={(event) => setLetter(event.target.files[0] || null)} /></Field>
    <label className="cp-check"><input checked={consent} onChange={(event) => setConsent(event.target.checked)} required type="checkbox" /><span>Je consens au traitement de mes données pour cette candidature. Une analyse automatisée assiste l'équipe, mais la décision est toujours prise par un humain.</span></label>
    {error ? <p className="cp-error" role="alert">{error}</p> : null}
    <div className="cp-actions"><button onClick={onCancel} type="button">Annuler</button><button className="cp-primary" disabled={pending} type="submit">{pending ? "Envoi…" : "Envoyer ma candidature"}</button></div>
  </form>;
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
  if (error) return <p className="cp-error" role="alert">{error}</p>;
  if (!items) return <p>Chargement…</p>;
  if (!items.length) return <p>Vous n'avez pas encore postulé. Consultez les offres pour commencer.</p>;
  const steps = ["nouvelle", "cv_analyse", "preselectionnee", "entretien", "evaluation", "acceptee"];
  return <div className="cp-list">{items.map((item) => {
    const withdrawn = item.hr_decision === "withdrawn";
    const index = steps.indexOf(item.pipeline_status);
    return <article className="cp-card" key={item.public_id}>
      <h3>{item.job_title}</h3>
      <p>Reçue le {formatDate(item.created_at)}</p>
      <p><strong>{withdrawn ? "Candidature retirée" : STATUS_LABELS[item.pipeline_status] || "En cours"}</strong></p>
      {!withdrawn && item.pipeline_status !== "refusee" ? <ol className="cp-steps" aria-label="Avancement">{steps.map((step, position) => <li className={position <= index ? "is-done" : ""} key={step}>{STATUS_LABELS[step]}</li>)}</ol> : null}
      {!withdrawn && !["acceptee", "refusee"].includes(item.pipeline_status) ? <button onClick={() => withdraw(item)} type="button">Retirer ma candidature</button> : null}
    </article>;
  })}</div>;
}

function Interviews({ apiBaseUrl, version }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    portalRequest(apiBaseUrl, "/compte/entretiens").then((data) => setItems(data.entretiens || [])).catch((caught) => setError(caught.message));
  }, [apiBaseUrl, version]);
  if (error) return <p className="cp-error" role="alert">{error}</p>;
  if (!items) return <p>Chargement…</p>;
  if (!items.length) return <p>Aucun entretien programmé pour le moment.</p>;
  return <div className="cp-list">{items.map((item) => <article className="cp-card" key={item.id}>
    <h3>{item.job_title}</h3>
    <p><strong>{formatDate(item.scheduled_at)}</strong> · {item.duration_min} min</p>
    <p>{MODE_LABELS[item.mode] || item.mode}{item.location ? ` · ${item.location}` : ""}</p>
    {item.status === "cancelled" ? <p className="cp-error">Entretien annulé</p> : null}
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
  if (error) return <p className="cp-error" role="alert">{error}</p>;
  if (!data) return <p>Chargement…</p>;
  return <div>
    {data.unread ? <button onClick={markAll} type="button">Tout marquer comme lu ({data.unread})</button> : null}
    <ul className="cp-notifications">{data.notifications.map((item) => <li className={item.read_at ? "" : "is-unread"} key={item.id}><strong>{item.title}</strong><p>{item.body}</p><small>{formatDate(item.created_at)}</small></li>)}</ul>
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
  return <div className="cp-profile">
    {message.text ? <p className={message.type === "error" ? "cp-error" : "cp-ok"} role={message.type === "error" ? "alert" : "status"}>{message.text}</p> : null}
    <form className="cp-card" onSubmit={save}><h2>Mes informations</h2>
      <Field label="Email"><input disabled value={account.email} /></Field>
      <Field label="Nom complet"><input required value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></Field>
      <Field label="Téléphone"><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
      <Field label="Ville ou région"><input value={form.candidate_location} onChange={(event) => setForm({ ...form, candidate_location: event.target.value })} /></Field>
      <Field label="Portfolio (URL)"><input type="url" value={form.portfolio_url} onChange={(event) => setForm({ ...form, portfolio_url: event.target.value })} /></Field>
      <button className="cp-primary" type="submit">Enregistrer</button></form>
    <form className="cp-card" onSubmit={changePassword}><h2>Changer le mot de passe</h2>
      <Field label="Mot de passe actuel"><input autoComplete="current-password" required type="password" value={passwords.current_password} onChange={(event) => setPasswords({ ...passwords, current_password: event.target.value })} /></Field>
      <Field label="Nouveau mot de passe"><input autoComplete="new-password" minLength={10} required type="password" value={passwords.new_password} onChange={(event) => setPasswords({ ...passwords, new_password: event.target.value })} /></Field>
      <button type="submit">Modifier</button></form>
    <form className="cp-card" onSubmit={erase}><h2>Supprimer mon compte</h2>
      <p className="cp-note">Vos données personnelles, candidatures et CV chiffrés seront effacés définitivement.</p>
      <Field label="Confirmez avec votre mot de passe"><input autoComplete="current-password" required type="password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} /></Field>
      <button className="cp-danger" type="submit">Supprimer définitivement</button></form>
  </div>;
}

export function CandidatePortal({ apiBaseUrl = "/api/recrutement" }) {
  const [account, setAccount] = useState(undefined); // undefined = chargement, null = non connecté
  const [tab, setTab] = useState("offers");
  const [version, setVersion] = useState(0);
  const [unread, setUnread] = useState(0);
  const resetToken = useMemo(() => (typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("token") || ""), []);
  const bump = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    portalRequest(apiBaseUrl, "/compte/moi").then((data) => setAccount(data.compte)).catch(() => setAccount(null));
  }, [apiBaseUrl]);
  useEffect(() => {
    if (!account) return;
    portalRequest(apiBaseUrl, "/compte/notifications?unread=true").then((data) => setUnread(data.unread || 0)).catch(() => {});
  }, [apiBaseUrl, account, version]);

  async function logout() {
    await portalRequest(apiBaseUrl, "/compte/deconnexion", { method: "POST", body: "{}" }).catch(() => {});
    setAccount(null);
  }

  if (account === undefined) return <p className="cp-shell">Chargement…</p>;
  if (!account) return <main className="cp-shell"><AuthForms apiBaseUrl={apiBaseUrl} initialView={resetToken ? "reset" : "login"} onAuthenticated={setAccount} resetToken={resetToken} /></main>;
  return <main className="cp-shell">
    <header className="cp-header"><div><p className="cp-eyebrow">Espace candidat</p><h1>Bonjour {account.full_name}</h1></div><button onClick={logout} type="button">Se déconnecter</button></header>
    <nav className="cp-tabs" aria-label="Sections">{TABS.map(([id, label]) => <button aria-current={tab === id ? "page" : undefined} className={tab === id ? "is-active" : ""} key={id} onClick={() => setTab(id)} type="button">{label}{id === "notifications" && unread ? <span className="cp-badge">{unread}</span> : null}</button>)}</nav>
    <section>
      {tab === "offers" ? <Offers account={account} apiBaseUrl={apiBaseUrl} onApplied={() => { bump(); setTab("applications"); }} /> : null}
      {tab === "applications" ? <Applications apiBaseUrl={apiBaseUrl} onChanged={bump} version={version} /> : null}
      {tab === "interviews" ? <Interviews apiBaseUrl={apiBaseUrl} version={version} /> : null}
      {tab === "notifications" ? <Notifications apiBaseUrl={apiBaseUrl} onRead={bump} version={version} /> : null}
      {tab === "profile" ? <Profile account={account} apiBaseUrl={apiBaseUrl} onDeleted={() => setAccount(null)} onUpdated={setAccount} /> : null}
    </section>
  </main>;
}

export default CandidatePortal;
