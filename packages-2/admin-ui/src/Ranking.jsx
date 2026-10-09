import { useEffect, useMemo, useState } from "react";
import { apiRequest, dateShort, dateTime, friendlyError, json, plural, relativeDay, SCORE_MAX, stageOf, toLocalInput, INTERVIEW_MODES } from "./lib";
import { Avatar, Badge, Empty, ErrorNote, Field, Icon, Loading, PageHeader, Panel, StageBadge, useApi, useApp } from "./ui";

/** Barre de score : valeur / maximum. */
function Bar({ value, max }) {
  if (value == null) return <span className="rh-muted">—</span>;
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const tone = pct >= 80 ? "green" : pct >= 60 ? "blue" : pct >= 40 ? "amber" : "red";
  return <span className="rh-scorecell"><b>{Number.isInteger(value) ? value : value.toFixed(1)}</b><span className={`rh-track is-${tone}`}><span style={{ width: `${pct}%` }} /></span></span>;
}

/** Note RH /20 : saisie directe dans le classement (enregistrée à la sortie du champ). */
function HrScoreInput({ row, disabled, onSaved }) {
  const { api, toast } = useApp();
  const [value, setValue] = useState(row.hr_score ?? "");
  useEffect(() => setValue(row.hr_score ?? ""), [row.hr_score]);
  async function save() {
    const next = value === "" ? null : Number(value);
    if (next === (row.hr_score ?? null)) return;
    if (next !== null && (!Number.isInteger(next) || next < 0 || next > SCORE_MAX.hr)) { toast(`La note RH doit être un entier de 0 à ${SCORE_MAX.hr}.`, "error"); setValue(row.hr_score ?? ""); return; }
    try { await apiRequest(api, `/candidatures/${row.id}/score-rh`, { method: "PATCH", body: json({ score: next }) }); onSaved(); }
    catch (caught) { toast(friendlyError(caught), "error"); setValue(row.hr_score ?? ""); }
  }
  return <span className="rh-hrscore"><input aria-label={`Note RH de ${row.full_name}, sur ${SCORE_MAX.hr}`} disabled={disabled} inputMode="numeric" max={SCORE_MAX.hr} min="0" onBlur={save} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} placeholder="—" type="number" value={value} /><small>/{SCORE_MAX.hr}</small></span>;
}

