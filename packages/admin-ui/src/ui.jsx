import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { apiRequest, CATEGORY_LABELS, finalTone, fmtScore, initials, PIPELINE_LABELS, SCORE_MAX, PIPELINE_TONES, RECOMMENDATION_LABELS, RECOMMENDATION_TONES, friendlyError } from "./lib";

/* ------------------------------------------------------------------ contexte */
export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

/** Charge une route GET. `path` null = ne rien charger. `version` force le rechargement. */
export function useApi(path, version = 0) {
  const { api } = useApp();
  const [state, setState] = useState({ data: null, error: "", loading: Boolean(path) });
  useEffect(() => {
    if (!path) { setState({ data: null, error: "", loading: false }); return undefined; }
    let alive = true;
    setState((current) => ({ ...current, loading: true, error: "" }));
    apiRequest(api, path)
      .then((data) => { if (alive) setState({ data, error: "", loading: false }); })
      .catch((error) => { if (alive) setState({ data: null, error: friendlyError(error), loading: false }); });
    return () => { alive = false; };
  }, [api, path, version]);
  return state;
}

/* ------------------------------------------------------------------- icônes */
const ICONS = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  offers: <><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M2 13h20" /></>,
  candidates: <><circle cx="9" cy="8" r="4" /><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1M17 4a4 4 0 0 1 0 7M22 21v-1a5 5 0 0 0-3-4.6" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  pipeline: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 7v7M12 7v3M16 7v10" /></>,
  matching: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 17v4M17 19h4" /></>,
  interviews: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  reports: <><path d="M4 20V10M10 20V4M16 20v-8M22 20H2" /></>,
  team: <><circle cx="10" cy="8" r="4" /><path d="M2 21v-1a6 6 0 0 1 6-6h4" /><circle cx="18" cy="18" r="3" /></>,
  journal: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  settings: <><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  download: <><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></>,
  upload: <><path d="M12 15V3M7 8l5-5 5 5M4 21h16" /></>,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  check: <path d="m5 12 5 5 9-10" />,
  alert: <><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></>,
  sparkles: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 17v4M17 19h4" /></>,
  mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  trash: <><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  external: <><path d="M15 3h6v6M10 14 21 3M18 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" /></>,
  chevron: <path d="m9 6 6 6-6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></>,
  filter: <path d="M3 5h18l-7 8v6l-4 2v-8z" />,
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  file: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v5h1" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></>,
  refresh: <><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></>,
  note: <><path d="M4 4h16v12l-4 4H4z" /><path d="M16 20v-4h4M8 9h8M8 13h4" /></>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  shield: <><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  map: <><path d="M12 22s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></>,
  link: <><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></>
};

export function Icon({ name, size = 18, className = "" }) {
  return <svg aria-hidden="true" className={`rh-icon ${className}`} fill="none" focusable="false" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width={size}>{ICONS[name] || ICONS.info}</svg>;
}

/* ------------------------------------------------------- toasts + confirmation */
export function useOverlays() {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const counter = useRef(0);
  const toast = useCallback((message, tone = "info") => {
    const id = ++counter.current;
    setToasts((current) => [...current.slice(-3), { id, message, tone }]);
    setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), tone === "error" ? 7000 : 3800);
  }, []);
  const confirm = useCallback((options) => new Promise((resolve) => setDialog({ ...options, resolve })), []);
  const settle = (value) => { dialog?.resolve(value); setDialog(null); };
  const host = <>
    <div aria-live="polite" className="rh-toasts" role="status">{toasts.map((item) => <div className={`rh-toast is-${item.tone}`} key={item.id}><Icon name={item.tone === "error" ? "alert" : item.tone === "success" ? "check" : "info"} size={16} /><span>{item.message}</span></div>)}</div>
    {dialog ? <ConfirmDialog {...dialog} onCancel={() => settle(false)} onConfirm={() => settle(true)} /> : null}
  </>;
  return { toast, confirm, host };
}

