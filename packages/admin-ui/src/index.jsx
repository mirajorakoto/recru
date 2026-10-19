import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";
import { apiRequest, friendlyError, json, permissions, PIPELINE_STATUSES, ROLE_LABELS } from "./lib";
import { AppContext, Avatar, ErrorNote, Field, Icon, Loading, RichEditor, ScorePanel, useOverlays } from "./ui";
import { Dashboard } from "./Dashboard";
import { OffersPage } from "./Offers";
import { CandidateDrawer, CandidatesPage, NewApplicationDrawer } from "./Candidates";
import { PipelinePage, RankingPage } from "./Pipeline";
import { SearchPage } from "./Search";
import { InterviewsPage } from "./Interviews";
import { AccountPage, AlertsPage, JournalPage, ReportsPage, SettingsPage } from "./Admin";

export { PIPELINE_STATUSES, RichEditor, ScorePanel };

const NAV = [
  ["Pilotage", [["dashboard", "Tableau de bord", "dashboard"], ["reports", "Rapports", "reports"], ["alerts", "Alertes", "bell"]]],
  ["Recrutement", [["offers", "Offres", "offers"], ["candidates", "Candidatures", "candidates"], ["pipeline", "Pipeline", "pipeline"], ["matching", "Classement", "matching"], ["search", "Recherche", "search"], ["interviews", "Entretiens", "interviews"]]],
  ["Administration", [["account", "Compte RH et candidats", "team"], ["journal", "Journal d'audit", "journal"], ["settings", "Paramètres", "settings"]]]
];
const PAGES = NAV.flatMap(([, items]) => items);

