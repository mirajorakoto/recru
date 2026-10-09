import { useEffect, useMemo, useState } from "react";
import { apiRequest, dateTime, exportCandidatesCsv, finalTone, fmtScore, friendlyError, INTERVIEW_MODES, json, PIPELINE_LABELS, PIPELINE_STATUSES, plural, RECOMMENDATION_LABELS, relativeDay, SCORE_MAX, stageOf, timeOnly, toLocalInput } from "./lib";
import { Avatar, Badge, Drawer, Empty, ErrorNote, Field, Icon, Loading, PageHeader, StageBadge, useApi, useApp } from "./ui";
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
        <button className="rh-kcard-main" onClick={() => openCandidate(c.id)} type="button"><Avatar name={c.full_name} size={30} /><span><strong>{c.full_name}</strong><small>{c.reference ? `${c.reference} · ` : ""}{c.job_title}</small></span></button>
        <div className="rh-kcard-meta"><ScoreCell score={c.match_score} /><small>{relativeDay(c.created_at)}</small></div>
        {canWrite ? <select aria-label={`Étape de ${c.full_name}`} onChange={(e) => move(c, e.target.value)} value={stageOf(c)}>{PIPELINE_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select> : null}
      </article>)}{!col.items.length ? <p className="rh-muted rh-col-empty">Aucune candidature</p> : null}</div>
    </section>)}</div>
  </div>;
}

const mark = { supported: ["✓", "is-ok", "Confirmé"], not_found: ["✗", "is-no", "Non détecté"], uncertain: ["⚠", "is-maybe", "À confirmer"] };

const eligible = (c) => c.processing_status === "analysis_ready" && !["rejected", "withdrawn"].includes(c.hr_decision) && !c.next_interview_at && !["acceptee", "refusee"].includes(c.pipeline_status);
const tomorrowAt9 = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return toLocalInput(d); };