function ConfirmDialog({ title, message, confirmLabel = "Confirmer", tone = "primary", onCancel, onConfirm }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (event) => { if (event.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return <div className="rh-scrim is-center" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <div aria-describedby="rh-confirm-msg" aria-labelledby="rh-confirm-title" aria-modal="true" className="rh-dialog" role="alertdialog">
      <h3 id="rh-confirm-title">{title}</h3>
      <p id="rh-confirm-msg">{message}</p>
      <div className="rh-dialog-actions"><button className="rh-btn" onClick={onCancel} type="button">Annuler</button><button className={`rh-btn ${tone === "danger" ? "is-danger" : "is-primary"}`} onClick={onConfirm} ref={ref} type="button">{confirmLabel}</button></div>
    </div>
  </div>;
}

/* -------------------------------------------------------------- éléments simples */
export function Badge({ tone = "slate", children, dot = false }) {
  return <span className={`rh-badge is-${tone}`}>{dot ? <i aria-hidden="true" /> : null}{children}</span>;
}
export const StageBadge = ({ status }) => <Badge dot tone={PIPELINE_TONES[status] || "slate"}>{PIPELINE_LABELS[status] || "Nouvelle"}</Badge>;
export function Avatar({ name, size = 36, tone }) {
  const hue = [...String(name || "")].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 6;
  return <span aria-hidden="true" className={`rh-avatar is-h${tone ?? hue}`} style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials(name)}</span>;
}
export const Loading = ({ label = "Chargement…" }) => <div className="rh-loading" role="status"><span className="rh-spinner" aria-hidden="true" />{label}</div>;
export const ErrorNote = ({ children }) => children ? <p className="rh-alert is-error" role="alert"><Icon name="alert" size={16} />{children}</p> : null;
export function Empty({ icon = "info", title, children, action }) {
  return <div className="rh-empty"><span className="rh-empty-icon"><Icon name={icon} size={22} /></span><strong>{title}</strong>{children ? <p>{children}</p> : null}{action}</div>;
}
export function PageHeader({ title, subtitle, actions }) {
  return <header className="rh-page-head"><div><h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}</div>{actions ? <div className="rh-page-actions">{actions}</div> : null}</header>;
}
export function Panel({ title, subtitle, actions, children, className = "", ai = false }) {
  return <section className={`rh-panel${ai ? " is-ai" : ""} ${className}`}>{title || actions ? <div className="rh-panel-head"><div>{title ? <h3>{ai ? <Icon name="sparkles" size={16} /> : null}{title}</h3> : null}{subtitle ? <p>{subtitle}</p> : null}</div>{actions}</div> : null}{children}</section>;
}
export function Tabs({ tabs, value, onChange, label }) {
  return <div aria-label={label} className="rh-tabs" role="tablist">{tabs.map(([id, text, count]) => <button aria-selected={value === id} className={value === id ? "is-active" : ""} key={id} onClick={() => onChange(id)} role="tab" type="button">{text}{count != null ? <span className="rh-tab-count">{count}</span> : null}</button>)}</div>;
}
export function Field({ label, hint, children, className = "" }) {
  return <label className={`rh-field ${className}`}><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}</label>;
}
export function Toggle({ checked, onChange, label, hint, disabled }) {
  return <label className="rh-toggle"><input checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} role="switch" type="checkbox" /><i aria-hidden="true" /><span><strong>{label}</strong>{hint ? <small>{hint}</small> : null}</span></label>;
}

/** Tiroir latéral (fiche candidat, formulaires). Échap ferme. */
export function Drawer({ title, subtitle, onClose, wide = false, children, footer }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.focus();
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("rh-noscroll");
    return () => { window.removeEventListener("keydown", onKey); document.body.classList.remove("rh-noscroll"); previous?.focus?.(); };
  }, [onClose]);
  return <div className="rh-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside aria-label={title} aria-modal="true" className={`rh-drawer${wide ? " is-wide" : ""}`} ref={ref} role="dialog" tabIndex={-1}>
      <div className="rh-drawer-head"><div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div><button aria-label="Fermer" className="rh-icon-btn" onClick={onClose} type="button"><Icon name="close" /></button></div>
      <div className="rh-drawer-body">{children}</div>
      {footer ? <div className="rh-drawer-foot">{footer}</div> : null}
    </aside>
  </div>;
}

