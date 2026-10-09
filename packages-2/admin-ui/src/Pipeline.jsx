import { useEffect, useMemo, useState } from "react";
import { apiRequest, friendlyError, json, PIPELINE_LABELS, PIPELINE_STATUSES, RECOMMENDATION_LABELS, RECOMMENDATION_TONES, relativeDay, stageOf } from "./lib";
import { Avatar, Badge, Empty, ErrorNote, Icon, Loading, PageHeader, StageBadge, useApi, useApp } from "./ui";
import { ScoreCell } from "./Candidates";

export function PipelinePage({ candidates, offers, openCandidate, refresh, canWrite }) {
  const { api, confirm, toast } = useApp();
  const [job, setJob] = useState("");
  const [over, setOver] = useState("");
  const [dragId, setDragId] = useState(null);
  const list = job ? candidates.filter((c) => String(c.job_id) === job) : candidates;
  const columns = useMemo(() => PIPELINE_STATUSES.map(([value, label, tone]) => ({ value, label, tone, items: list.filter((c) => stageOf(c) === value) })), [list]);
  async function move(candidate, status) {
    if (!canWrite || status === stageOf(candidate)) return;
    if (!(await confirm({ title: `Déplacer ${candidate.full_name} ?`, message: `${PIPELINE_LABELS[stageOf(candidate)]} → ${PIPELINE_LABELS[status]}. Le candidat peut être notifié.`, confirmLabel: "Déplacer" }))) return;
    try { await apiRequest(api, `/candidatures/${candidate.id}/pipeline`, { method: "PATCH", body: json({ status }) }); toast("Candidature déplacée.", "success"); refresh(); }
    catch (caught) { toast(friendlyError(caught), "error"); }
  }
  return <div className="rh-page is-wide">
    <PageHeader actions={<select aria-label="Offre" onChange={(e) => setJob(e.target.value)} value={job}><option value="">Toutes les offres</option>{offers.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}</select>} subtitle={canWrite ? "Glissez une carte vers une autre colonne, ou utilisez le sélecteur de la carte." : "Consultation seule."} title="Pipeline" />
    <div className="rh-kanban">{columns.map((col) => <section aria-label={col.label} className={`rh-col is-${col.tone}${over === col.value ? " is-over" : ""}`} key={col.value}
      onDragLeave={() => setOver("")} onDragOver={(e) => { e.preventDefault(); setOver(col.value); }} onDrop={(e) => { e.preventDefault(); setOver(""); const dragged = candidates.find((c) => c.id === dragId); if (dragged) move(dragged, col.value); setDragId(null); }}>
      <header><strong>{col.label}</strong><span>{col.items.length}</span></header>
      <div className="rh-col-cards">{col.items.map((c) => <article className="rh-kcard" draggable={canWrite} key={c.id} onDragStart={() => setDragId(c.id)}>
        <button className="rh-kcard-main" onClick={() => openCandidate(c.id)} type="button"><Avatar name={c.full_name} size={30} /><span><strong>{c.full_name}</strong><small>{c.job_title}</small></span></button>
        <div className="rh-kcard-meta"><ScoreCell score={c.match_score} /><small>{relativeDay(c.created_at)}</small></div>
        {canWrite ? <select aria-label={`Étape de ${c.full_name}`} onChange={(e) => move(c, e.target.value)} value={stageOf(c)}>{PIPELINE_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select> : null}
      </article>)}{!col.items.length ? <p className="rh-muted rh-col-empty">Aucune candidature</p> : null}</div>
    </section>)}</div>
  </div>;
}

const mark = { supported: ["✓", "is-ok", "Confirmé"], not_found: ["✗", "is-no", "Non détecté"], uncertain: ["⚠", "is-maybe", "À confirmer"] };

export function MatchingPage({ offers, openCandidate }) {
  const { api } = useApp();
  const published = offers.filter((o) => o.status !== "draft");
  const [jobId, setJobId] = useState("");
  const [picked, setPicked] = useState([]);
  const [details, setDetails] = useState([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const { data, error, loading } = useApi(jobId ? `/candidatures/recherche?job_id=${jobId}&sort=score&limit=100` : null);
  const rows = (data?.rows || []).filter((c) => c.match_score != null);
  useEffect(() => { setPicked([]); setDetails([]); }, [jobId]);
  useEffect(() => {
    if (!picked.length) { setDetails([]); return undefined; }
    let alive = true; setBusy(true); setFailure("");
    Promise.all(picked.map((id) => apiRequest(api, `/candidatures/${id}`).then((r) => r.candidature)))
      .then((result) => { if (alive) setDetails(result); }).catch((e) => { if (alive) setFailure(friendlyError(e)); }).finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [picked, api]);
  const toggle = (id) => setPicked((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 3 ? cur : [...cur, id]);
  const job = offers.find((o) => String(o.id) === jobId);
  const criteria = (job?.criteria || []);
  return <div className="rh-page">
    <PageHeader subtitle="Classement indicatif par score de correspondance. Sélectionnez jusqu'à 3 profils pour les comparer critère par critère." title="Matching CV / offre" />
    <div className="rh-alert is-ai is-block"><Icon name="sparkles" size={16} /><span>Le classement est un outil d'aide à la lecture, pas un verdict. Vérifiez toujours le CV original avant de présélectionner.</span></div>
    <div className="rh-toolbar"><select aria-label="Offre" onChange={(e) => setJobId(e.target.value)} value={jobId}><option value="">Choisir une offre…</option>{published.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}</select>{picked.length ? <button className="rh-btn is-sm" onClick={() => setPicked([])} type="button">Vider la comparaison ({picked.length})</button> : null}</div>
    <ErrorNote>{error || failure}</ErrorNote>
    {!jobId ? <Empty icon="matching" title="Choisissez une offre">Les candidatures analysées seront classées selon leur correspondance avec ses critères.</Empty> : null}
    {loading ? <Loading /> : null}
    {jobId && !loading && !error ? <div className="rh-table-wrap"><table className="rh-table is-static"><thead><tr><th><span className="rh-sr">Comparer</span></th><th>Candidat</th><th>Score</th><th>Recommandation IA</th><th>Étape</th><th /></tr></thead>
      <tbody>{rows.map((c, i) => <tr key={c.id}><td><input aria-label={`Comparer ${c.full_name}`} checked={picked.includes(c.id)} disabled={!picked.includes(c.id) && picked.length >= 3} onChange={() => toggle(c.id)} type="checkbox" /></td>
        <td><div className="rh-person"><Avatar name={c.full_name} /><div><strong>{c.full_name}</strong><small>{c.experience_years != null ? `${c.experience_years} an(s)` : "Expérience non précisée"} · {c.education_level || "diplôme non précisé"}</small></div></div></td>
        <td><ScoreCell score={c.match_score} /></td><td>{c.match_score >= 80 ? <Badge tone="green">Forte correspondance</Badge> : c.match_score >= 60 ? <Badge tone="blue">Correspondance</Badge> : c.match_score >= 40 ? <Badge tone="amber">À vérifier</Badge> : <Badge tone="red">Faible correspondance</Badge>}</td>
        <td><StageBadge status={stageOf(c)} /></td><td><button className="rh-btn is-sm" onClick={() => openCandidate(c.id)} type="button">Dossier</button></td></tr>)}</tbody></table>
      {!rows.length ? <Empty icon="matching" title="Aucun profil analysé pour cette offre">Les scores apparaissent dès que l'analyse IA des CV est terminée.</Empty> : null}</div> : null}
    {details.length ? <section className="rh-panel"><div className="rh-panel-head"><div><h3><Icon name="sparkles" size={16} />Comparaison</h3><p>{busy ? "Mise à jour…" : "Critère par critère, avec la preuve relevée dans le CV."}</p></div></div>
      <div className="rh-table-wrap is-flat"><table className="rh-table is-static rh-matrix"><thead><tr><th>Critère</th>{details.map((d) => <th key={d.id}>{d.full_name}<small>{d.analysis?.score ? `${Math.round(d.analysis.score.total)}/100` : "—"} · {RECOMMENDATION_LABELS[d.analysis?.recommendation] || "—"}</small></th>)}</tr></thead>
        <tbody>{criteria.map((crit) => <tr key={crit.label}><td><strong>{crit.label}</strong><small>{crit.required ? "Obligatoire" : "Souhaité"}</small></td>{details.map((d) => { const item = (d.analysis?.criteria || []).find((x) => x.criterion === crit.label); const [sym, cls, label] = mark[item?.assessment] || ["–", "", "Non évalué"]; return <td key={d.id}><span aria-label={label} className={`rh-mark ${cls}`}>{sym}</span>{item?.evidence ? <small>{item.evidence}</small> : null}</td>; })}</tr>)}
        <tr><td><strong>Expérience détectée</strong></td>{details.map((d) => <td key={d.id}>{d.experience_years != null ? `${d.experience_years} an(s)` : "—"}</td>)}</tr>
        <tr><td><strong>Niveau d'études</strong></td>{details.map((d) => <td key={d.id}>{d.education_level || "—"}</td>)}</tr></tbody></table></div>
    </section> : null}
  </div>;
}