function readHash() {
  const [page, id] = (window.location.hash || "").replace(/^#\/?/, "").split("/");
  return { page: PAGES.some(([key]) => key === page) ? page : "dashboard", id: /^\d+$/.test(id || "") ? Number(id) : null };
}

function useTheme() {
  const [theme, setThemeState] = useState(() => { try { return window.localStorage.getItem("rh-theme") || "system"; } catch { return "system"; } });
  const setTheme = (value) => { setThemeState(value); try { window.localStorage.setItem("rh-theme", value); } catch { /* stockage indisponible */ } };
  return [theme, setTheme];
}

/* Accès à l'espace RH : un SEUL compte (administrateur + recruteur).
   - aucun compte  -> création du compte RH par la première personne qui arrive (mode « setup ») ;
   - compte existant -> connexion (mode « login »), avec « Mot de passe oublié » (mode « forgot »). */
function AuthScreen({ api, initialMode, onDone }) {
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({ display_name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => { setMode(initialMode); }, [initialMode]);
  const set = (name) => (event) => setForm((current) => ({ ...current, [name]: event.target.value }));
  const go = (next) => { setMode(next); setError(""); };

  async function submit(event) {
    event.preventDefault(); setError(""); setNotice("");
    if (mode === "setup" && form.password !== form.confirm) { setError("Les deux mots de passe ne sont pas identiques."); return; }
    setPending(true);
    try {
      if (mode === "setup") {
        await apiRequest(api, "/auth/setup", { method: "POST", body: json({ display_name: form.display_name, email: form.email, password: form.password }) });
        onDone();
      } else if (mode === "forgot") {
        await apiRequest(api, "/auth/forgot-password", { method: "POST", body: json({ email: form.email }) });
        setNotice("Si cette adresse est celle du compte RH, un nouveau mot de passe vient de lui être envoyé par e-mail. Connectez-vous avec, puis changez-le.");
        setForm((current) => ({ ...current, password: "", confirm: "" }));
        setMode("login");
      } else {
        await apiRequest(api, "/auth/login", { method: "POST", body: json({ email: form.email, password: form.password }) });
        onDone();
      }
    } catch (caught) {
      if (caught.code === "setup_required") go("setup");
      else if (caught.code === "account_exists") go("login");
      setError(friendlyError(caught));
    } finally { setPending(false); }
  }

  const titles = { setup: "Créer le compte RH", login: "Accès RH", forgot: "Mot de passe oublié" };
  const intros = {
    setup: "Premier accès à l'espace RH : créez le compte RH. Ce sera le seul compte (administrateur et recruteur à la fois).",
    login: "Connectez-vous avec le compte RH pour gérer le recrutement.",
    forgot: "Saisissez l'e-mail du compte RH : un nouveau mot de passe y sera envoyé automatiquement."
  };
  return <main className="rh-login"><form className="rh-login-card" onSubmit={submit}>
    <span className="rh-logo is-big"><Icon name="matching" size={22} /></span>
    <h1>{titles[mode]}</h1><p>{intros[mode]}</p>
    {mode === "setup" ? <Field label="Nom affiché"><input autoComplete="name" maxLength={120} onChange={set("display_name")} placeholder="Ex. : Responsable RH" value={form.display_name} /></Field> : null}
    <Field label="Email"><input autoComplete="username" onChange={set("email")} required type="email" value={form.email} /></Field>
    {mode !== "forgot" ? <Field hint={mode === "setup" ? "10 caractères minimum, avec au moins une lettre et un chiffre." : undefined} label="Mot de passe"><input autoComplete={mode === "setup" ? "new-password" : "current-password"} minLength={mode === "setup" ? 10 : undefined} onChange={set("password")} required type="password" value={form.password} /></Field> : null}
    {mode === "setup" ? <Field label="Confirmer le mot de passe"><input autoComplete="new-password" onChange={set("confirm")} required type="password" value={form.confirm} /></Field> : null}
    {notice ? <p className="rh-notice" role="status">{notice}</p> : null}
    <ErrorNote>{error}</ErrorNote>
    <button className="rh-btn is-primary is-block" disabled={pending} type="submit">
      {mode === "setup" ? (pending ? "Création…" : "Créer le compte RH") : mode === "forgot" ? (pending ? "Envoi…" : "Envoyer un nouveau mot de passe") : (pending ? "Connexion…" : "Se connecter")}
    </button>
    {mode === "login" ? <button className="rh-link rh-login-link" onClick={() => go("forgot")} type="button">Mot de passe oublié ?</button> : null}
    {mode === "forgot" ? <button className="rh-link rh-login-link" onClick={() => go("login")} type="button">Retour à la connexion</button> : null}
  </form></main>;
}

function CommandPalette({ candidates, onClose, onPage, onCandidate }) {
  const [q, setQ] = useState("");
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); const key = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [onClose]);
  const needle = q.trim().toLowerCase();
  const pages = PAGES.filter(([, label]) => !needle || label.toLowerCase().includes(needle));
  const people = needle ? candidates.filter((c) => `${c.full_name} ${c.email} ${c.job_title} ${c.reference || ""}`.toLowerCase().includes(needle)).slice(0, 6) : [];
  const first = () => (people[0] ? onCandidate(people[0].id) : pages[0] ? onPage(pages[0][0]) : null);
  return <div className="rh-scrim is-top" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div aria-label="Palette de commandes" aria-modal="true" className="rh-palette" role="dialog">
      <label><Icon name="search" size={18} /><input aria-label="Rechercher une page ou un candidat" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") first(); }} placeholder="Page, candidat ou référence (TZR-…)" ref={ref} value={q} /></label>
      <ul>{people.map((c) => <li key={`c${c.id}`}><button onClick={() => onCandidate(c.id)} type="button"><Avatar name={c.full_name} size={26} /><span>{c.full_name}<small>{c.reference ? `${c.reference} · ` : ""}{c.job_title}</small></span></button></li>)}
        {pages.map(([key, label, icon]) => <li key={key}><button onClick={() => onPage(key)} type="button"><Icon name={icon} size={18} /><span>{label}</span></button></li>)}
        {!pages.length && !people.length ? <li className="rh-muted rh-pad">Aucun résultat.</li> : null}</ul>
    </div>
  </div>;
}