/* ------------------------------------------------------------- éditeur riche */
export function RichEditor({ value, onChange }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value; }, [value]);
  function command(name) { document.execCommand(name); onChange(ref.current.innerHTML); }
  return <div className="rh-rich"><div aria-label="Mise en forme" className="rh-toolbar"><button onClick={() => command("bold")} type="button"><strong>G</strong></button><button onClick={() => command("italic")} type="button"><em>I</em></button><button onClick={() => command("insertUnorderedList")} type="button">• Liste</button><button onClick={() => command("insertOrderedList")} type="button">1. Liste</button></div><div className="rh-contenteditable" contentEditable onInput={(event) => onChange(event.currentTarget.innerHTML)} ref={ref} role="textbox" suppressContentEditableWarning tabIndex={0} /></div>;
}

/* ------------------------------------------------------ score explicable (IA) */
const round1 = (n) => Number(Number(n).toFixed(1));

export function ScoreRing({ value, size = 128, label = "/100" }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return <div className="rh-ring" style={{ width: size, height: size }}>
    <svg aria-hidden="true" viewBox="0 0 128 128"><circle className="rh-ring-track" cx="64" cy="64" fill="none" r={radius} strokeWidth="11" /><circle className="rh-ring-value" cx="64" cy="64" fill="none" r={radius} strokeDasharray={`${(pct / 100) * circumference} ${circumference}`} strokeLinecap="round" strokeWidth="11" transform="rotate(-90 64 64)" /></svg>
    <div className="rh-ring-text"><strong>{Math.round(pct)}</strong><small>{label}</small></div>
  </div>;
}

export function ScorePanel({ analysis }) {
  const score = analysis?.score;
  if (!score) return null;
  const criteria = analysis.criteria || [];
  const matched = criteria.filter((item) => item.assessment === "supported");
  const missing = criteria.filter((item) => item.assessment === "not_found");
  const uncertain = criteria.filter((item) => item.assessment === "uncertain");
  return <div className="rh-score">
    <div className="rh-score-head">
      <ScoreRing value={score.total} />
      <div className="rh-score-meta">
        <Badge tone={RECOMMENDATION_TONES[analysis.recommendation] || "amber"}>{RECOMMENDATION_LABELS[analysis.recommendation] || "À vérifier"}</Badge>
        <p>Indicateur d'aide à la lecture du dossier. Validation humaine requise avant toute décision.</p>
        {analysis.profile ? <p className="rh-muted">Expérience détectée : {analysis.profile.experience_years ?? "non précisée"} an(s) · Niveau : {analysis.profile.highest_education_level || "non précisé"}</p> : null}
      </div>
    </div>
    <ul className="rh-score-bars">{(score.components || []).map((component) => <li key={component.category}><span>{CATEGORY_LABELS[component.category] || component.category}</span><div className="rh-track"><span style={{ width: `${component.max ? Math.min(100, (component.points / component.max) * 100) : 0}%` }} /></div><b>{round1(component.points)}/{round1(component.max)}</b></li>)}</ul>
    <div className="rh-two">
      <div className="rh-match is-ok"><h4>Points correspondants</h4><ul>{matched.length ? matched.map((item) => <li key={item.criterion}>✓ {item.criterion}</li>) : <li className="rh-muted">Aucun.</li>}</ul></div>
      <div className="rh-match is-gap"><h4>Points manquants ou à confirmer</h4><ul>{missing.map((item) => <li key={item.criterion}>✗ {item.criterion}</li>)}{uncertain.map((item) => <li key={item.criterion}>⚠ {item.criterion} (à confirmer)</li>)}{!missing.length && !uncertain.length ? <li className="rh-muted">Aucun.</li> : null}</ul></div>
    </div>
    <p className="rh-fineprint">{score.disclaimer || "Indicateur d'aide, pas une mesure de la valeur d'un candidat."}</p>
  </div>;
}