/* Invitations groupées : les créneaux s'enchaînent automatiquement dans l'ordre du classement. */
function BulkInterviewDrawer({ job, people, onClose, onDone }) {
  const { api, me, toast } = useApp();
  const [form, setForm] = useState({ start_at: tomorrowAt9(), duration_min: 45, gap_min: 15, mode: "onsite", location: "", interviewer_email: me?.email || "", notify: true });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const set = (name, value) => setForm((c) => ({ ...c, [name]: value }));
  const step = (Number(form.duration_min) + Number(form.gap_min)) * 60000;
  const start = form.start_at ? new Date(form.start_at).getTime() : NaN;
  async function submit(event) {
    event.preventDefault(); setPending(true); setError("");
    try {
      const data = await apiRequest(api, `/offres/${job.id}/entretiens-groupes`, { method: "POST", body: json({ application_ids: people.map((p) => p.id), start_at: new Date(form.start_at).toISOString(), duration_min: Number(form.duration_min), gap_min: Number(form.gap_min), mode: form.mode, location: form.location, interviewer_email: form.interviewer_email, notify_candidate: form.notify }) });
      setResult(data);
      toast(`${plural(data.created.length, "invitation")} envoyée${data.created.length > 1 ? "s" : ""}.`, "success");
    } catch (caught) { setError(caught.message); } finally { setPending(false); }
  }
  if (result) return <Drawer onClose={() => { onClose(); onDone(); }} title="Invitations envoyées" subtitle={job.title}>
    <div className="rh-stack">
      <p className="rh-alert is-ok is-block"><strong>{plural(result.created.length, "entretien")} planifié{result.created.length > 1 ? "s" : ""}</strong><span>Chaque candidat a reçu son invitation par email et sur son espace. Les questions d'entretien sont préparées par l'IA à partir de l'offre et du CV.</span></p>
      <ul className="rh-plain">{result.created.map((c) => <li key={c.application_id}><strong>{c.full_name}</strong><small>{dateTime(c.entretien.scheduled_at)}</small></li>)}</ul>
      {result.skipped.length ? <div className="rh-alert is-warn is-block"><strong>Non planifiés</strong><ul>{result.skipped.map((s) => <li key={s.application_id}>{s.full_name || `Candidature ${s.application_id}`} : {s.reason}</li>)}</ul></div> : null}
      <button className="rh-btn is-primary" onClick={() => { onClose(); onDone(); }} type="button">Terminer</button>
    </div>
  </Drawer>;
  return <Drawer onClose={onClose} subtitle={`${plural(people.length, "candidat")} sélectionné${people.length > 1 ? "s" : ""} dans l'ordre du classement`} title="Inviter à l'entretien" wide
    footer={<><ErrorNote>{error}</ErrorNote><button className="rh-btn" onClick={onClose} type="button">Annuler</button><button className="rh-btn is-primary" disabled={pending || Number.isNaN(start)} form="rh-bulk" type="submit"><Icon name="mail" size={16} />{pending ? "Envoi…" : `Envoyer ${plural(people.length, "invitation")}`}</button></>}>
    <form className="rh-form" id="rh-bulk" onSubmit={submit}>
      <div className="rh-grid-2">
        <Field label="Premier créneau"><input min={toLocalInput(new Date())} onChange={(e) => set("start_at", e.target.value)} required type="datetime-local" value={form.start_at} /></Field>
        <Field label="Recruteur (email)"><input onChange={(e) => set("interviewer_email", e.target.value)} required type="email" value={form.interviewer_email} /></Field>
        <Field label="Durée d'un entretien (min)"><input max="240" min="15" onChange={(e) => set("duration_min", e.target.value)} required step="5" type="number" value={form.duration_min} /></Field>
        <Field label="Pause entre deux entretiens (min)"><input max="120" min="0" onChange={(e) => set("gap_min", e.target.value)} required step="5" type="number" value={form.gap_min} /></Field>
        <Field label="Mode"><select onChange={(e) => set("mode", e.target.value)} value={form.mode}>{INTERVIEW_MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Lieu ou lien de visioconférence"><input onChange={(e) => set("location", e.target.value)} placeholder="Salle, adresse ou https://…" value={form.location} /></Field>
      </div>
      <label className="rh-check"><input checked={form.notify} onChange={(e) => set("notify", e.target.checked)} type="checkbox" />Envoyer l'invitation par email et dans l'espace candidat</label>
      <div className="rh-panel is-ai"><div className="rh-panel-head"><div><h3><Icon name="sparkles" size={16} />Planning prévisionnel</h3><p>Les créneaux déjà occupés par ce recruteur sont sautés automatiquement.</p></div></div>
        <ol className="rh-plain">{people.map((p, i) => <li key={p.id}><strong>{i + 1}. {p.full_name}</strong><small>{Number.isNaN(start) ? "—" : `${dateTime(start + i * step)} → ${timeOnly(start + i * step + form.duration_min * 60000)}`}</small></li>)}</ol></div>
    </form>
  </Drawer>;
}

export function RankingPage({ offers, openCandidate, canWrite }) {
  const { api } = useApp();
  const [jobId, setJobId] = useState("");
  const [version, setVersion] = useState(0);
  const [picked, setPicked] = useState([]);
  const [topN, setTopN] = useState(5);
  const [planning, setPlanning] = useState(false);
  const [details, setDetails] = useState([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const { data, error, loading } = useApi(jobId ? `/offres/${jobId}/classement` : null, version);
  const rows = data?.candidatures || [];
  const offre = data?.offre;
  const open = offre ? offre.interviews_open : false;
  const job = offers.find((o) => String(o.id) === jobId);
  const pickedPeople = rows.filter((c) => picked.includes(c.id));
  useEffect(() => { setPicked([]); setDetails([]); }, [jobId]);
  const toggle = (id) => setPicked((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  const selectTop = () => setPicked(rows.filter(eligible).slice(0, Math.max(1, Number(topN) || 1)).map((c) => c.id));
  async function compare() {
    const ids = pickedPeople.slice(0, 3).map((c) => c.id);
    setBusy(true); setFailure("");
    try { setDetails(await Promise.all(ids.map((id) => apiRequest(api, `/candidatures/${id}`).then((r) => r.candidature)))); }
    catch (caught) { setFailure(friendlyError(caught)); } finally { setBusy(false); }
  }
  const criteria = job?.criteria || [];
  return <div className="rh-page is-wide">
    <PageHeader actions={rows.length ? <button className="rh-btn" onClick={() => exportCandidatesCsv(rows)} type="button"><Icon name="download" size={16} />Exporter le classement</button> : null}
      subtitle={`Classement automatique par score final : analyse IA (/${SCORE_MAX.ia}) + entretien (/${SCORE_MAX.entretien}) + note RH (/${SCORE_MAX.rh}) = /${SCORE_MAX.final}.`} title="Classement par offre" />
    <div className="rh-toolbar"><select aria-label="Offre" onChange={(e) => setJobId(e.target.value)} value={jobId}><option value="">Choisir une offre…</option>{offers.filter((o) => o.status !== "draft").map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}</select>
      {jobId ? <button aria-label="Actualiser" className="rh-icon-btn" onClick={() => setVersion((v) => v + 1)} type="button"><Icon name="refresh" /></button> : null}</div>
    <ErrorNote>{error || failure}</ErrorNote>
    {!jobId ? <Empty icon="matching" title="Choisissez une offre">Les candidatures sont classées automatiquement dès la fin de l'analyse IA. Aucune saisie n'est nécessaire.</Empty> : null}
    {loading && !data ? <Loading /> : null}
    {offre ? <>
      {!open ? <div className="rh-alert is-warn is-block"><strong><Icon name="clock" size={16} /> Invitations aux entretiens verrouillées</strong><span>Elles s'ouvrent après la date limite de dépôt des candidatures : <b>{dateTime(offre.interviews_opens_at)}</b>. En attendant, les candidatures s'ajoutent et se classent automatiquement.</span></div> : null}
      <div className="rh-toolbar rh-selectbar">
        <span className="rh-muted">{plural(rows.length, "candidature")} · {picked.length ? `${picked.length} sélectionnée${picked.length > 1 ? "s" : ""}` : "aucune sélection"}</span>
        {canWrite ? <>
          <label className="rh-inline">Sélectionner les <input aria-label="Nombre de meilleurs profils" className="rh-num" max="50" min="1" onChange={(e) => setTopN(e.target.value)} type="number" value={topN} /> meilleurs</label>
          <button className="rh-btn is-sm" onClick={selectTop} type="button">Appliquer</button>
          {picked.length ? <button className="rh-btn is-sm" onClick={() => { setPicked([]); setDetails([]); }} type="button">Tout désélectionner</button> : null}
          {picked.length >= 2 ? <button className="rh-btn is-sm is-ai" disabled={busy} onClick={compare} type="button"><Icon name="sparkles" size={14} />Comparer {Math.min(3, picked.length)} profils</button> : null}
          <button className="rh-btn is-primary rh-push" disabled={!open || !picked.length} onClick={() => setPlanning(true)} title={open ? "" : `Disponible après la date limite (${dateTime(offre.interviews_opens_at)})`} type="button"><Icon name="mail" size={16} />Inviter à l'entretien{picked.length ? ` (${picked.length})` : ""}</button>
        </> : null}
      </div>
      <div className="rh-table-wrap"><table className="rh-table is-static rh-rank"><thead><tr><th>{canWrite ? <span className="rh-sr">Sélection</span> : null}</th><th>Rang</th><th>Réf.</th><th>Candidat</th><th>IA /100</th><th>Entretien /50</th><th>Note RH /20</th><th>Final /170</th><th>Étape</th><th /></tr></thead>
        <tbody>{rows.map((c) => <tr className={picked.includes(c.id) ? "is-picked" : ""} key={c.id}>
          <td>{canWrite ? <input aria-label={`Sélectionner ${c.full_name}`} checked={picked.includes(c.id)} disabled={!eligible(c)} onChange={() => toggle(c.id)} title={eligible(c) ? "" : c.next_interview_at ? "Entretien déjà planifié" : "Analyse IA requise ou dossier clôturé"} type="checkbox" /> : null}</td>
          <td><span className={`rh-rankno${c.rank <= 3 ? ` is-top${c.rank}` : ""}`}>{c.rank}</span></td>
          <td className="rh-nowrap"><code className="rh-ref">{c.reference || "—"}</code></td>
          <td><div className="rh-person"><Avatar name={c.full_name} /><div><strong>{c.full_name}</strong><small>{c.experience_years != null ? `${c.experience_years} an(s)` : "Expérience non précisée"} · {c.education_level || "diplôme non précisé"}</small></div></div></td>
          <td>{fmtScore(c.match_score)}</td><td>{fmtScore(c.interview_score)}</td><td>{fmtScore(c.hr_score)}</td>
          <td><Badge tone={finalTone(c.final_score)}>{fmtScore(c.final_score)}</Badge>{c.final_score != null && !c.final_complete ? <small>provisoire</small> : null}</td>
          <td><StageBadge status={stageOf(c)} />{c.next_interview_at ? <small>{dateTime(c.next_interview_at)}</small> : null}</td>
          <td><button className="rh-btn is-sm" onClick={() => openCandidate(c.id)} type="button">Dossier</button></td></tr>)}</tbody></table>
        {!rows.length ? <Empty icon="candidates" title="Aucune candidature pour cette offre">Elles apparaîtront ici dès leur réception et seront classées après analyse.</Empty> : null}</div>
    </> : null}
    {details.length ? <section className="rh-panel"><div className="rh-panel-head"><div><h3><Icon name="sparkles" size={16} />Comparaison</h3><p>Critère par critère, avec la preuve relevée dans le CV. Outil d'aide : vérifiez le CV original.</p></div></div>
      <div className="rh-table-wrap is-flat"><table className="rh-table is-static rh-matrix"><thead><tr><th>Critère</th>{details.map((d) => <th key={d.id}>{d.full_name}<small>{d.analysis?.score ? `${Math.round(d.analysis.score.total)}/100` : "—"} · {RECOMMENDATION_LABELS[d.analysis?.recommendation] || "—"}</small></th>)}</tr></thead>
        <tbody>{criteria.map((crit) => <tr key={crit.label}><td><strong>{crit.label}</strong><small>{crit.required ? "Obligatoire" : "Souhaité"}</small></td>{details.map((d) => { const item = (d.analysis?.criteria || []).find((x) => x.criterion === crit.label); const [sym, cls, label] = mark[item?.assessment] || ["–", "", "Non évalué"]; return <td key={d.id}><span aria-label={label} className={`rh-mark ${cls}`}>{sym}</span>{item?.evidence ? <small>{item.evidence}</small> : null}</td>; })}</tr>)}
        <tr><td><strong>Score final</strong></td>{details.map((d) => <td key={d.id}>{fmtScore(d.final_score)}/{SCORE_MAX.final}</td>)}</tr></tbody></table></div>
    </section> : null}
    {planning && job ? <BulkInterviewDrawer job={job} onClose={() => setPlanning(false)} onDone={() => { setPicked([]); setVersion((v) => v + 1); }} people={pickedPeople} /> : null}
  </div>;
}
