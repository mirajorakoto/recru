import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";
import { CandidatePortal, PORTAL_BASE, useCandidateAccount } from "./portal";

const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

const CONTRACT_LABELS = {
  stage: "Stage", cdd: "CDD", cdi: "CDI", alternance: "Alternance",
  freelance: "Freelance", interim: "Intérim", autre: "Autre"
};

const WORK_MODE_LABELS = { onsite: "Sur site", hybrid: "Hybride", remote: "À distance" };

const ACCEPTED_DOCUMENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
];

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${TURNSTILE_SCRIPT}"]`);
    const script = existing || Object.assign(document.createElement("script"), {
      src: TURNSTILE_SCRIPT,
      async: true,
      defer: true
    });
    script.addEventListener("load", () => resolve(window.turnstile), { once: true });
    script.addEventListener("error", () => reject(new Error("Le contrôle anti-robot n’a pas pu être chargé.")), { once: true });
    if (!existing) document.head.appendChild(script);
  });
}

async function apiRequest(apiBaseUrl, path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

function AppLink({ to, ...props }) {
  return <a href={to} {...props} />;
}

function useBrowserLocation() {
  const [location, setLocation] = useState(() => ({ pathname: window.location.pathname, search: window.location.search }));
  useEffect(() => {
    const update = () => setLocation({ pathname: window.location.pathname, search: window.location.search });
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  return location;
}

function navigateBrowser(to) {
  window.history.pushState({}, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function formatFileSize(bytes) {
  if (bytes === null || bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} o`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
  return `${Math.round(bytes / 1024)} Ko`;
}

function formatReference(applicationId) {
  const year = new Date().getFullYear();
  const hex = String(applicationId || "").replace(/[^0-9a-f]/gi, "").slice(0, 4).toUpperCase();
  return `TZR-${year}-${hex || "0000"}`;
}

function validateDocument(file) {
  if (!file) return "";
  const acceptedExt = /\.(pdf|docx)$/i.test(file.name);
  if (!acceptedExt || (file.type && !ACCEPTED_DOCUMENT_TYPES.includes(file.type))) {
    return "Format de fichier non accepté. Utilisez un fichier PDF ou DOCX.";
  }
  if (file.size > 10 * 1024 * 1024) return "Le fichier dépasse 10 Mo.";
  return "";
}

/* -------------------------------------------------------------------------
   Icônes (SVG en ligne, palette neutre héritant de currentColor)
   ------------------------------------------------------------------------- */

function Icon({ name, className }) {
  const common = {
    width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
    strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round",
    className, "aria-hidden": true, focusable: false
  };
  switch (name) {
    case "search":
      return <svg {...common}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.3" y2="16.3" /></svg>;
    case "mapPin":
      return <svg {...common}><path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11Z" /><circle cx="12" cy="10" r="2.4" /></svg>;
    case "building":
      return <svg {...common}><rect x="4" y="3" width="10" height="18" rx="1" /><path d="M14 21V8h6v13" /><line x1="7.5" y1="7" x2="7.5" y2="7.01" /><line x1="10.5" y1="7" x2="10.5" y2="7.01" /><line x1="7.5" y1="11" x2="7.5" y2="11.01" /><line x1="10.5" y1="11" x2="10.5" y2="11.01" /><line x1="7.5" y1="15" x2="7.5" y2="15.01" /><line x1="10.5" y1="15" x2="10.5" y2="15.01" /></svg>;
    case "laptop":
      return <svg {...common}><rect x="4" y="4" width="16" height="10" rx="1.2" /><path d="M2 18h20" /></svg>;
    case "tag":
      return <svg {...common}><path d="M20.4 12.6 12.6 20.4a2 2 0 0 1-2.8 0L3.6 14.2a2 2 0 0 1 0-2.8L11.4 3.6a2 2 0 0 1 1.4-.6H19a2 2 0 0 1 2 2v6.6a2 2 0 0 1-.6 1.4Z" /><circle cx="15.5" cy="8.5" r="1.3" /></svg>;
    case "arrowRight":
      return <svg {...common}><line x1="4" y1="12" x2="19" y2="12" /><path d="m13 6 6 6-6 6" /></svg>;
    case "arrowLeft":
      return <svg {...common}><line x1="20" y1="12" x2="5" y2="12" /><path d="m11 6-6 6 6 6" /></svg>;
    case "chevronRight":
      return <svg {...common}><path d="m9 6 6 6-6 6" /></svg>;
    case "checkCircle":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.5 2.5 4.5-5.5" /></svg>;
    case "xCircle":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><line x1="9.5" y1="9.5" x2="14.5" y2="14.5" /><line x1="14.5" y1="9.5" x2="9.5" y2="14.5" /></svg>;
    case "x":
      return <svg {...common}><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>;
    case "menu":
      return <svg {...common}><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></svg>;
    case "info":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><line x1="12" y1="11" x2="12" y2="16.5" /><line x1="12" y1="7.5" x2="12" y2="7.51" /></svg>;
    case "alertTriangle":
      return <svg {...common}><path d="M10.6 3.9 2.7 18a1.6 1.6 0 0 0 1.4 2.4h15.8a1.6 1.6 0 0 0 1.4-2.4L13.4 3.9a1.6 1.6 0 0 0-2.8 0Z" /><line x1="12" y1="9.5" x2="12" y2="13.5" /><line x1="12" y1="16.7" x2="12" y2="16.71" /></svg>;
    case "spinner":
      return <svg {...common} viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" opacity="0.2" /><path d="M21 12a9 9 0 0 0-9-9" /></svg>;
    case "uploadCloud":
      return <svg {...common}><path d="M7 17.5a4.5 4.5 0 0 1-.6-8.96A5.5 5.5 0 0 1 17.3 8a4 4 0 0 1-.8 7.9" /><path d="M12 12v7" /><path d="m9 15 3-3 3 3" /></svg>;
    case "fileCheck":
      return <svg {...common}><path d="M13 3H7a1.6 1.6 0 0 0-1.6 1.6v14.8A1.6 1.6 0 0 0 7 21h10a1.6 1.6 0 0 0 1.6-1.6V8Z" /><path d="M13 3v5h5" /><path d="m9.5 14 2 2 3.5-3.5" /></svg>;
    case "fileX":
      return <svg {...common}><path d="M13 3H7a1.6 1.6 0 0 0-1.6 1.6v14.8A1.6 1.6 0 0 0 7 21h10a1.6 1.6 0 0 0 1.6-1.6V8Z" /><path d="M13 3v5h5" /><line x1="9.5" y1="12.5" x2="14.5" y2="17.5" /><line x1="14.5" y1="12.5" x2="9.5" y2="17.5" /></svg>;
    case "doc":
      return <svg {...common}><path d="M13 3H7a1.6 1.6 0 0 0-1.6 1.6v14.8A1.6 1.6 0 0 0 7 21h10a1.6 1.6 0 0 0 1.6-1.6V8Z" /><path d="M13 3v5h5" /><line x1="8.5" y1="13" x2="15.5" y2="13" /><line x1="8.5" y1="16.5" x2="13" y2="16.5" /></svg>;
    case "download":
      return <svg {...common}><path d="M12 3v12" /><path d="m7 10.5 5 5 5-5" /><path d="M4 19.5h16" /></svg>;
    case "eye":
      return <svg {...common}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.6" /></svg>;
    case "copy":
      return <svg {...common}><rect x="9" y="9" width="11" height="11" rx="1.3" /><path d="M5 15V5.8A1.8 1.8 0 0 1 6.8 4H16" /></svg>;
    case "users":
      return <svg {...common}><circle cx="9" cy="8.5" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 5.2a3 3 0 0 1 0 5.9" /><path d="M19 20a5.5 5.5 0 0 0-3.4-5.1" /></svg>;
    case "graduationCap":
      return <svg {...common}><path d="m2 9 10-5 10 5-10 5-10-5Z" /><path d="M6 11.3V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-4.7" /><path d="M22 9v6" /></svg>;
    case "heart":
      return <svg {...common}><path d="M12 20.2S3.5 14.9 3.5 9.2A4.7 4.7 0 0 1 12 6.4a4.7 4.7 0 0 1 8.5 2.8c0 5.7-8.5 11-8.5 11Z" /></svg>;
    case "user":
      return <svg {...common}><circle cx="12" cy="8.2" r="3.4" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>;
    case "check":
      return <svg {...common} strokeWidth="2.4"><path d="m5 12.5 4.5 4.5L19 7" /></svg>;
    default:
      return null;
  }
}

/* -------------------------------------------------------------------------
   Illustration héro (placeholder — voir docs/19-prompts-images-maquettes-publiques.md)
   ------------------------------------------------------------------------- */

function HeroIllustration() {
  return (
    <div className="tz-hero-illustration">
      <svg viewBox="0 0 300 220" role="img" aria-hidden="true">
        <rect x="18" y="190" width="264" height="6" rx="3" fill="#c3d5ee" />
        <rect x="42" y="46" width="66" height="146" rx="8" fill="#eaf1fd" />
        <rect x="118" y="76" width="56" height="116" rx="8" fill="#dce8fb" />
        <rect x="188" y="22" width="70" height="170" rx="8" fill="#0050cb" />
        {[0, 1, 2, 3].map((row) => (
          <g key={`a-${row}`}>
            <rect x="55" y={64 + row * 28} width="12" height="12" rx="2" fill="#0050cb" opacity="0.35" />
            <rect x="85" y={64 + row * 28} width="12" height="12" rx="2" fill="#0050cb" opacity="0.35" />
          </g>
        ))}
        {[0, 1, 2].map((row) => (
          <g key={`b-${row}`}>
            <rect x="130" y={94 + row * 27} width="10" height="10" rx="2" fill="#0050cb" opacity="0.3" />
            <rect x="154" y={94 + row * 27} width="10" height="10" rx="2" fill="#0050cb" opacity="0.3" />
          </g>
        ))}
        {[0, 1, 2, 3, 4].map((row) => (
          <g key={`c-${row}`}>
            <rect x="202" y={40 + row * 27} width="12" height="12" rx="2" fill="#ffffff" opacity="0.55" />
            <rect x="232" y={40 + row * 27} width="12" height="12" rx="2" fill="#ffffff" opacity="0.55" />
          </g>
        ))}
        <circle cx="56" cy="204" r="10" fill="#dce8fb" />
        <circle cx="240" cy="204" r="14" fill="#eaf1fd" />
      </svg>
      <p className="tz-hero-caption">Des équipes qui <strong>construisent</strong> demain</p>
    </div>
  );
}

/* -------------------------------------------------------------------------
   En-tête et pied de page
   ------------------------------------------------------------------------- */

function Header({ path = "" }) {
  const [open, setOpen] = useState(false);
  const inPortal = path === PORTAL_BASE || path.startsWith(`${PORTAL_BASE}/`);
  return (
    <header className="tz-header">
      <div className="tz-header-inner">
        <a className="tz-logo" href="/recrutement">TECH<span>ZONE</span></a>
        <nav className="tz-nav" aria-label="Navigation recrutement">
          <a className={`tz-nav-link${inPortal ? "" : " is-active"}`} href="/recrutement">Offres</a>
          <a className={`tz-nav-link${inPortal ? " is-active" : ""}`} href="/candidat">Espace candidat</a>
        </nav>
        <a className="tz-header-rh" href="/admin/recrutement">Espace RH</a>
        <button
          aria-expanded={open}
          aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
          className="tz-header-burger"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          <Icon name={open ? "x" : "menu"} />
        </button>
      </div>
      <div className={`tz-header-mobile-panel ${open ? "is-open" : ""}`}>
        <a className={inPortal ? "" : "is-active"} href="/recrutement">Offres</a>
        <a className={inPortal ? "is-active" : ""} href="/candidat">Espace candidat</a>
        <a href="/admin/recrutement">Espace RH</a>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="tz-footer">
      <div className="tz-footer-inner">
        <ul className="tz-footer-links">
          <li><strong>TechZone</strong></li>
          <li><a href="/candidat">Espace candidat</a></li>
          <li><AppLink to="/recrutement/ressources/cv-ats">Préparer un CV compatible ATS</AppLink></li>
          <li><a href="/confidentialite">Confidentialité</a></li>
          <li><a href="/recrutement/traitement-candidatures">Traitement des candidatures</a></li>
        </ul>
        <p className="tz-footer-copy">© {new Date().getFullYear()} TechZone. Tous droits réservés.</p>
      </div>
    </footer>
  );
}

/* -------------------------------------------------------------------------
   Liste des offres
   ------------------------------------------------------------------------- */

function JobCard({ job }) {
  const tags = (job.criteria || []).slice(0, 3).map((item) => item.label);
  return (
    <article className="tz-job-card">
      {job.urgent ? <div className="tz-badges"><span className="tz-badge tz-badge-urgent">Urgent</span></div> : null}
      <h3>{job.title}</h3>
      <div className="tz-meta-rows">
        <div className="tz-meta-item"><Icon name="building" />{job.employer_type === "partner" ? job.partner_name : "TechZone"}</div>
        <div className="tz-meta-item"><Icon name="mapPin" />{job.location}</div>
        <div className="tz-meta-item"><Icon name="laptop" />{WORK_MODE_LABELS[job.work_mode] || job.work_mode}</div>
        <div className="tz-meta-item"><Icon name="tag" />{CONTRACT_LABELS[job.contract_type] || job.contract_type}</div>
      </div>
      <p className="tz-job-summary">{job.summary}</p>
      {tags.length ? <div className="tz-tags">{tags.map((tag) => <span className="tz-tag" key={tag}>{tag}</span>)}</div> : null}
      <AppLink className="tz-btn tz-btn-primary" to={`/recrutement/${job.slug}`}>Voir l’offre <Icon name="arrowRight" /></AppLink>
    </article>
  );
}

// En dev, l'API (dev:api) démarre presque toujours quelques secondes après
// Vite (dev:web) : un premier échec juste après le chargement de la page est
// donc normal et ne doit pas obliger à cliquer manuellement sur « Réessayer ».
const STARTUP_RETRY_DELAYS_MS = [1500, 3000, 5000];

function JobList({ apiBaseUrl }) {
  const [state, setState] = useState({ loading: true, jobs: [], error: "" });
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [contract, setContract] = useState("");
  const attemptRef = useRef(0);

  const load = useCallback(() => {
    setState((prev) => ({ loading: true, jobs: prev.jobs, error: "" }));
    apiRequest(apiBaseUrl, "/offres")
      .then((data) => {
        attemptRef.current = 0;
        setState({ loading: false, jobs: data.offres, error: "" });
      })
      .catch((error) => {
        const delay = STARTUP_RETRY_DELAYS_MS[attemptRef.current];
        if (delay !== undefined) {
          attemptRef.current += 1;
          setTimeout(load, delay);
          setState((prev) => ({ loading: true, jobs: prev.jobs, error: "" }));
        } else {
          setState({ loading: false, jobs: [], error: error.message });
        }
      });
  }, [apiBaseUrl]);

  useEffect(() => { load(); }, [load]);

  const locations = useMemo(() => [...new Set(state.jobs.map((job) => job.location))].sort(), [state.jobs]);
  const contracts = useMemo(() => [...new Set(state.jobs.map((job) => job.contract_type))], [state.jobs]);
  const filteredJobs = state.jobs.filter((job) => {
    if (location && job.location !== location) return false;
    if (contract && job.contract_type !== contract) return false;
    const query = search.trim().toLowerCase();
    if (query && !`${job.title} ${job.summary}`.toLowerCase().includes(query)) return false;
    return true;
  });

  return (
    <main className="tz-page">
      <section className="tz-hero">
        <div className="tz-container tz-hero-grid">
          <div>
            <p className="tz-eyebrow">Opportunités professionnelles</p>
            <h1>Trouvez une opportunité qui correspond à vos compétences</h1>
            <p>Chaque candidature est étudiée par un responsable RH. Nous valorisons les compétences, la motivation et l’adéquation avec le poste.</p>
            <AppLink className="tz-btn tz-btn-outline" to="/recrutement/ressources/cv-ats">Préparer un CV compatible ATS <Icon name="arrowRight" /></AppLink>
          </div>
          <HeroIllustration />
        </div>
      </section>
      <section className="tz-container tz-section">
        <div className="tz-section-head">
          <h2>Offres en cours ({state.jobs.length})</h2>
        </div>
        <div className="tz-filters">
          <label className="tz-field">
            <Icon name="search" />
            <input aria-label="Rechercher un poste, une compétence" onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un poste, une compétence…" type="search" value={search} />
          </label>
          <label className="tz-field is-select">
            <Icon name="mapPin" />
            <select aria-label="Filtrer par localisation" onChange={(event) => setLocation(event.target.value)} value={location}>
              <option value="">Toutes les localisations</option>
              {locations.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
            </select>
          </label>
          <label className="tz-field is-select">
            <Icon name="tag" />
            <select aria-label="Filtrer par type de contrat" onChange={(event) => setContract(event.target.value)} value={contract}>
              <option value="">Tous les contrats</option>
              {contracts.map((type) => <option key={type} value={type}>{CONTRACT_LABELS[type] || type}</option>)}
            </select>
          </label>
        </div>
        {state.loading ? (
          <div className="tz-state-card" role="status">
            <span className="tz-state-icon"><Icon className="tz-spin" name="spinner" /></span>
            <p>Chargement des offres…</p>
          </div>
        ) : state.error ? (
          <div className="tz-state-card is-error" role="alert">
            <span className="tz-state-icon"><Icon name="xCircle" /></span>
            <p>{state.error}</p>
            <button className="tz-btn tz-btn-outline" onClick={load} type="button">Réessayer</button>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="tz-state-card">
            <span className="tz-state-icon"><Icon name="doc" /></span>
            <p>{state.jobs.length === 0 ? <>Aucune offre publiée pour le moment.<br />Revenez bientôt !</> : "Aucune offre ne correspond à votre recherche."}</p>
          </div>
        ) : (
          <div className="tz-job-grid">
            {filteredJobs.map((job) => <JobCard job={job} key={job.public_id} />)}
          </div>
        )}
      </section>
    </main>
  );
}

/* -------------------------------------------------------------------------
   Détail d'une offre
   ------------------------------------------------------------------------- */

function useJob(apiBaseUrl, slug) {
  const [state, setState] = useState({ loading: true, job: null, error: "" });
  useEffect(() => {
    apiRequest(apiBaseUrl, `/offres/${encodeURIComponent(slug)}`)
      .then((data) => setState({ loading: false, job: data.offre, error: "" }))
      .catch((error) => setState({ loading: false, job: null, error: error.message }));
  }, [apiBaseUrl, slug]);
  return state;
}

function JobDetail({ apiBaseUrl, slug }) {
  const state = useJob(apiBaseUrl, slug);
  const [others, setOthers] = useState([]);

  useEffect(() => {
    apiRequest(apiBaseUrl, "/offres")
      .then((data) => setOthers((data.offres || []).filter((job) => job.slug !== slug).slice(0, 2)))
      .catch(() => setOthers([]));
  }, [apiBaseUrl, slug]);

  if (state.loading) return <main className="tz-container tz-section"><p className="tz-status-text" role="status">Chargement…</p></main>;
  if (!state.job) {
    return (
      <main className="tz-container tz-section">
        <p className="tz-alert" role="alert">{state.error || "Offre introuvable ou clôturée."}</p>
        <AppLink className="tz-btn tz-btn-outline" to="/recrutement">Voir les offres en cours</AppLink>
      </main>
    );
  }

  const job = state.job;
  const missions = (job.description || "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const niceToHave = job.criteria.filter((item) => !item.required);
  const objective = job.criteria.filter((item) => item.required);
  const profile = niceToHave.length ? niceToHave : job.criteria;
  const checklist = objective.length ? objective : job.criteria;

  return (
    <main className="tz-page">
      <section className="tz-container tz-section">
        <AppLink className="tz-link tz-detail-back" to="/recrutement"><Icon name="arrowLeft" /> Toutes les offres</AppLink>
        <div className="tz-detail-title-row">
          <h1>{job.title}</h1>
          {job.urgent ? <span className="tz-badge tz-badge-urgent">Urgent</span> : null}
        </div>
        <ul className="tz-detail-meta">
          <li><Icon name="building" />{job.employer_type === "partner" ? job.partner_name : "TechZone"}</li>
          <li><Icon name="mapPin" />{job.location}</li>
          <li><Icon name="laptop" />{WORK_MODE_LABELS[job.work_mode] || job.work_mode}</li>
          <li><Icon name="tag" />{CONTRACT_LABELS[job.contract_type] || job.contract_type}</li>
        </ul>
        <div className="tz-detail-layout">
          <div>
            <div className="tz-card"><h2>Résumé du poste</h2><p>{job.summary}</p></div>
            <div className="tz-card">
              <h2>Vos missions</h2>
              <ul className="tz-list-dot">{missions.map((mission) => <li key={mission}>{mission}</li>)}</ul>
            </div>
            <div className="tz-card">
              <h2>Profil recherché</h2>
              <ul className="tz-list-dot">{profile.map((item) => <li key={item.label}>{item.label}</li>)}</ul>
            </div>
            <div className="tz-card">
              <h2>Critères objectifs</h2>
              <ul className="tz-list-check">{checklist.map((item) => <li key={item.label}><Icon name="checkCircle" />{item.label}</li>)}</ul>
            </div>
            <div className="tz-card">
              <h2>Conditions et avantages</h2>
              <div className="tz-perks">
                <div className="tz-perk"><Icon name="users" /><span>Environnement stimulant</span></div>
                <div className="tz-perk"><Icon name="graduationCap" /><span>Formation continue</span></div>
                <div className="tz-perk"><Icon name="heart" /><span>Équilibre vie pro / vie perso</span></div>
              </div>
            </div>
          </div>
          <aside>
            <div className="tz-card tz-apply-card">
              <h2>Postuler à cette offre</h2>
              <p>Rejoignez TechZone et contribuez à des projets qui ont du sens.</p>
              <ul>
                <li><Icon name="tag" />{CONTRACT_LABELS[job.contract_type] || job.contract_type}</li>
                <li><Icon name="mapPin" />{job.location}</li>
                <li><Icon name="laptop" />{WORK_MODE_LABELS[job.work_mode] || job.work_mode}</li>
              </ul>
              <AppLink className="tz-btn tz-btn-primary tz-btn-block" to={`/recrutement/${job.slug}/postuler`}>Postuler <Icon name="arrowRight" /></AppLink>
              <div className="tz-info-box">
                <Icon name="info" />
                <span>Votre candidature sera examinée par un responsable RH. Une IA peut assister l’analyse des éléments fournis, sans prendre de décision.</span>
              </div>
            </div>
            {others.length ? (
              <div className="tz-card">
                <h2>Autres offres en cours</h2>
                <div className="tz-other-jobs">
                  {others.map((other) => (
                    <AppLink className="tz-other-job" key={other.public_id} to={`/recrutement/${other.slug}`}>
                      <span className="tz-other-job-icon"><Icon name="user" /></span>
                      <span>
                        <strong>{other.title}</strong>
                        <span>{(other.employer_type === "partner" ? other.partner_name : "TechZone")} · {other.location}</span>
                      </span>
                      <Icon className="tz-chevron" name="chevronRight" />
                    </AppLink>
                  ))}
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      </section>
    </main>
  );
}

/* -------------------------------------------------------------------------
   Formulaire de candidature
   ------------------------------------------------------------------------- */

function FileField({ error, file, hint, label, name, onChange, required }) {
  return (
    <div className={`tz-form-field${error ? " has-error" : ""}`}>
      <label htmlFor={name}>{label}{required ? <span className="tz-required"> *</span> : null}{hint ? ` ${hint}` : ""}</label>
      {file ? (
        <div className={`tz-file-chip${error ? " is-rejected" : ""}`}>
          <Icon name={error ? "fileX" : "fileCheck"} />
          <div><strong>{file.name}</strong><span>{error || formatFileSize(file.size)}</span></div>
          <button aria-label={`Retirer le fichier ${file.name}`} className="tz-file-remove" onClick={() => onChange(null)} type="button">
            <Icon name="x" />
          </button>
        </div>
      ) : (
        <div className="tz-dropzone">
          <Icon name="uploadCloud" />
          <span>Déposer un fichier ici<br />ou cliquer pour sélectionner</span>
          <input accept=".pdf,.docx" id={name} name={name} onChange={(event) => onChange(event.target.files[0] || null)} type="file" />
        </div>
      )}
      {error && !file ? <p className="tz-field-error">{error}</p> : null}
    </div>
  );
}

function ApplyAside({ account }) {
  return (
    <aside className="tz-card tp-aside">
      <h2>Avant d’envoyer</h2>
      {account ? <p className="tp-notice is-ok">Connecté en tant que {account.full_name}. Votre profil est pré-rempli et la candidature sera rattachée à votre espace.</p> : <p>Créez un <a href="/candidat">compte candidat</a> pour suivre l’avancement de vos candidatures et recevoir vos convocations.</p>}
      <ul>
        <li>CV au format PDF ou DOCX (10 Mo maximum), sans macro.</li>
        <li>Une IA aide l’équipe RH à lire votre dossier : elle ne décide jamais.</li>
        <li>Vos documents sont stockés chiffrés et accessibles aux seuls recruteurs habilités.</li>
        <li>Vous pouvez retirer votre candidature ou supprimer vos données à tout moment depuis votre espace.</li>
      </ul>
    </aside>
  );
}

function ApplicationForm({ apiBaseUrl, search = "", slug, turnstileSiteKey }) {
  const state = useJob(apiBaseUrl, slug);
  const { account, loading: accountLoading } = useCandidateAccount(apiBaseUrl);
  const needsCaptcha = Boolean(turnstileSiteKey) && !account && !accountLoading;
  const [formState, setFormState] = useState({ sending: false, error: "" });
  const [fieldErrors, setFieldErrors] = useState({});
  const [cvFile, setCvFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileExpired, setTurnstileExpired] = useState(false);
  const turnstileRef = useRef(null);
  const fullNameRef = useRef(null);
  const emailRef = useRef(null);
  const phoneRef = useRef(null);
  const consentRef = useRef(null);

  useEffect(() => {
    if (!account) return;
    if (fullNameRef.current && !fullNameRef.current.value) fullNameRef.current.value = account.full_name || "";
    if (emailRef.current) emailRef.current.value = account.email || "";
    if (phoneRef.current && !phoneRef.current.value) phoneRef.current.value = account.phone || "";
  }, [account, state.job]);

  useEffect(() => {
    if (!needsCaptcha || !turnstileRef.current) return undefined;
    let cancelled = false;
    let widgetId;
    loadTurnstile()
      .then((turnstile) => {
        if (!cancelled && turnstile) {
          widgetId = turnstile.render(turnstileRef.current, {
            sitekey: turnstileSiteKey,
            callback: (token) => { setTurnstileToken(token); setTurnstileExpired(false); },
            "expired-callback": () => { setTurnstileToken(""); setTurnstileExpired(true); },
            "error-callback": () => setTurnstileToken("")
          });
        }
      })
      .catch((error) => !cancelled && setFormState({ sending: false, error: error.message }));
    return () => {
      cancelled = true;
      if (widgetId !== undefined && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [needsCaptcha, turnstileSiteKey]);

  function handleCvChange(file) {
    setCvFile(file);
    setFieldErrors((prev) => ({ ...prev, cv: file ? validateDocument(file) : "" }));
  }

  function handleCoverChange(file) {
    setCoverFile(file);
    setFieldErrors((prev) => ({ ...prev, cover_letter: file ? validateDocument(file) : "" }));
  }

  async function submit(event) {
    event.preventDefault();
    const errors = {};
    if (!fullNameRef.current.value.trim()) errors.full_name = "Ce champ est obligatoire.";
    if (!emailRef.current.value.trim()) errors.email = "Ce champ est obligatoire.";
    else if (!/^\S+@\S+\.\S+$/.test(emailRef.current.value.trim())) errors.email = "Adresse e-mail invalide.";
    if (!phoneRef.current.value.trim()) errors.phone = "Un numéro est nécessaire pour vous convoquer à un entretien.";
    if (!cvFile) errors.cv = "Ce champ est obligatoire.";
    else {
      const cvError = validateDocument(cvFile);
      if (cvError) errors.cv = cvError;
    }
    if (coverFile) {
      const coverError = validateDocument(coverFile);
      if (coverError) errors.cover_letter = coverError;
    }
    if (!consentRef.current.checked) errors.consent = "Votre consentement est requis.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setFormState({ sending: true, error: "" });
    const formData = new FormData();
    formData.append("full_name", fullNameRef.current.value.trim());
    formData.append("email", emailRef.current.value.trim());
    formData.append("phone", phoneRef.current.value.trim());
    formData.append("consent", "true");
    formData.append("cv", cvFile);
    if (coverFile) formData.append("cover_letter", coverFile);
    if (!account) formData.append("turnstile_token", turnstileToken || (turnstileSiteKey ? "" : "local-demo"));
    if (account?.candidate_location) formData.append("candidate_location", account.candidate_location);
    try {
      const result = await apiRequest(apiBaseUrl, `/offres/${state.job.public_id}/candidatures`, { method: "POST", body: formData });
      navigateBrowser(`/recrutement/${slug}/postuler?success=${encodeURIComponent(result.application_id)}${account ? "&compte=1" : ""}`);
      setFormState({ sending: false, error: "" });
    } catch (error) {
      setFormState({ sending: false, error: error.message });
    }
  }

  const successId = new URLSearchParams(search).get("success");
  if (successId) return <ApplicationSuccess reference={successId} hasAccount={new URLSearchParams(search).get("compte") === "1"} />;
  if (state.loading) return <main className="tz-container tz-section"><p className="tz-status-text" role="status">Chargement…</p></main>;
  if (!state.job) {
    return (
      <main className="tz-container tz-section">
        <p className="tz-alert" role="alert">Offre introuvable ou clôturée.</p>
        <AppLink className="tz-btn tz-btn-outline" to="/recrutement">Voir les offres en cours</AppLink>
      </main>
    );
  }

  return (
    <main className="tz-page">
      <section className="tz-container tz-section">
        <AppLink className="tz-link tz-detail-back" to={`/recrutement/${slug}`}><Icon name="arrowLeft" /> Retour à l’offre</AppLink>
        <h1>Postuler à l’offre {state.job.title}</h1>
        <div className="tz-steps">
          <span className={`tz-step${formState.sending ? "" : " is-active"}`}><span className="tz-step-index">1</span>Vos informations</span>
          <span className={`tz-step${formState.sending ? " is-active" : ""}`}><span className="tz-step-index">2</span>Envoi du dossier</span>
        </div>
        <div className="tz-form-layout">
          <form className="tz-form-card" noValidate onSubmit={submit}>
            <div>
              <h2>Vos informations</h2>
              <div className="tz-field-grid">
                <div className={`tz-form-field${fieldErrors.full_name ? " has-error" : ""}`}>
                  <label htmlFor="full_name">Nom complet <span className="tz-required">*</span></label>
                  <input
                    id="full_name" maxLength="160" name="full_name"
                    onChange={() => setFieldErrors((prev) => ({ ...prev, full_name: "" }))}
                    placeholder="Votre nom complet" ref={fullNameRef} type="text"
                  />
                  {fieldErrors.full_name ? <p className="tz-field-error">{fieldErrors.full_name}</p> : null}
                </div>
                <div className={`tz-form-field${fieldErrors.email ? " has-error" : ""}`}>
                  <label htmlFor="email">Adresse e-mail <span className="tz-required">*</span></label>
                  <input
                    id="email" name="email"
                    onChange={() => setFieldErrors((prev) => ({ ...prev, email: "" }))}
                    placeholder="votre@email.com" readOnly={Boolean(account)} ref={emailRef} type="email"
                  />
                  {fieldErrors.email ? <p className="tz-field-error">{fieldErrors.email}</p> : null}
                </div>
                <div className="tz-form-field">
                  <label htmlFor="phone">Téléphone <span className="tz-required">*</span></label>
                  <input id="phone" maxLength="50" name="phone" placeholder="+261 34 12 345 67" ref={phoneRef} required type="tel" />
                  {fieldErrors.phone ? <p className="tz-field-error">{fieldErrors.phone}</p> : null}
                </div>
              </div>
            </div>
            <div>
              <h2>Votre dossier</h2>
              <div className="tz-dropzone-grid">
                <FileField error={fieldErrors.cv} file={cvFile} hint="(PDF ou DOCX, max 10 Mo)" label="CV" name="cv" onChange={handleCvChange} required />
                <FileField error={fieldErrors.cover_letter} file={coverFile} hint="(facultatif)" label="Lettre de motivation" name="cover_letter" onChange={handleCoverChange} />
              </div>
            </div>
            <div>
              <label className="tz-consent">
                <input name="consent" onChange={() => setFieldErrors((prev) => ({ ...prev, consent: "" }))} ref={consentRef} type="checkbox" value="true" />
                <span>
                  J’accepte le traitement de mes données personnelles <span className="tz-required">*</span>
                  <br />
                  J’autorise TechZone et, le cas échéant, son partenaire, à traiter mon dossier de candidature. Une IA peut assister l’analyse des éléments fournis, sans prendre de décision automatique. Mes données sont conservées pendant six mois après la clôture de l’offre et peuvent être transférées à OpenAI dans le cadre de cette analyse. <a href="/recrutement/ressources/cv-ats">En savoir plus</a>
                </span>
              </label>
              {fieldErrors.consent ? <p className="tz-field-error">{fieldErrors.consent}</p> : null}
            </div>
            <div>
              <h2>{account ? "Envoi" : "Vérification de sécurité"}</h2>
              <div className="tz-submit-row">
                <div className="tz-turnstile-box">
                  <div><Icon name="checkCircle" /> {account ? "Session candidat vérifiée" : "Je ne suis pas un robot"}</div>
                  {needsCaptcha ? <div aria-label="Vérification anti-robot" ref={turnstileRef} /> : null}
                  {account ? null : <span className="tz-turnstile-brand">Cloudflare<br />Turnstile</span>}
                </div>
                <button className="tz-btn tz-btn-primary" disabled={formState.sending || accountLoading || Boolean(needsCaptcha && !turnstileToken)} type="submit">
                  {formState.sending ? "Envoi…" : "Envoyer ma candidature"} <Icon name="arrowRight" />
                </button>
              </div>
              {turnstileExpired ? <p className="tz-field-error" role="alert">La vérification anti-robot a expiré. Veuillez recommencer.</p> : null}
              {formState.error ? <p className="tz-alert" role="alert">{formState.error}</p> : null}
            </div>
          </form>
          <ApplyAside account={account} />
        </div>
      </section>
    </main>
  );
}

/* -------------------------------------------------------------------------
   Succès de candidature + ressource CV ATS
   ------------------------------------------------------------------------- */

export const ATS_PROMPT = `Tu es un rédacteur de CV spécialisé dans la lisibilité ATS. Transforme le CV fourni en une version simple à une colonne, sans tableau, icône, jauge, colonne latérale ni information inventée. Conserve strictement les faits, dates, compétences et résultats vérifiables. Utilise les sections: Titre professionnel, Résumé, Compétences, Expériences, Formation, Certifications et Langues. Adapte les mots-clés uniquement à partir de l'offre collée ci-dessous. Signale toute information manquante au lieu de l'inventer. Retourne d'abord le CV, puis une courte liste des changements effectués.\n\nOFFRE:\n[COLLER L'OFFRE]\n\nCV ACTUEL:\n[COLLER LE CV]`;

function ResourceCard() {
  const [copied, setCopied] = useState(false);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(ATS_PROMPT);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="tz-resource-card">
      <h2>Ressource : CV compatible ATS</h2>
      <div className="tz-resource-head">
        <span className="tz-resource-icon"><Icon name="doc" /></span>
        <div>
          <h3>CV compatible ATS</h3>
          <p>Un CV compatible ATS est un CV rédigé de manière simple et structurée, afin d’être facilement lu par les logiciels de recrutement. Il met en avant vos compétences et votre expérience de façon claire, sans mise en forme complexe.</p>
        </div>
      </div>
      <div className="tz-resource-actions">
        <a className="tz-btn tz-btn-primary" download href="/resources/modele-cv-ats-techzone.docx"><Icon name="download" /> Télécharger le modèle DOCX</a>
        <a className="tz-btn tz-btn-outline" href="/resources/modele-cv-ats-techzone.pdf" rel="noreferrer" target="_blank"><Icon name="eye" /> Aperçu PDF</a>
        <button className="tz-btn tz-btn-outline" onClick={copyPrompt} type="button"><Icon name="copy" /> Copier le prompt</button>
      </div>
      {copied ? (
        <div className="tz-copy-confirm">
          <Icon name="checkCircle" />
          <div><strong>Prompt copié !</strong><br />Le prompt a été copié dans votre presse-papiers.</div>
        </div>
      ) : null}
      <div className="tz-warning-box">
        <Icon name="alertTriangle" />
        <span>N’ajoutez aucune expérience ou compétence inexistante. Vérifiez toujours le résultat avant de l’utiliser.</span>
      </div>
    </div>
  );
}

function ApplicationSuccess({ reference, hasAccount = false }) {
  return (
    <main className="tz-page">
      <section className="tz-container tz-section">
        <div className="tz-success-grid">
          <div className="tz-card tz-success-card">
            <span className="tz-success-icon"><Icon name="check" /></span>
            <h1>Candidature envoyée</h1>
            <p>Votre dossier a bien été reçu.</p>
            <div className="tz-reference-box">
              <span>Référence de dépôt</span>
              <strong>{formatReference(reference)}</strong>
            </div>
            <p className="tz-success-note">Votre candidature sera examinée par un responsable RH. Une IA peut assister l’analyse des éléments fournis, sans prendre de décision. Nous vous remercions pour votre intérêt.</p>
            <div className="tp-actions">
              {hasAccount ? <a className="tz-btn tz-btn-primary" href="/candidat/candidatures">Suivre ma candidature <Icon name="arrowRight" /></a> : <a className="tz-btn tz-btn-primary" href="/candidat">Créer mon espace candidat <Icon name="arrowRight" /></a>}
              <AppLink className="tz-btn tz-btn-outline" to="/recrutement">Voir les offres en cours</AppLink>
            </div>
          </div>
          <div className="tz-card">
            <h2>Et maintenant ?</h2>
            <ol className="tz-next-steps">
              <li><span className="tz-next-step-index">1</span><p>Notre équipe RH va étudier votre dossier avec attention.</p></li>
              <li><span className="tz-next-step-index">2</span><p>Nous vous recontacterons si votre profil correspond aux besoins du poste.</p></li>
              <li><span className="tz-next-step-index">3</span><p>En attendant, n’hésitez pas à consulter nos autres offres.</p></li>
            </ol>
          </div>
        </div>
        <div className="tz-card">
          <ResourceCard />
        </div>
      </section>
    </main>
  );
}

function AtsResources() {
  return (
    <main className="tz-page">
      <section className="tz-container tz-section tz-resource-page">
        <p className="tz-eyebrow">Ressource candidat</p>
        <h1>CV compatible ATS</h1>
        <p>« ATS » n’est pas un format de fichier. Il décrit un CV structuré pour être lu correctement par les logiciels de recrutement.</p>
        <div className="tz-card"><ResourceCard /></div>
        <h2 className="tz-resource-prompt-title">Prompt de conversion</h2>
        <pre>{ATS_PROMPT}</pre>
      </section>
    </main>
  );
}

/* -------------------------------------------------------------------------
   Routeur public
   ------------------------------------------------------------------------- */

export function RecruitmentPublicRoutes({ apiBaseUrl = "/api/recrutement", turnstileSiteKey = "" }) {
  const location = useBrowserLocation();
  const path = location.pathname.replace(/\/$/, "") || "/";
  let content;
  if (path === PORTAL_BASE || path.startsWith(`${PORTAL_BASE}/`)) {
    content = <CandidatePortal apiBaseUrl={apiBaseUrl} pathname={path} search={location.search} />;
  } else if (path === "/recrutement") {
    content = <JobList apiBaseUrl={apiBaseUrl} />;
  } else if (path === "/recrutement/ressources/cv-ats") {
    content = <AtsResources />;
  } else {
    const applicationMatch = path.match(/^\/recrutement\/([^/]+)\/postuler$/);
    const detailMatch = path.match(/^\/recrutement\/([^/]+)$/);
    if (applicationMatch) {
      content = <ApplicationForm apiBaseUrl={apiBaseUrl} search={location.search} slug={decodeURIComponent(applicationMatch[1])} turnstileSiteKey={turnstileSiteKey} />;
    } else if (detailMatch) {
      content = <JobDetail apiBaseUrl={apiBaseUrl} slug={decodeURIComponent(detailMatch[1])} />;
    } else {
      content = (
        <main className="tz-container tz-section">
          <p>Page de recrutement introuvable.</p>
          <AppLink className="tz-btn tz-btn-outline" to="/recrutement">Voir les offres</AppLink>
        </main>
      );
    }
  }
  return (
    <div className="tz-app">
      <Header path={path} />
      <div className="tz-app-body">{content}</div>
      <Footer />
    </div>
  );
}

export { ApplicationForm, AtsResources, CandidatePortal, JobDetail, JobList };