/** Ventilation du score final : IA /100 + entretien /50 + note RH /20 = /170. */
export function ScoreBreakdown({ candidate, compact = false }) {
  const parts = [["Analyse IA", candidate.match_score, SCORE_MAX.ia], ["Entretien", candidate.interview_score, SCORE_MAX.entretien], ["Note RH", candidate.hr_score, SCORE_MAX.rh]];
  const complete = candidate.match_score != null && candidate.interview_score != null && candidate.hr_score != null;
  return <div className={`rh-breakdown${compact ? " is-compact" : ""}`}>
    <div className="rh-breakdown-final"><span>Score final</span><b>{fmtScore(candidate.final_score)}<small>/{SCORE_MAX.final}</small></b><Badge tone={complete ? finalTone(candidate.final_score) : "amber"}>{complete ? "Complet" : "Provisoire"}</Badge></div>
    <ul>{parts.map(([label, value, max]) => <li key={label}><span>{label}</span><div className="rh-track"><span style={{ width: `${value == null ? 0 : Math.min(100, (value / max) * 100)}%` }} /></div><b>{value == null ? "—" : `${fmtScore(value)}/${max}`}</b></li>)}</ul>
  </div>;
}

/* ----------------------------------------------------------------- graphiques */
export function BarChart({ data, height = 190, ariaLabel }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const width = Math.max(320, data.length * 46);
  const pad = { top: 14, bottom: 26 };
  const inner = height - pad.top - pad.bottom;
  const step = width / Math.max(1, data.length);
  return <div className="rh-chart"><svg aria-label={ariaLabel} preserveAspectRatio="xMidYMid meet" role="img" viewBox={`0 0 ${width} ${height}`}>
    {[0, 0.5, 1].map((t) => <line className="rh-grid" key={t} x1="0" x2={width} y1={pad.top + inner * (1 - t)} y2={pad.top + inner * (1 - t)} />)}
    {data.map((d, i) => { const h = Math.max(d.value ? 4 : 1, (d.value / max) * inner); const x = i * step + step * 0.22; const w = step * 0.56; return <g key={d.label}><rect className="rh-bar" height={h} rx="4" width={w} x={x} y={pad.top + inner - h}><title>{`${d.label} : ${d.value}`}</title></rect>{d.value ? <text className="rh-bar-value" textAnchor="middle" x={x + w / 2} y={pad.top + inner - h - 4}>{d.value}</text> : null}<text className="rh-axis" textAnchor="middle" x={x + w / 2} y={height - 8}>{d.label}</text></g>; })}
  </svg></div>;
}

const DONUT_COLORS = ["#2563EB", "#7C3AED", "#0EA5E9", "#F59E0B", "#10B981", "#64748B", "#EF4444", "#14B8A6", "#A855F7"];
export function Donut({ data, centerLabel = "Total" }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = 54; const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return <div className="rh-donut-wrap">
    <div className="rh-donut"><svg aria-hidden="true" viewBox="0 0 140 140"><circle className="rh-ring-track" cx="70" cy="70" fill="none" r={radius} strokeWidth="18" />
      {total ? data.map((d, i) => { const length = (d.value / total) * circumference; const el = <circle cx="70" cy="70" fill="none" key={d.label} r={radius} stroke={DONUT_COLORS[i % DONUT_COLORS.length]} strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} strokeWidth="18" transform="rotate(-90 70 70)"><title>{`${d.label} : ${d.value}`}</title></circle>; offset += length; return el; }) : null}
    </svg><div className="rh-ring-text"><strong>{total}</strong><small>{centerLabel}</small></div></div>
    <ul className="rh-legend">{data.map((d, i) => <li key={d.label}><i style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} /><span>{d.label}</span><b>{d.value}</b></li>)}{!data.length ? <li className="rh-muted">Aucune donnée.</li> : null}</ul>
  </div>;
}

export function HBars({ rows, format = (v) => v, tone = "blue" }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return <ul className="rh-hbars">{rows.map((row) => <li key={row.label}><span title={row.label}>{row.label}</span><div className={`rh-track is-${tone}`}><span style={{ width: `${(row.value / max) * 100}%` }} /></div><b>{format(row.value)}</b>{row.hint ? <small>{row.hint}</small> : null}</li>)}{!rows.length ? <li className="rh-muted">Aucune donnée.</li> : null}</ul>;
}

/** Hook utilitaire : actions asynchrones avec toast d'erreur. */
export function useAction() {
  const { toast } = useApp();
  return useCallback(async (fn, success) => {
    try { const result = await fn(); if (success) toast(success, "success"); return result ?? true; }
    catch (error) { toast(friendlyError(error), "error"); return false; }
  }, [toast]);
}

export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const id = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(id); }, [value, delay]);
  return debounced;
}

