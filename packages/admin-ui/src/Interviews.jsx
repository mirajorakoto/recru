import { useMemo, useState } from "react";
import { apiRequest, dateTime, dayLong, EVAL_RECO, EVAL_RECO_TONES, EVALUATION_CRITERIA, INTERVIEW_MODES, INTERVIEW_STATUS_LABELS, INTERVIEW_STATUS_TONES, json, plural, timeOnly, toLocalInput } from "./lib";
import { Avatar, Badge, Empty, ErrorNote, Field, HBars, Icon, Loading, PageHeader, Panel, Tabs, useApi, useApp } from "./ui";

const isUrl = (text) => /^https?:\/\//i.test(String(text || ""));
const modeLabel = (mode) => (INTERVIEW_MODES.find(([value]) => value === mode) || [mode, mode])[1];

/* ------------------------------------------------ planification (CDC §20) */
export function InterviewForm({ candidate, interview, onSaved, onCancel }) {
  const { api, me, toast } = useApp();
  const [draft, setDraft] = useState({
    scheduled_at: interview ? toLocalInput(interview.scheduled_at) : "",
    duration_min: interview?.duration_min || 45,
    mode: interview?.mode || "onsite",
    location: interview?.location || "",
    interviewer_email: interview?.interviewer_email || me?.email || "",
    notes: interview?.notes || "",
    notify: true
  });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const set = (name, value) => setDraft((current) => ({ ...current, [name]: value }));
  async function submit(event) {
    event.preventDefault();
    setPending(true); setError("");
    const body = { scheduled_at: new Date(draft.scheduled_at).toISOString(), duration_min: Number(draft.duration_min), mode: draft.mode, location: draft.location, interviewer_email: draft.interviewer_email, notes: draft.notes };
    try {
      if (interview) await apiRequest(api, `/entretiens/${interview.id}`, { method: "PATCH", body: json(body) });
      else await apiRequest(api, "/entretiens", { method: "POST", body: json({ ...body, application_id: candidate.id, notify_candidate: draft.notify }) });
      toast(interview ? "Entretien mis à jour." : "Entretien planifié.", "success");
      onSaved();
    } catch (caught) { setError(caught.message); } finally { setPending(false); }
  }
  return <form className="rh-form rh-inset" onSubmit={submit}>
    <h4>{interview ? "Reprogrammer l'entretien" : `Planifier un entretien avec ${candidate.full_name}`}</h4>
    <div className="rh-grid-2">
      <Field label="Date et heure"><input min={toLocalInput(new Date())} onChange={(e) => set("scheduled_at", e.target.value)} required type="datetime-local" value={draft.scheduled_at} /></Field>
      <Field label="Durée (minutes)" hint="Entre 15 et 240."><input max="240" min="15" onChange={(e) => set("duration_min", e.target.value)} required step="5" type="number" value={draft.duration_min} /></Field>
      <Field label="Mode"><select onChange={(e) => set("mode", e.target.value)} value={draft.mode}>{INTERVIEW_MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
      <Field label="Recruteur (email)"><input onChange={(e) => set("interviewer_email", e.target.value)} required type="email" value={draft.interviewer_email} /></Field>
    </div>
    <Field label="Lieu ou lien de visioconférence"><input onChange={(e) => set("location", e.target.value)} placeholder="Salle, adresse ou https://…" value={draft.location} /></Field>
    <Field label="Notes internes"><textarea onChange={(e) => set("notes", e.target.value)} rows="2" value={draft.notes} /></Field>
    {!interview ? <label className="rh-check"><input checked={draft.notify} onChange={(e) => set("notify", e.target.checked)} type="checkbox" />Notifier le candidat (portail et email)</label> : <p className="rh-muted">Le candidat est notifié automatiquement si la date change.</p>}
    <ErrorNote>{error}</ErrorNote>
    <div className="rh-actions"><button className="rh-btn" onClick={onCancel} type="button">Annuler</button><button className="rh-btn is-primary" disabled={pending} type="submit">{pending ? "Enregistrement…" : interview ? "Enregistrer" : "Planifier"}</button></div>
  </form>;
}

/* ------------------------------------------------ évaluation (CDC §21) */
function Rating({ value, onChange, label }) {
  return <div className="rh-slider"><input aria-label={`${label}, sur 10`} max="10" min="0" onChange={(e) => onChange(Number(e.target.value))} step="1" type="range" value={value} /><b>{value}<small>/10</small></b></div>;
}

export function EvaluationForm({ candidateId, interview, onSaved, onCancel }) {
  const { api, toast } = useApp();
  const [draft, setDraft] = useState({ technical: 5, communication: 5, motivation: 5, experience: 5, adaptability: 5, recommendation: "reserve", comment: "" });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const total = EVALUATION_CRITERIA.reduce((sum, [key]) => sum + draft[key], 0);
  async function submit(event) {
    event.preventDefault();
    setPending(true); setError("");
    try {
      await apiRequest(api, `/candidatures/${candidateId}/evaluations`, { method: "POST", body: json({ ...draft, interview_id: interview.id }) });
      toast("Évaluation enregistrée.", "success");
      onSaved();
    } catch (caught) { setError(caught.message); } finally { setPending(false); }
  }
  return <form className="rh-form rh-inset" onSubmit={submit}>
    <h4>Évaluer l'entretien du {dateTime(interview.scheduled_at)}</h4>
    <div className="rh-rate-list">{EVALUATION_CRITERIA.map(([key, label]) => <div key={key}><span>{label}</span><Rating label={`${label}, sur 5`} onChange={(n) => setDraft({ ...draft, [key]: n })} value={draft[key]} /></div>)}</div>
    <div className="rh-segment" role="radiogroup" aria-label="Recommandation">{Object.entries(EVAL_RECO).map(([value, label]) => <button aria-checked={draft.recommendation === value} className={draft.recommendation === value ? `is-on is-${EVAL_RECO_TONES[value]}` : ""} key={value} onClick={() => setDraft({ ...draft, recommendation: value })} role="radio" type="button">{label}</button>)}</div>
    <Field label="Commentaires"><textarea onChange={(e) => setDraft({ ...draft, comment: e.target.value })} placeholder="Observations factuelles liées au poste." rows="3" value={draft.comment} /></Field>
    <p className="rh-muted">Score d'entretien : <b>{total}/50</b>. La décision finale reste prise par un recruteur habilité.</p>
    <ErrorNote>{error}</ErrorNote>
    <div className="rh-actions"><button className="rh-btn" onClick={onCancel} type="button">Annuler</button><button className="rh-btn is-primary" disabled={pending} type="submit">{pending ? "Enregistrement…" : "Enregistrer l'évaluation"}</button></div>
  </form>;
}

export function EvaluationSummary({ evaluations }) {
  if (!evaluations.length) return null;
  const rows = EVALUATION_CRITERIA.map(([key, label]) => ({ label, value: Math.round((evaluations.reduce((s, e) => s + Number(e[key] || 0), 0) / evaluations.length) * 10) / 10 }));
  const avgTotal = Math.round((evaluations.reduce((s, e) => s + Number(e.total || 0), 0) / evaluations.length) * 10) / 10;
  return <div className="rh-eval-summary">
    <div className="rh-eval-top"><strong>Moyenne des évaluations</strong><Badge tone="blue">{avgTotal}/50 · {plural(evaluations.length, "évaluateur")}</Badge></div>
    <HBars format={(v) => `${v}/10`} rows={rows} />
    <ul className="rh-eval-list">{evaluations.map((item) => <li key={item.id}><div><strong>{item.evaluator}</strong><Badge tone={EVAL_RECO_TONES[item.recommendation] || "slate"}>{EVAL_RECO[item.recommendation] || item.recommendation}</Badge><span className="rh-muted">{item.total}/50</span></div>{item.comment ? <p>{item.comment}</p> : null}</li>)}</ul>
  </div>;
}

/* ------------------------------------- onglet « Entretiens » de la fiche candidat */
export function CandidateInterviews({ candidate, onChanged, canWrite }) {
  const { api, confirm, toast, offers = [] } = useApp();
  const offer = offers.find((o) => o.id === candidate.job_id);
  const locked = offer ? offer.interviews_open === false : false;
  const [version, setVersion] = useState(0);
  const [mode, setMode] = useState(null); // null | "new" | {edit: interview} | {evaluate: interview}
  const interviews = useApi(`/entretiens?application_id=${candidate.id}`, version);
  const evaluations = useApi(`/candidatures/${candidate.id}/evaluations`, version);
  const reload = () => { setVersion((v) => v + 1); onChanged?.(); };
  const list = interviews.data?.entretiens || [];
  const evals = evaluations.data?.evaluations || [];
  const ready = candidate.processing_status === "analysis_ready" && !locked;
  async function setStatus(interview, status) {
    const ok = await confirm({ title: status === "cancelled" ? "Annuler l'entretien ?" : "Marquer comme réalisé ?", message: status === "cancelled" ? "Le candidat sera prévenu de l'annulation." : "Vous pourrez ensuite saisir l'évaluation.", confirmLabel: status === "cancelled" ? "Annuler l'entretien" : "Marquer réalisé", tone: status === "cancelled" ? "danger" : "primary" });
    if (!ok) return;
    try { await apiRequest(api, `/entretiens/${interview.id}`, { method: "PATCH", body: json({ status }) }); toast("Entretien mis à jour.", "success"); reload(); }
    catch (caught) { toast(caught.message, "error"); }
  }
  return <div className="rh-stack">
    <div className="rh-row-between"><h3>Entretiens</h3>{canWrite && !mode ? <button className="rh-btn is-primary" disabled={!ready} onClick={() => setMode("new")} title={locked ? "Disponible après la date limite de dépôt" : ready ? "" : "Analyse IA requise"} type="button"><Icon name="plus" size={16} />Planifier</button> : null}</div>
    {locked ? <p className="rh-alert is-warn"><Icon name="clock" size={16} />Les invitations aux entretiens s'ouvrent après la date limite de dépôt de l'offre ({dateTime(offer.interviews_opens_at)}).</p> : !ready ? <p className="rh-alert is-warn"><Icon name="info" size={16} />La planification est disponible une fois l'analyse IA terminée.</p> : null}
    {mode === "new" ? <InterviewForm candidate={candidate} onCancel={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} /> : null}
    <ErrorNote>{interviews.error}</ErrorNote>
    {interviews.loading && !list.length ? <Loading /> : null}
    {!interviews.loading && !interviews.error && !list.length ? <Empty icon="interviews" title="Aucun entretien">Planifiez un entretien pour ce candidat une fois le CV analysé.</Empty> : null}
    <ul className="rh-cards">{list.map((interview) => {
      const mine = evals.filter((e) => e.interview_id === interview.id);
      return <li className="rh-card" key={interview.id}>
        <div className="rh-row-between"><strong>{dateTime(interview.scheduled_at)}<span className="rh-muted"> · {interview.duration_min} min</span></strong><Badge tone={INTERVIEW_STATUS_TONES[interview.status]}>{INTERVIEW_STATUS_LABELS[interview.status] || interview.status}</Badge></div>
        <p className="rh-meta"><Icon name="map" size={14} />{modeLabel(interview.mode)} — {isUrl(interview.location) ? <a href={interview.location} rel="noreferrer noopener" target="_blank">Lien de connexion</a> : interview.location || "Lieu à préciser"}</p>
        <p className="rh-meta"><Icon name="user" size={14} />{interview.interviewer_email}</p>
        {interview.notes ? <p className="rh-note-text">{interview.notes}</p> : null}
        {mine.length ? <EvaluationSummary evaluations={mine} /> : null}
        {canWrite ? <div className="rh-actions">
          {interview.status === "planned" ? <><button className="rh-btn is-sm" onClick={() => setMode({ edit: interview })} type="button">Reprogrammer</button><button className="rh-btn is-sm" onClick={() => setStatus(interview, "done")} type="button">Marquer réalisé</button><button className="rh-btn is-sm is-quiet-danger" onClick={() => setStatus(interview, "cancelled")} type="button">Annuler</button></> : null}
          {interview.status !== "cancelled" ? <button className="rh-btn is-sm is-primary" onClick={() => setMode({ evaluate: interview })} type="button">{mine.length ? "Mettre à jour mon évaluation" : "Évaluer"}</button> : null}
        </div> : null}
        {mode?.edit?.id === interview.id ? <InterviewForm candidate={candidate} interview={interview} onCancel={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} /> : null}
        {mode?.evaluate?.id === interview.id ? <EvaluationForm candidateId={candidate.id} interview={interview} onCancel={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} /> : null}
      </li>;
    })}</ul>
  </div>;
}

/* ---------------------------------------------------------- agenda global */
const startOfWeek = (date) => { const d = new Date(date); const day = (d.getDay() + 6) % 7; d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - day); return d; };
const addDays = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return d; };
const HOUR_START = 8; const HOUR_END = 19; const ROW = 56;