/** Envoi groupé des convocations : un créneau par candidat, email automatique. */
function ConvocationDialog({ job, selected, onClose, onDone }) {
  const { api, me, toast } = useApp();
  const [draft, setDraft] = useState({ start_at: "", duration_min: 45, gap_min: 15, mode: "onsite", location: "", interviewer_email: me?.email || "", notes: "" });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState(null);
  const set = (name, value) => setDraft((current) => ({ ...current, [name]: value }));
  const end = draft.start_at ? new Date(new Date(draft.start_at).getTime() + (selected.length * Number(draft.duration_min) + (selected.length - 1) * Number(draft.gap_min)) * 60000) : null;
  async function submit(event) {
    event.preventDefault();
    setPending(true); setError("");
    try {
      const body = { ...draft, start_at: new Date(draft.start_at).toISOString(), duration_min: Number(draft.duration_min), gap_min: Number(draft.gap_min), application_ids: selected.map((row) => row.id) };
      const response = await apiRequest(api, `/offres/${job.id}/convocations`, { method: "POST", body: json(body) });
      setResult(response);
      toast(`${plural(response.created.length, "convocation")} envoyée${response.created.length > 1 ? "s" : ""}.`, "success");
      onDone();
    } catch (caught) { setError(friendlyError(caught)); } finally { setPending(false); }
  }
  const nameOf = (id) => selected.find((row) => row.id === id)?.full_name || `#${id}`;
  return <div className="rh-scrim is-center" onMouseDown={(e) => { if (e.target === e.currentTarget && !pending) onClose(); }}>
    <div aria-label="Convoquer à un entretien" aria-modal="true" className="rh-dialog is-wide" role="dialog">
      <h3>Convoquer {plural(selected.length, "candidat")}</h3>
      {result ? <div className="rh-stack">
        <p className="rh-alert"><Icon name="check" size={16} />{plural(result.created.length, "entretien")} planifié{result.created.length > 1 ? "s" : ""} ; un email de convocation est parti automatiquement et les questions d'entretien sont préparées par l'IA.</p>
        {result.created.length ? <ul className="rh-plain">{result.created.map((item) => <li key={item.interview_id}><strong>{nameOf(item.application_id)}</strong><small>{dateTime(item.scheduled_at)}</small></li>)}</ul> : null}
        {result.skipped.length ? <div className="rh-alert is-warn is-block"><strong>Non convoqués</strong><ul>{result.skipped.map((item) => <li key={item.application_id}>{nameOf(item.application_id)} — {item.reason}</li>)}</ul></div> : null}
        <div className="rh-dialog-actions"><button className="rh-btn is-primary" onClick={onClose} type="button">Fermer</button></div>
      </div> : <form className="rh-form" onSubmit={submit}>
        <p className="rh-muted">Chaque candidat reçoit son propre créneau, les uns après les autres, et un email de convocation automatique.</p>
        <ul className="rh-pills">{selected.map((row) => <li className="is-blue" key={row.id}>{row.rank ? `#${row.rank} ` : ""}{row.full_name}</li>)}</ul>
        <div className="rh-grid-2">
          <Field label="Premier entretien"><input min={toLocalInput(new Date())} onChange={(e) => set("start_at", e.target.value)} required type="datetime-local" value={draft.start_at} /></Field>
          <Field label="Recruteur (email)"><input onChange={(e) => set("interviewer_email", e.target.value)} required type="email" value={draft.interviewer_email} /></Field>
          <Field label="Durée d'un entretien (min)"><input max="240" min="15" onChange={(e) => set("duration_min", e.target.value)} required type="number" value={draft.duration_min} /></Field>
          <Field label="Pause entre deux entretiens (min)"><input max="120" min="0" onChange={(e) => set("gap_min", e.target.value)} required type="number" value={draft.gap_min} /></Field>
          <Field label="Mode"><select onChange={(e) => set("mode", e.target.value)} value={draft.mode}>{INTERVIEW_MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
          <Field label="Lieu ou lien de visioconférence"><input onChange={(e) => set("location", e.target.value)} value={draft.location} /></Field>
        </div>
        <Field label="Notes internes (facultatif)"><textarea onChange={(e) => set("notes", e.target.value)} rows="2" value={draft.notes} /></Field>
        {end ? <p className="rh-muted">Plage prévue : jusqu'à environ {dateTime(end)}.</p> : null}
        <ErrorNote>{error}</ErrorNote>
        <div className="rh-dialog-actions"><button className="rh-btn" disabled={pending} onClick={onClose} type="button">Annuler</button><button className="rh-btn is-primary" disabled={pending} type="submit"><Icon name="mail" size={16} />{pending ? "Envoi…" : `Envoyer ${plural(selected.length, "convocation")}`}</button></div>
      </form>}
    </div>
  </div>;
}

/** Classement d'une offre : score final = IA /100 + entretien /50 + note RH /20 (= /170). */
export function RankingPage({ offers, canWrite, openCandidate, initialJobId, refreshCore }) {
  const { toast } = useApp();
  const published = offers.filter((o) => o.status !== "draft");
  const [jobId, setJobId] = useState(initialJobId ? String(initialJobId) : "");
  const [version, setVersion] = useState(0);
  const [picked, setPicked] = useState([]);
  const [topN, setTopN] = useState(5);
  const [dialog, setDialog] = useState(false);
  const { data, error, loading } = useApi(jobId ? `/offres/${jobId}/classement` : null, version);
  useEffect(() => { if (initialJobId) setJobId(String(initialJobId)); }, [initialJobId]);
  useEffect(() => setPicked([]), [jobId]);
  const rows = data?.rows || [];
  const job = data?.offre;
  const unlocked = job ? job.interviews_unlocked : false;
  const selectable = rows.filter((row) => row.processing_status === "analysis_ready" && !row.next_interview_at && row.hr_decision !== "rejected" && row.pipeline_status !== "refusee");
  const chosen = rows.filter((row) => picked.includes(row.id));
  const reload = () => { setVersion((v) => v + 1); refreshCore?.(); };
  const toggle = (id) => setPicked((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  const pickTop = () => setPicked(selectable.slice(0, Math.max(1, Number(topN) || 1)).map((row) => row.id));
  const lockText = useMemo(() => (job && !unlocked ? `Les dépôts sont ouverts jusqu'au ${dateTime(job.application_deadline)}. Les convocations seront disponibles après cette date (ou à la clôture de l'offre).` : ""), [job, unlocked]);
  return <div className="rh-page is-wide">
    <PageHeader subtitle="Candidatures de l'offre classées par score final : analyse IA (/100) + entretien (/50) + note RH (/20) = /170. Cochez les candidats à convoquer : l'email part automatiquement." title="Classement et convocations" />
    <div className="rh-toolbar"><select aria-label="Offre" onChange={(e) => setJobId(e.target.value)} value={jobId}><option value="">Choisir une offre…</option>{published.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}</select>
      {jobId ? <button aria-label="Actualiser" className="rh-icon-btn" onClick={reload} type="button"><Icon name="refresh" /></button> : null}</div>
    <ErrorNote>{error}</ErrorNote>
    {!jobId ? <Empty icon="reports" title="Choisissez une offre">Les candidatures sont classées automatiquement dès que l'analyse IA est terminée.</Empty> : null}
    {loading && !data ? <Loading /> : null}
    {job ? <>
      <div className={`rh-alert ${unlocked ? "is-ai" : "is-warn"} is-block`}><span><Icon name={unlocked ? "check" : "clock"} size={16} /> {unlocked ? (job.application_deadline ? `Dépôt clos depuis le ${dateShort(job.application_deadline)} : vous pouvez convoquer.` : "Aucune date limite : vous pouvez convoquer à tout moment.") : lockText}</span></div>
      <Panel actions={canWrite ? <div className="rh-rankbar">
        <label className="rh-inline-field">Les <input aria-label="Nombre de candidats à sélectionner" max="100" min="1" onChange={(e) => setTopN(e.target.value)} type="number" value={topN} /> premiers</label>
        <button className="rh-btn is-sm" disabled={!selectable.length} onClick={pickTop} type="button">Sélectionner</button>
        <button className="rh-btn is-sm" disabled={!picked.length} onClick={() => setPicked([])} type="button">Effacer</button>
        <button className="rh-btn is-primary" disabled={!unlocked || !chosen.length} onClick={() => setDialog(true)} title={unlocked ? "" : lockText} type="button"><Icon name="mail" size={16} />{unlocked ? `Convoquer (${chosen.length})` : "Convocations verrouillées"}</button>
      </div> : null} subtitle={`${plural(rows.length, "candidature")} · ${selectable.length} convocable${selectable.length > 1 ? "s" : ""}`} title={job.title}>
        <div className="rh-table-wrap is-flat"><table className="rh-table is-static rh-ranktable"><thead><tr>{canWrite ? <th><span className="rh-sr">Sélection</span></th> : null}<th>Rang</th><th>Candidat</th><th>Analyse IA<small>/{SCORE_MAX.ai}</small></th><th>Entretien<small>/{SCORE_MAX.interview}</small></th><th>Note RH<small>/{SCORE_MAX.hr}</small></th><th>Score final<small>/{SCORE_MAX.final}</small></th><th>Étape</th><th /></tr></thead>
          <tbody>{rows.map((row) => { const s = row.scores || {}; const blocked = !selectable.includes(row); return <tr className={picked.includes(row.id) ? "is-picked" : ""} key={row.id}>
            {canWrite ? <td><input aria-label={`Convoquer ${row.full_name}`} checked={picked.includes(row.id)} disabled={blocked} onChange={() => toggle(row.id)} title={row.next_interview_at ? "Déjà convoqué(e)" : row.processing_status !== "analysis_ready" ? "Analyse IA requise" : ""} type="checkbox" /></td> : null}
            <td><b className="rh-rank">{row.rank ?? "—"}</b></td>
            <td><div className="rh-person"><Avatar name={row.full_name} /><div><strong>{row.full_name}</strong><small>{row.next_interview_at ? `Entretien le ${dateTime(row.next_interview_at)}` : `Reçue ${relativeDay(row.created_at)}`}</small></div></div></td>
            <td><Bar max={SCORE_MAX.ai} value={s.ai} /></td>
            <td><Bar max={SCORE_MAX.interview} value={s.interview} /></td>
            <td>{canWrite ? <HrScoreInput disabled={false} onSaved={reload} row={row} /> : (s.hr ?? "—")}</td>
            <td>{s.final != null ? <span className="rh-final"><b>{Number.isInteger(s.final) ? s.final : s.final.toFixed(1)}</b><small>{s.complete ? "complet" : "provisoire"}</small></span> : <span className="rh-muted">—</span>}</td>
            <td><StageBadge status={stageOf(row)} /></td>
            <td><button className="rh-btn is-sm" onClick={() => openCandidate(row.id)} type="button">Dossier</button></td></tr>; })}</tbody></table>
          {!rows.length ? <Empty icon="candidates" title="Aucune candidature pour cette offre">Le classement apparaît dès les premiers dépôts.</Empty> : null}
        </div>
        <p className="rh-fineprint">Le score final est une aide à la décision : il additionne l'analyse automatisée du CV, la moyenne des notes d'entretien et la note du RH. « Provisoire » signifie qu'une composante manque encore. La décision finale reste humaine.</p>
      </Panel>
    </> : null}
    {dialog && job ? <ConvocationDialog job={{ id: job.id, title: job.title }} onClose={() => { setDialog(false); }} onDone={() => { setPicked([]); reload(); toast("Classement mis à jour.", "info"); }} selected={chosen} /> : null}
  </div>;
}

/** Les trois composantes du score final et la note RH /20, dans la fiche candidat. */
export function ScoreSummary({ candidate, canWrite, onChanged }) {
  const scores = candidate.scores || {};
  const tiles = [
    ["Analyse IA", scores.ai, SCORE_MAX.ai, "Correspondance CV / offre"],
    ["Entretien", scores.interview, SCORE_MAX.interview, "Moyenne des évaluations"],
    ["Note RH", scores.hr, SCORE_MAX.hr, "Appréciation du RH"]
  ];
  return <section aria-label="Score final" className="rh-scoretiles">
    {tiles.map(([label, value, max, hint]) => <div className="rh-scoretile" key={label}><span>{label}</span><strong>{value ?? "—"}<small>/{max}</small></strong><em>{hint}</em></div>)}
    <div className="rh-scoretile is-final"><span>Score final</span><strong>{scores.final ?? "—"}<small>/{SCORE_MAX.final}</small></strong><em>{scores.final == null ? "En attente de l'analyse" : scores.complete ? "Score complet" : "Provisoire : il manque " + [scores.interview == null ? "l'entretien" : null, scores.hr == null ? "la note RH" : null].filter(Boolean).join(" et ")}</em></div>
    {canWrite ? <div className="rh-scoretile is-input"><span>Attribuer la note RH</span><HrScoreInput disabled={false} onSaved={onChanged} row={{ id: candidate.id, full_name: candidate.full_name, hr_score: candidate.hr_score ?? null }} /><em>Entier de 0 à {SCORE_MAX.hr}, enregistré à la sortie du champ.</em></div> : null}
  </section>;
}
