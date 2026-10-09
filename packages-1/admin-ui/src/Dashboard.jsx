import { dateTime, INTERVIEW_MODES, PIPELINE_LABELS, PIPELINE_STATUSES, plural, relativeDay, stageOf } from "./lib";
import { Avatar, BarChart, Badge, Donut, Empty, ErrorNote, HBars, Icon, Loading, PageHeader, Panel, StageBadge, useApi, useApp } from "./ui";
import { ScoreCell } from "./Candidates";

const monthLabel = (m) => { const [y, mo] = String(m).split("-"); return new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(new Date(Number(y), Number(mo) - 1, 1)); };

export function Kpi({ icon, label, value, detail, onClick, tone = "blue" }) {
  const body = <><span className={`rh-kpi-icon is-${tone}`}><Icon name={icon} size={18} /></span><span className="rh-kpi-label">{label}</span><strong>{value}</strong>{detail ? <small>{detail}</small> : null}</>;
  return onClick ? <button className="rh-kpi is-click" onClick={onClick} type="button">{body}</button> : <div className="rh-kpi">{body}</div>;
}

export function Dashboard({ candidates, navigate, openCandidate }) {
  const { me } = useApp();
  const { data, error, loading } = useApi("/tableau-de-bord");
  const upcoming = useApi(`/entretiens?status=planned&from=${encodeURIComponent(new Date(new Date().setHours(0, 0, 0, 0)).toISOString())}&limit=6`);
  if (loading && !data) return <div className="rh-page"><Loading /></div>;
  if (error) return <div className="rh-page"><ErrorNote>{error}</ErrorNote></div>;
  const t = data.totals || {}; const a = data.alertes || {}; const byStatus = data.candidatures_par_statut || {};
  const kpis = [
    ["offers", "Offres publiées", `${t.offres_publiees ?? 0}`, `${t.offres ?? 0} au total`, "blue", () => navigate("offers")],
    ["candidates", "Candidatures", t.candidatures ?? 0, `${a.nouvelles_24h ?? 0} reçue(s) sur 24 h`, "blue", () => navigate("candidates")],
    ["interviews", "Entretiens", t.entretiens ?? 0, `${a.entretiens_aujourdhui ?? 0} aujourd'hui · ${a.entretiens_a_venir ?? 0} à venir`, "amber", () => navigate("interviews")],
    ["clock", "À traiter", a.a_traiter ?? 0, "Nouvelles ou CV analysés", "slate", () => navigate("pipeline")],
    ["check", "Présélectionnées", byStatus.preselectionnee || 0, "Prêtes pour l'entretien", "blue", () => navigate("pipeline")],
    ["shield", "Recrutés", t.recrutes ?? 0, `Score IA moyen : ${t.score_moyen ?? "—"}`, "green", () => navigate("reports")]
  ];
  const todo = candidates.filter((c) => ["nouvelle", "en_analyse", "cv_analyse"].includes(stageOf(c))).slice(0, 5);
  const analysed = (data.candidatures_par_traitement || {}).analysis_ready || 0;
  const strong = candidates.filter((c) => Number(c.match_score) >= 80).length;
  const toCheck = (a.analyses_echouees || 0) + candidates.filter((c) => c.hr_decision === "to_review").length;
  const alerts = [[a.analyses_echouees, "analyse(s) IA en échec à relancer", "candidates", "red"], [a.entretiens_aujourdhui, "entretien(s) aujourd'hui", "interviews", "amber"], [a.nouvelles_24h, "nouvelle(s) candidature(s) en 24 h", "candidates", "blue"]].filter(([n]) => n > 0);
  const hour = new Date().getHours();
  return <div className="rh-page">
    <PageHeader subtitle="Voici l'état de votre processus de recrutement." title={`${hour < 18 ? "Bonjour" : "Bonsoir"}${me?.display_name ? `, ${me.display_name.split(" ")[0]}` : ""}`} />
    {alerts.length ? <div className="rh-alertrow">{alerts.map(([n, text, page, tone]) => <button className={`rh-alertchip is-${tone}`} key={text} onClick={() => navigate(page)} type="button"><Icon name={tone === "red" ? "alert" : "bell"} size={16} /><b>{n}</b> {text}</button>)}</div> : null}
    <div className="rh-kpis">{kpis.map(([icon, label, value, detail, tone, go]) => <Kpi detail={detail} icon={icon} key={label} label={label} onClick={go} tone={tone} value={value} />)}</div>
    <div className="rh-grid-main">
      <Panel actions={<button className="rh-btn is-sm" onClick={() => navigate("candidates")} type="button">Tout voir</button>} subtitle={todo.length ? `${plural(todo.length, "dossier")} en attente d'examen.` : undefined} title="À traiter aujourd'hui">
        {todo.length ? <ul className="rh-todo">{todo.map((c) => <li key={c.id}><Avatar name={c.full_name} /><div><strong>{c.full_name}</strong><span>{c.job_title} · {relativeDay(c.created_at)}</span></div><StageBadge status={stageOf(c)} /><ScoreCell score={c.match_score} /><button className="rh-btn is-sm is-primary" onClick={() => openCandidate(c.id)} type="button">Ouvrir</button></li>)}</ul> : <Empty icon="check" title="Rien à traiter">Les nouvelles candidatures apparaîtront ici, sans classement automatique.</Empty>}
      </Panel>
      <Panel ai subtitle="Analyse indicative. Validation humaine requise." title="Insights du module IA">
        <ul className="rh-insights"><li><b>{analysed}</b><span>CV analysés</span></li><li><b>{strong}</b><span>profils avec un score d'au moins 80 (parmi les dossiers chargés)</span></li><li><b>{toCheck}</b><span>dossiers à vérifier par un RH</span></li></ul>
        <button className="rh-btn is-ai" onClick={() => navigate("matching")} type="button"><Icon name="sparkles" size={16} />Ouvrir le classement</button>
      </Panel>
    </div>
    <div className="rh-grid-3">
      <Panel subtitle="12 derniers mois" title="Candidatures par mois"><BarChart ariaLabel="Candidatures par mois" data={(data.candidatures_par_mois || []).map((r) => ({ label: monthLabel(r.mois), value: r.n }))} /></Panel>
      <Panel title="Répartition des statuts"><Donut centerLabel="dossiers" data={PIPELINE_STATUSES.filter(([v]) => byStatus[v]).map(([v, l]) => ({ label: l, value: byStatus[v] }))} /></Panel>
      <Panel subtitle="Avec score IA moyen" title="Candidatures par offre"><HBars rows={(data.candidatures_par_offre || []).map((r) => ({ label: r.title, value: r.n, hint: r.score_moyen != null ? `score ${r.score_moyen}` : "" }))} /></Panel>
    </div>
    <div className="rh-grid-3">
      <Panel subtitle="Détectées dans les CV analysés" title="Compétences les plus présentes"><div className="rh-pills">{(data.competences_frequentes || []).map((s) => <span className="is-blue" key={s.skill}>{s.skill} <b>{s.n}</b></span>)}{!(data.competences_frequentes || []).length ? <p className="rh-muted">Aucune compétence indexée.</p> : null}</div></Panel>
      <Panel actions={<button className="rh-btn is-sm" onClick={() => navigate("interviews")} type="button">Agenda</button>} title="Prochains entretiens">
        {(upcoming.data?.entretiens || []).length ? <ul className="rh-agenda is-compact">{upcoming.data.entretiens.map((it) => <li key={it.id}><div><strong>{it.candidate_name}</strong><span>{dateTime(it.scheduled_at)} · {(INTERVIEW_MODES.find(([v]) => v === it.mode) || [0, it.mode])[1]}</span></div><button className="rh-btn is-sm" onClick={() => openCandidate(it.application_id, "interviews")} type="button">Dossier</button></li>)}</ul> : <p className="rh-muted">Aucun entretien planifié.</p>}
      </Panel>
      <Panel title="Entonnoir du recrutement"><HBars rows={["nouvelle", "cv_analyse", "preselectionnee", "entretien", "evaluation", "acceptee"].map((v) => ({ label: PIPELINE_LABELS[v], value: byStatus[v] || 0 }))} /></Panel>
    </div>
  </div>;
}