function WeekGrid({ week, items, onOpen }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const todayKey = new Date().toDateString();
  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
  return <div className="rh-week" role="grid" aria-label="Agenda de la semaine">
    <div className="rh-week-head"><span />{days.map((d) => <div className={d.toDateString() === todayKey ? "is-today" : ""} key={d.toISOString()}><small>{new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(d)}</small><strong>{d.getDate()}</strong></div>)}</div>
    <div className="rh-week-body" style={{ "--row": `${ROW}px` }}>
      <div className="rh-week-hours">{hours.map((h) => <span key={h} style={{ height: ROW }}>{h}h</span>)}</div>
      {days.map((d) => {
        const dayItems = items.filter((it) => new Date(it.scheduled_at).toDateString() === d.toDateString());
        return <div className={`rh-week-col${d.toDateString() === todayKey ? " is-today" : ""}`} key={d.toISOString()} style={{ height: ROW * hours.length }}>
          {dayItems.map((it) => { const s = new Date(it.scheduled_at); const minutes = s.getHours() * 60 + s.getMinutes() - HOUR_START * 60; const top = Math.max(0, (minutes / 60) * ROW); const height = Math.max(26, (it.duration_min / 60) * ROW - 2);
            return <button className={`rh-event is-${it.status}`} key={it.id} onClick={() => onOpen(it.application_id)} style={{ top, height }} type="button" title={`${it.candidate_name} — ${it.job_title}`}><strong>{timeOnly(it.scheduled_at)} {it.candidate_name}</strong><span>{it.job_title}</span></button>; })}
        </div>;
      })}
    </div>
  </div>;
}