export function RecruitmentAdminPanel({ apiBaseUrl = "/api/admin/recrutement" }) {
  const api = apiBaseUrl;
  const overlays = useOverlays();
  const [theme, setTheme] = useTheme();
  const [auth, setAuth] = useState("loading");
  const [me, setMe] = useState(null);
  const [boot, setBoot] = useState("");
  const [offers, setOffers] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [filters, setFilters] = useState({ job_id: "", processing_status: "", hr_decision: "" });
  const [route, setRoute] = useState(readHash);
  const [openCand, setOpenCand] = useState(() => { const { id } = readHash(); return id ? { id, tab: "analysis" } : null; });
  const [showNew, setShowNew] = useState(false);
  const [menu, setMenu] = useState(false);
  const [palette, setPalette] = useState(false);
  const [tick, setTick] = useState(0);

  const query = useMemo(() => { const p = new URLSearchParams({ limit: "100" }); Object.entries(filters).forEach(([k, v]) => { if (v) p.set(k, v); }); return p.toString(); }, [filters]);

  const loadCore = useCallback(async () => {
    try {
      const [profile, jobs, list] = await Promise.all([apiRequest(api, "/moi"), apiRequest(api, "/offres"), apiRequest(api, `/candidatures?${query}`)]);
      setMe(profile); setOffers(jobs.offres || []); setCandidates(list.candidatures || []); setNextCursor(list.pagination?.next_cursor || null); setAuth("ready"); setBoot("");
    } catch (error) {
      if (error.status === 401) setAuth(error.code === "setup_required" ? "setup" : "login");
      else { setBoot(friendlyError(error)); setAuth((current) => (current === "ready" ? current : "error")); }
    }
  }, [api, query]);
  useEffect(() => { loadCore(); }, [loadCore, tick]);
  useEffect(() => { const on = () => setAuth((current) => (current === "ready" ? "login" : current)); window.addEventListener("rh:unauthorized", on); return () => window.removeEventListener("rh:unauthorized", on); }, []);

  async function loadMore() {
    try { const list = await apiRequest(api, `/candidatures?${query}&cursor=${encodeURIComponent(nextCursor)}`); setCandidates((c) => [...c, ...(list.candidatures || [])]); setNextCursor(list.pagination?.next_cursor || null); }
    catch (error) { overlays.toast(friendlyError(error), "error"); }
  }

  const navigate = useCallback((page, id) => { window.location.hash = id ? `/${page}/${id}` : `/${page}`; setMenu(false); setPalette(false); }, []);
  useEffect(() => { const on = () => { const next = readHash(); setRoute(next); if (next.id) setOpenCand((c) => (c?.id === next.id ? c : { id: next.id, tab: "analysis" })); }; window.addEventListener("hashchange", on); return () => window.removeEventListener("hashchange", on); }, []);
  useEffect(() => { const key = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((v) => !v); } }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, []);

  const role = me?.role || "rh";
  const perms = permissions(role);
  const refreshCore = useCallback(() => setTick((t) => t + 1), []);
  const openCandidate = useCallback((id, tab = "analysis") => { setPalette(false); setOpenCand({ id, tab }); }, []);
  const ctx = useMemo(() => ({ api, me, role, offers, perms, toast: overlays.toast, confirm: overlays.confirm, refreshCore, openCandidate, navigate }), [api, me, role, offers, perms.write, perms.admin, overlays.toast, overlays.confirm, refreshCore, openCandidate, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  async function logout() {
    try { await apiRequest(api, "/auth/logout", { method: "POST", body: "{}" }); setAuth("login"); setMe(null); }
    catch { overlays.toast("La déconnexion est gérée par le portail administrateur.", "info"); }
  }

  if (auth === "loading") return <div className="rh-root" data-theme={theme}><Loading label="Connexion au module RH…" /></div>;
  if (auth === "login" || auth === "setup") return <div className="rh-root" data-theme={theme}><AuthScreen api={api} initialMode={auth} onDone={() => { setAuth("loading"); refreshCore(); }} /></div>;
  if (auth === "error") return <div className="rh-root" data-theme={theme}><div className="rh-page"><ErrorNote>{boot}</ErrorNote><button className="rh-btn" onClick={refreshCore} type="button">Réessayer</button></div></div>;

  const page = route.page;
  const current = PAGES.find(([key]) => key === page);
  const failed = candidates.filter((c) => c.processing_status === "analysis_failed").length;
  const closeCandidate = () => { setOpenCand(null); if (route.id) navigate(page); };

  return <AppContext.Provider value={ctx}>
    <div className={`rh-root${menu ? " menu-open" : ""}`} data-theme={theme}>
      <a className="rh-skip" href="#rh-main">Aller au contenu</a>
      <aside aria-label="Navigation principale" className="rh-side">
        <div className="rh-brand"><span className="rh-logo"><Icon name="matching" size={18} /></span><div><strong>TechZone RH</strong><small>Recrutement assisté par IA</small></div></div>
        <nav>{NAV.map(([group, items]) => { return <div className="rh-navgroup" key={group}><h2>{group}</h2>{items.map(([key, label, icon]) => <a aria-current={page === key ? "page" : undefined} className={page === key ? "is-active" : ""} href={`#/${key}`} key={key} onClick={() => setMenu(false)}><Icon name={icon} size={18} />{label}{key === "alerts" && failed ? <b>{failed}</b> : null}</a>)}</div>; })}</nav>
        <div className="rh-me"><Avatar name={me?.display_name || me?.email} size={34} /><div><strong>{me?.display_name}</strong><small>{ROLE_LABELS[role] || role}</small></div><button aria-label="Se déconnecter" className="rh-icon-btn is-on-dark" onClick={logout} title="Se déconnecter" type="button"><Icon name="logout" size={18} /></button></div>
      </aside>
      {menu ? <button aria-label="Fermer le menu" className="rh-menu-scrim" onClick={() => setMenu(false)} type="button" /> : null}
      <div className="rh-main">
        <header className="rh-top">
          <button aria-label="Ouvrir le menu" className="rh-icon-btn rh-burger" onClick={() => setMenu(true)} type="button"><Icon name="menu" /></button>
          <span className="rh-crumb">{current?.[1]}</span>
          <button className="rh-cmdk" onClick={() => setPalette(true)} type="button"><Icon name="search" size={16} /><span>Rechercher…</span><kbd>Ctrl K</kbd></button>
          {perms.write ? <button className="rh-btn is-primary is-sm rh-top-new" onClick={() => setShowNew(true)} type="button"><Icon name="plus" size={16} />Candidature</button> : null}
          <a aria-label="Alertes" className="rh-icon-btn rh-bell" href="#/alerts"><Icon name="bell" />{failed ? <i /> : null}</a>
          <button aria-label="Changer de thème" className="rh-icon-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} type="button"><Icon name={theme === "dark" ? "sun" : "moon"} /></button>
        </header>
        <main id="rh-main" tabIndex={-1}>
          {boot ? <ErrorNote>{boot}</ErrorNote> : null}
          {page === "dashboard" ? <Dashboard candidates={candidates} navigate={navigate} openCandidate={openCandidate} /> : null}
          {page === "offers" ? <OffersPage canWrite={perms.write} candidates={candidates} offers={offers} openJobCandidates={(id) => { setFilters((f) => ({ ...f, job_id: String(id) })); navigate("candidates"); }} refresh={refreshCore} /> : null}
          {page === "candidates" ? <CandidatesPage candidates={candidates} canWrite={perms.write} filters={filters} loadMore={loadMore} nextCursor={nextCursor} offers={offers} onNew={() => setShowNew(true)} openCandidate={openCandidate} refresh={refreshCore} setFilters={setFilters} /> : null}
          {page === "pipeline" ? <PipelinePage canWrite={perms.write} candidates={candidates} offers={offers} openCandidate={openCandidate} refresh={refreshCore} /> : null}
          {page === "matching" ? <RankingPage canWrite={perms.write} offers={offers} openCandidate={openCandidate} /> : null}
          {page === "search" ? <SearchPage offers={offers} openCandidate={openCandidate} /> : null}
          {page === "interviews" ? <InterviewsPage canWrite={perms.write} candidates={candidates} openCandidate={openCandidate} /> : null}
          {page === "reports" ? <ReportsPage candidates={candidates} navigate={navigate} /> : null}
          {page === "alerts" ? <AlertsPage isAdmin={perms.admin} navigate={navigate} openCandidate={openCandidate} /> : null}
          {page === "account" ? <AccountPage /> : null}
          {page === "journal" ? <JournalPage openCandidate={openCandidate} /> : null}
          {page === "settings" ? <SettingsPage setTheme={setTheme} theme={theme} /> : null}
        </main>
      </div>
      {openCand ? <CandidateDrawer id={openCand.id} initialTab={openCand.tab} onClose={closeCandidate} /> : null}
      {showNew ? <NewApplicationDrawer offers={offers} onClose={() => setShowNew(false)} onCreated={(id) => { setShowNew(false); refreshCore(); if (id) openCandidate(id); }} /> : null}
      {palette ? <CommandPalette candidates={candidates} onClose={() => setPalette(false)} onCandidate={openCandidate} onPage={navigate} /> : null}
      {overlays.host}
    </div>
  </AppContext.Provider>;
}

export default RecruitmentAdminPanel;