export function InterviewsPage({ candidates, openCandidate, canWrite }) {
  const { me, offers = [] } = useApp();
  const [view, setView] = useState("week");
  const [status, setStatus] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [range, setRange] = useState("upcoming");
  const [week, setWeek] = useState(() => startOfWeek(new Date()));
  const [scheduling, setScheduling] = useState(false);
  const [pick, setPick] = useState("");
  const [version, setVersion] = useState(0);
  const params = new URLSearchParams({ limit: "200" });
  if (status) params.set("status", status);
  if (mineOnly && me?.email) params.set("interviewer", me.email);
  if (view === "week") { params.set("from", week.toISOString()); params.set("to", addDays(week, 7).toISOString()); }
  else if (range === "upcoming") params.set("from", new Date(new Date().setHours(0, 0, 0, 0)).toISOString());
  else if (range === "past") params.set("to", new Date().toISOString());
  const { data, error, loading } = useApi(`/entretiens?${params}`, version);
  const items = data?.entretiens || [];
  const byDay = useMemo(() => items.reduce((all, it) => { const key = new Date(it.scheduled_at).toDateString(); (all[key] ||= []).push(it); return all; }, {}), [items]);
  const ready = candidates.filter((c) => c.processing_status === "analysis_ready" && offers.find((o) => o.id === c.job_id)?.interviews_open !== false);
  const target = ready.find((c) => String(c.id) === pick);
  const weekLabel = `${new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(week)} – ${new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(addDays(week, 6))}`;
  return <div className="rh-page">
    <PageHeader actions={canWrite ? <button className="rh-btn is-primary" onClick={() => setScheduling(!scheduling)} type="button"><Icon name="plus" size={16} />Planifier un entretien</button> : null} subtitle="Planifiez, suivez et évaluez les entretiens avec détection des conflits de créneau." title="Entretiens" />
    {scheduling ? <Panel title="Nouvel entretien" subtitle="Choisissez un candidat dont le CV a été analysé.">
      <Field label="Candidat"><select onChange={(e) => setPick(e.target.value)} value={pick}><option value="">Sélectionner…</option>{ready.map((c) => <option key={c.id} value={c.id}>{c.full_name} — {c.job_title}</option>)}</select></Field>
      {target ? <InterviewForm candidate={target} onCancel={() => setScheduling(false)} onSaved={() => { setScheduling(false); setPick(""); setVersion((v) => v + 1); }} /> : null}
    </Panel> : null}
    <div className="rh-toolbar">
      <Tabs label="Affichage" onChange={setView} tabs={[["week", "Semaine"], ["list", "Liste"]]} value={view} />
      {view === "week" ? <div className="rh-weeknav"><button aria-label="Semaine précédente" className="rh-icon-btn" onClick={() => setWeek(addDays(week, -7))} type="button"><Icon className="is-flip" name="chevron" /></button><strong>{weekLabel}</strong><button aria-label="Semaine suivante" className="rh-icon-btn" onClick={() => setWeek(addDays(week, 7))} type="button"><Icon name="chevron" /></button><button className="rh-btn is-sm" onClick={() => setWeek(startOfWeek(new Date()))} type="button">Aujourd'hui</button></div>
        : <select aria-label="Période" onChange={(e) => setRange(e.target.value)} value={range}><option value="upcoming">À partir d'aujourd'hui</option><option value="past">Passés</option><option value="all">Tous</option></select>}
      <select aria-label="Statut" onChange={(e) => setStatus(e.target.value)} value={status}><option value="">Tous les statuts</option>{Object.entries(INTERVIEW_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <label className="rh-check"><input checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} type="checkbox" />Mes entretiens</label>
    </div>
    <ErrorNote>{error}</ErrorNote>
    {loading && !data ? <Loading /> : null}
    {view === "week" ? <WeekGrid items={items} onOpen={(id) => openCandidate(id, "interviews")} week={week} /> : <>
      {Object.entries(byDay).map(([key, day]) => <Panel key={key} title={dayLong(day[0].scheduled_at)} subtitle={plural(day.length, "entretien")}><ul className="rh-agenda">{day.map((it) => <li key={it.id}><time>{timeOnly(it.scheduled_at)}<small>{it.duration_min} min</small></time><Avatar name={it.candidate_name} /><div><strong>{it.candidate_name}</strong><span>{it.job_title} · {modeLabel(it.mode)} · {it.interviewer_email}</span></div><Badge tone={INTERVIEW_STATUS_TONES[it.status]}>{INTERVIEW_STATUS_LABELS[it.status]}</Badge><button className="rh-btn is-sm" onClick={() => openCandidate(it.application_id, "interviews")} type="button">Ouvrir le dossier</button></li>)}</ul></Panel>)}
      {!loading && !error && !items.length ? <Empty icon="interviews" title="Aucun entretien sur cette période">Planifiez un entretien depuis ce bouton ou depuis la fiche d'un candidat.</Empty> : null}
    </>}
  </div>;
}
