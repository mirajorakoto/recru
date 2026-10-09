import { useEffect, useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { apiRequest, CATEGORY_LABELS, DECISION_LABELS, DECISION_TONES, dateShort, dateTime, eventDetail, EVENT_LABELS, EVENT_TONES, exportCandidatesCsv, fmtScore, friendlyError, json, PIPELINE_LABELS, PIPELINE_MAIN, PIPELINE_STATUSES, plural, PROCESSING_LABELS, relativeDay, stageOf } from "./lib";
import { Avatar, Badge, Drawer, Empty, ErrorNote, Field, Icon, Loading, PageHeader, Panel, RichEditor, ScoreBreakdown, ScorePanel, StageBadge, Tabs, useApi, useApp } from "./ui";
import { CandidateInterviews } from "./Interviews";

/* ---------------------------------------------------------------- composants */
export function ScoreCell({ score }) {
  if (score == null) return <span className="rh-muted">—</span>;
  const tone = score >= 80 ? "green" : score >= 60 ? "blue" : score >= 40 ? "amber" : "red";
  return <span className="rh-scorecell"><b>{score}</b><span className={`rh-track is-${tone}`}><span style={{ width: `${Math.min(100, score)}%` }} /></span></span>;
}
const aiState = (c) => c.processing_status === "analysis_ready" ? ["indigo", "Analyse prête"] : c.processing_status === "analysis_failed" ? ["red", "Échec — à relancer"] : ["slate", PROCESSING_LABELS[c.processing_status] || "En attente"];

/* ------------------------------------------------------------ page liste */
export function CandidatesPage({ candidates, offers, filters, setFilters, nextCursor, loadMore, refresh, openCandidate, canWrite, onNew }) {
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("");
  const [sort, setSort] = useState("recent");
  const counts = useMemo(() => candidates.reduce((all, c) => ({ ...all, [stageOf(c)]: (all[stageOf(c)] || 0) + 1 }), {}), [candidates]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = candidates.filter((c) => (!stage || stageOf(c) === stage) && (!needle || `${c.full_name} ${c.email} ${c.job_title} ${c.reference || ""}`.toLowerCase().includes(needle)));
    return sort === "score" ? [...filtered].sort((a, b) => (b.match_score ?? -1) - (a.match_score ?? -1))
      : sort === "final" ? [...filtered].sort((a, b) => (b.final_score ?? -1) - (a.final_score ?? -1)) : filtered;
  }, [candidates, q, stage, sort]);
  const setFilter = (name, value) => setFilters((current) => ({ ...current, [name]: value }));
  return <div className="rh-page">
    <PageHeader actions={<><button className="rh-btn" onClick={() => exportCandidatesCsv(rows)} type="button"><Icon name="download" size={16} />Exporter</button>{canWrite ? <button className="rh-btn is-primary" onClick={onNew} type="button"><Icon name="plus" size={16} />Nouvelle candidature</button> : null}</>} subtitle={`${plural(candidates.length, "candidature")} chargée${candidates.length > 1 ? "s" : ""}${nextCursor ? ", d'autres sont disponibles" : ""}.`} title="Candidatures" />
    <div className="rh-chips" role="group" aria-label="Filtrer par étape">
      <button aria-pressed={!stage} className={!stage ? "is-on" : ""} onClick={() => setStage("")} type="button">Toutes <b>{candidates.length}</b></button>
      {PIPELINE_STATUSES.map(([value, label]) => <button aria-pressed={stage === value} className={stage === value ? "is-on" : ""} key={value} onClick={() => setStage(stage === value ? "" : value)} type="button">{label} <b>{counts[value] || 0}</b></button>)}
    </div>
    <div className="rh-toolbar">
      <label className="rh-searchbox"><Icon name="search" size={16} /><input aria-label="Filtrer la liste" onChange={(e) => setQ(e.target.value)} placeholder="Filtrer par nom, référence, email ou poste" value={q} /></label>
      <select aria-label="Offre" onChange={(e) => setFilter("job_id", e.target.value)} value={filters.job_id}><option value="">Toutes les offres</option>{offers.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}</select>
      <select aria-label="Traitement IA" onChange={(e) => setFilter("processing_status", e.target.value)} value={filters.processing_status}><option value="">Tous les traitements</option>{Object.entries(PROCESSING_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <select aria-label="Décision RH" onChange={(e) => setFilter("hr_decision", e.target.value)} value={filters.hr_decision}><option value="">Toutes les décisions</option>{Object.entries(DECISION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <select aria-label="Tri" onChange={(e) => setSort(e.target.value)} value={sort}><option value="recent">Plus récentes</option><option value="score">Meilleur score IA</option><option value="final">Meilleur score final</option></select>
      <button aria-label="Actualiser" className="rh-icon-btn" onClick={refresh} type="button"><Icon name="refresh" /></button>
    </div>
    <div className="rh-table-wrap">
      <table className="rh-table"><thead><tr><th>Réf.</th><th>Candidat</th><th>Poste</th><th>Étape</th><th>Score IA</th><th>Score final</th><th>Analyse</th><th>Décision</th><th>Reçue</th></tr></thead>
        <tbody>{rows.map((c) => { const [tone, label] = aiState(c); return <tr key={c.id} onClick={() => openCandidate(c.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") openCandidate(c.id); }}>
          <td className="rh-nowrap"><code className="rh-ref">{c.reference || "—"}</code></td>
          <td><div className="rh-person"><Avatar name={c.full_name} /><div><strong>{c.full_name}</strong><small>{c.email}</small></div></div></td>
          <td>{c.job_title}</td><td><StageBadge status={stageOf(c)} /></td><td><ScoreCell score={c.match_score} /></td>
          <td className="rh-nowrap">{c.final_score != null ? <><b>{fmtScore(c.final_score)}</b><span className="rh-muted">/170</span></> : <span className="rh-muted">—</span>}</td>
          <td><Badge tone={tone}>{label}</Badge></td>
          <td>{c.hr_decision && c.hr_decision !== "to_review" ? <Badge tone={DECISION_TONES[c.hr_decision]}>{DECISION_LABELS[c.hr_decision]}</Badge> : <span className="rh-muted">—</span>}</td>
          <td className="rh-nowrap">{relativeDay(c.created_at)}</td></tr>; })}</tbody></table>
      {!rows.length ? <Empty icon="candidates" title="Aucune candidature ne correspond">Modifiez les filtres ou attendez de nouvelles candidatures.</Empty> : null}
    </div>
    {nextCursor ? <div className="rh-center"><button className="rh-btn" onClick={loadMore} type="button">Charger plus de candidatures</button></div> : null}
  </div>;
}

/* ------------------------------------------- saisie d'une candidature par le RH */
export function NewApplicationDrawer({ offers, onClose, onCreated }) {
  const { api, toast } = useApp();
  const published = offers.filter((o) => o.status === "published");
  const [form, setForm] = useState({ job_id: published[0]?.id || "", full_name: "", email: "", phone: "", candidate_location: "", portfolio_url: "", consent: false });
  const [files, setFiles] = useState({ cv: null, cover_letter: null });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const set = (name, value) => setForm((c) => ({ ...c, [name]: value }));
  async function submit(event) {
    event.preventDefault();
    if (!files.cv) { setError("Le CV (PDF ou DOCX) est requis."); return; }
    setPending(true); setError("");
    const body = new FormData();
    Object.entries({ ...form, consent: form.consent ? "true" : "" }).forEach(([k, v]) => body.append(k, v));
    body.append("cv", files.cv);
    if (files.cover_letter) body.append("cover_letter", files.cover_letter);
    try { const result = await apiRequest(api, "/candidatures", { method: "POST", body }); toast("Candidature enregistrée, analyse IA en file.", "success"); onCreated(result.candidature?.id); }
    catch (caught) { setError(caught.message); } finally { setPending(false); }
  }
  return <Drawer onClose={onClose} subtitle="Saisie d'un dossier reçu hors plateforme (CV déposé par le recruteur)." title="Nouvelle candidature"
    footer={<><button className="rh-btn" onClick={onClose} type="button">Annuler</button><button className="rh-btn is-primary" disabled={pending} form="rh-new-app" type="submit">{pending ? "Envoi…" : "Enregistrer et analyser"}</button></>}>
    <form className="rh-form" id="rh-new-app" onSubmit={submit}>
      <Field label="Offre"><select onChange={(e) => set("job_id", e.target.value)} required value={form.job_id}><option value="">Sélectionner une offre publiée</option>{published.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}</select></Field>
      <div className="rh-grid-2">
        <Field label="Nom complet"><input onChange={(e) => set("full_name", e.target.value)} required value={form.full_name} /></Field>
        <Field label="Email"><input onChange={(e) => set("email", e.target.value)} required type="email" value={form.email} /></Field>
        <Field label="Téléphone"><input onChange={(e) => set("phone", e.target.value)} type="tel" value={form.phone} /></Field>
        <Field label="Localisation"><input onChange={(e) => set("candidate_location", e.target.value)} value={form.candidate_location} /></Field>
      </div>
      <Field label="Portfolio ou profil en ligne"><input onChange={(e) => set("portfolio_url", e.target.value)} placeholder="https://…" type="url" value={form.portfolio_url} /></Field>
      <div className="rh-grid-2">
        <Field hint="PDF ou DOCX sans macro." label="CV *"><input accept=".pdf,.docx" onChange={(e) => setFiles({ ...files, cv: e.target.files[0] || null })} required type="file" /></Field>
        <Field label="Lettre de motivation (facultatif)"><input accept=".pdf,.docx" onChange={(e) => setFiles({ ...files, cover_letter: e.target.files[0] || null })} type="file" /></Field>
      </div>
      <label className="rh-check"><input checked={form.consent} onChange={(e) => set("consent", e.target.checked)} required type="checkbox" />Le candidat a consenti au traitement de ses données pour ce recrutement.</label>
      <ErrorNote>{error}</ErrorNote>
    </form>
  </Drawer>;
}

/* ------------------------------------------------------------- fiche candidat */
function PipelineStepper({ candidate, canWrite, onMove }) {
  const status = stageOf(candidate);
  const index = PIPELINE_MAIN.indexOf(status);
  const effective = index >= 0 ? index : status === "en_analyse" ? 0 : -1;
  const side = ["en_attente", "refusee"].includes(status);
  return <div className="rh-stepper-wrap">
    <ol aria-label="Étapes du pipeline" className="rh-stepper">{PIPELINE_MAIN.map((step, i) => { const state = effective === i ? "is-current" : effective > i && !side ? "is-done" : ""; return <li className={state} key={step}><button disabled={!canWrite || step === status} onClick={() => onMove(step)} type="button"><i aria-hidden="true">{state === "is-done" ? <Icon name="check" size={12} /> : i + 1}</i><span>{PIPELINE_LABELS[step]}</span></button></li>; })}</ol>
    {canWrite ? <div className="rh-stepper-side"><button className={`rh-btn is-sm${status === "en_attente" ? " is-on" : ""}`} disabled={status === "en_attente"} onClick={() => onMove("en_attente")} type="button">Mettre en attente</button><button className="rh-btn is-sm is-quiet-danger" disabled={status === "refusee"} onClick={() => onMove("refusee")} type="button">Refuser</button></div> : null}
  </div>;
}

const assessTone = { supported: ["green", "Confirmé"], not_found: ["red", "Non détecté"], uncertain: ["amber", "À confirmer"] };
const sourceLabel = { cv: "CV", cover_letter: "Lettre", none: "—" };
const questionGroups = [["technical", "Techniques"], ["project", "Projet"], ["behavioral", "Comportement"], ["verification_points", "Points à vérifier"]];

function Chips({ items, tone = "slate" }) {
  const list = (items || []).filter(Boolean);
  return list.length ? <div className="rh-pills">{list.map((item) => <span className={`is-${tone}`} key={item}>{item}</span>)}</div> : <p className="rh-muted">Non détecté.</p>;
}

function QuestionsPanel({ candidate, onChanged, canWrite }) {
  const { api, toast } = useApp();
  const [pending, setPending] = useState(false);
  const questions = candidate.interview_questions;
  async function generate() {
    setPending(true);
    try { await apiRequest(api, `/candidatures/${candidate.id}/interview-questions`, { method: "POST", body: "{}" }); toast("Questions d'entretien générées.", "success"); onChanged(); }
    catch (caught) { toast(friendlyError(caught), "error"); } finally { setPending(false); }
  }
  return <Panel actions={canWrite ? <button className="rh-btn is-sm is-ai" disabled={pending} onClick={generate} type="button"><Icon name="sparkles" size={14} />{pending ? "Génération…" : questions ? "Régénérer" : "Générer"}</button> : null} ai subtitle="Proposées par l'IA à partir de l'offre et du CV. À adapter par le recruteur." title="Questions d'entretien">
    {questions ? <div className="rh-qgrid">{questionGroups.map(([key, label]) => (questions[key] || []).length ? <div key={key}><h4>{label}</h4><ul>{questions[key].map((q, i) => <li key={i}>{q}</li>)}</ul></div> : null)}</div> : <p className="rh-muted">Aucune question générée pour le moment.</p>}
  </Panel>;
}

function AnalysisTab({ candidate, onChanged, canWrite }) {
  const { api, confirm, toast } = useApp();
  const [pending, setPending] = useState(false);
  const analysis = candidate.analysis;
  async function retry() {
    if (!(await confirm({ title: "Relancer l'analyse IA ?", message: "Le dossier est remis en file d'attente.", confirmLabel: "Relancer" }))) return;
    setPending(true);
    try { await apiRequest(api, `/candidatures/${candidate.id}/retry-analysis`, { method: "POST", body: "{}" }); toast("Analyse remise en file.", "success"); onChanged(); }
    catch (caught) { toast(friendlyError(caught), "error"); } finally { setPending(false); }
  }
  if (!analysis) {
    const failed = candidate.processing_status === "analysis_failed";
    return <Empty icon={failed ? "alert" : "clock"} title={failed ? "L'analyse n'a pas abouti" : "Analyse en cours"} action={<div className="rh-actions is-center">{failed && canWrite ? <button className="rh-btn is-primary" disabled={pending} onClick={retry} type="button">{pending ? "Relance…" : "Relancer l'analyse"}</button> : null}<button className="rh-btn" onClick={onChanged} type="button"><Icon name="refresh" size={16} />Actualiser</button></div>}>{candidate.analysis_error || "Le CV est en file d'attente. Le résultat apparaîtra ici automatiquement après actualisation."}</Empty>;
  }
  const profile = analysis.profile || {};
  return <div className="rh-stack">
    <Panel ai subtitle={`Générée le ${dateTime(candidate.analyzed_at)} · Validation humaine requise`} title="Synthèse du profil"><p className="rh-summary">{analysis.summary}</p></Panel>
    <ScorePanel analysis={analysis} />
    <Panel subtitle="Chaque critère de l'offre est comparé aux éléments du CV, avec sa preuve." title="Détail par critère">
      <div className="rh-table-wrap is-flat"><table className="rh-table is-static"><thead><tr><th>Critère</th><th>Résultat</th><th>Élément relevé</th><th>Source</th></tr></thead>
        <tbody>{(analysis.criteria || []).map((item) => { const [tone, label] = assessTone[item.assessment] || assessTone.uncertain; return <tr key={item.criterion}>
          <td><strong>{item.criterion}</strong><small>{CATEGORY_LABELS[item.category] || "Compétence"} · {item.required ? "Obligatoire" : "Souhaité"}</small></td>
          <td><Badge tone={tone}>{label}</Badge></td><td className="rh-evidence">{item.evidence || "—"}</td><td>{sourceLabel[item.source] || "—"}</td></tr>; })}</tbody></table></div>
    </Panel>
    <Panel subtitle="Extraites automatiquement ; à vérifier sur le CV original." title="Informations extraites">
      <div className="rh-two">
        <div><h4>Compétences</h4><Chips items={profile.skills} tone="blue" /><h4>Technologies</h4><Chips items={profile.technologies} tone="indigo" /></div>
        <div><h4>Langues</h4><Chips items={profile.languages} /><h4>Certifications</h4><Chips items={profile.certifications} /></div>
        <div><h4>Formations</h4>{(profile.education || []).length ? <ul className="rh-plain">{profile.education.map((e, i) => <li key={i}><strong>{e.degree}</strong><small>{e.institution}</small></li>)}</ul> : <p className="rh-muted">Non détecté.</p>}</div>
        <div><h4>Expériences</h4>{(profile.experiences || []).length ? <ul className="rh-plain">{profile.experiences.map((e, i) => <li key={i}><strong>{e.title}</strong><small>{e.company}{e.duration ? ` · ${e.duration}` : ""}</small></li>)}</ul> : <p className="rh-muted">Non détecté.</p>}</div>
      </div>
    </Panel>
    {(analysis.missing_information?.length || analysis.uncertainties?.length) ? <div className="rh-two">
      {analysis.missing_information?.length ? <div className="rh-alert is-warn is-block"><strong>Informations absentes</strong><ul>{analysis.missing_information.map((p, i) => <li key={i}>{p}</li>)}</ul></div> : null}
      {analysis.uncertainties?.length ? <div className="rh-alert is-warn is-block"><strong>Points incertains à clarifier</strong><ul>{analysis.uncertainties.map((p, i) => <li key={i}>{p}</li>)}</ul></div> : null}
    </div> : null}
    <QuestionsPanel candidate={candidate} canWrite={canWrite} onChanged={onChanged} />
    {analysis.score?.formula ? <details className="rh-details"><summary>Méthode de calcul du score</summary><p>{analysis.score.formula}</p><p className="rh-muted">Pondérations définies pour le prototype ; elles ne mesurent pas la qualité d'un candidat.</p></details> : null}
  </div>;
}

function CvTab({ candidate, files }) {
  const { api } = useApp();
  const docs = files || [];
  const [fileId, setFileId] = useState(docs[0]?.id);
  const file = docs.find((f) => f.id === fileId) || docs[0];
  const url = file ? `${api}/candidatures/${candidate.id}/fichiers/${file.id}` : "";
  const [view, setView] = useState({ url: "", pdf: false, error: "", loading: Boolean(file) });
  useEffect(() => {
    if (!file) return undefined;
    let objectUrl = ""; let cancelled = false;
    setView({ url: "", pdf: false, error: "", loading: true });
    fetch(url, { credentials: "include" }).then(async (response) => {
      if (!response.ok) throw new Error("Le document n'a pas pu être chargé.");
      const blob = await response.blob();
      const pdf = /\.pdf$/i.test(file.original_name || "") || file.mime_type === "application/pdf";
      objectUrl = URL.createObjectURL(pdf ? new Blob([blob], { type: "application/pdf" }) : blob);
      if (!cancelled) setView({ url: objectUrl, pdf, error: "", loading: false });
    }).catch((caught) => { if (!cancelled) setView({ url: "", pdf: false, error: caught.message, loading: false }); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url]);
  if (!file) return <Empty icon="file" title="Aucun document">Aucun CV n'est rattaché à cette candidature.</Empty>;
  return <div className="rh-stack">
    <div className="rh-row-between">
      <div className="rh-segment">{docs.map((f) => <button className={f.id === file.id ? "is-on" : ""} key={f.id} onClick={() => setFileId(f.id)} type="button">{f.kind === "cv" ? "CV" : "Lettre de motivation"}</button>)}</div>
      <div className="rh-actions"><a className="rh-btn is-sm" download={file.original_name} href={view.url || url}><Icon name="download" size={14} />Télécharger</a>{view.pdf ? <a className="rh-btn is-sm" href={view.url} rel="noreferrer" target="_blank"><Icon name="external" size={14} />Plein écran</a> : null}</div>
    </div>
    <p className="rh-muted">{file.original_name}{file.size_bytes ? ` · ${Math.round(file.size_bytes / 1024)} Ko` : ""} · Stocké chiffré (AES-256-GCM)</p>
    {view.loading ? <Loading label="Chargement du document…" /> : view.error ? <ErrorNote>{view.error}</ErrorNote> : view.pdf ? <iframe className="rh-cv-frame" src={view.url} title={`Document de ${candidate.full_name}`} /> : <Empty icon="file" title="Aperçu indisponible pour ce format">Les fichiers DOCX se consultent après téléchargement.</Empty>}
  </div>;
}

function HrScorePanel({ candidate, onChanged, canWrite }) {
  const { api, toast } = useApp();
  const [score, setScore] = useState(candidate.hr_score ?? 10);
  const [comment, setComment] = useState(candidate.hr_score_comment || "");
  const [pending, setPending] = useState(false);
  async function save(event) {
    event.preventDefault(); setPending(true);
    try { await apiRequest(api, `/candidatures/${candidate.id}/score-rh`, { method: "PATCH", body: json({ score, comment }) }); toast("Note RH enregistrée.", "success"); onChanged(); }
    catch (caught) { toast(friendlyError(caught), "error"); } finally { setPending(false); }
  }
  return <Panel subtitle="Analyse IA (/100) + entretien (/50) + votre note (/20). Le classement de l'offre se met à jour automatiquement." title="Score final">
    <ScoreBreakdown candidate={candidate} />
    {canWrite ? <form className="rh-form rh-mt" onSubmit={save}>
      <label className="rh-field"><span>Note RH : {score}/20</span><input aria-label="Note RH sur 20" max="20" min="0" onChange={(e) => setScore(Number(e.target.value))} step="1" type="range" value={score} /></label>
      <Field label="Justification (facultatif)"><textarea maxLength={2000} onChange={(e) => setComment(e.target.value)} placeholder="Motivation, savoir-être, adéquation à l'équipe…" rows="2" value={comment} /></Field>
      <div className="rh-actions"><button className="rh-btn is-primary" disabled={pending} type="submit">{candidate.hr_score != null ? "Mettre à jour la note" : "Enregistrer la note"}</button>{candidate.hr_score_by ? <span className="rh-muted">Dernière note par {candidate.hr_score_by}</span> : null}</div>
    </form> : null}
  </Panel>;
}

function DecisionTab({ candidate, onChanged, canWrite }) {
  const { api, confirm, toast } = useApp();
  const [draft, setDraft] = useState(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState("");
  const evaluations = useApi(`/candidatures/${candidate.id}/evaluations`);
  const evals = evaluations.data?.evaluations || [];
  async function createDraft() {
    setBusy("draft");
    try { const result = await apiRequest(api, `/candidatures/${candidate.id}/email-draft`, { method: "POST", body: "{}" }); setDraft(result.draft); setKey(window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`); }
    catch (caught) { toast(friendlyError(caught), "error"); } finally { setBusy(""); }
  }
  async function decide(decision) {
    const ok = await confirm({ title: `Passer la décision à « ${DECISION_LABELS[decision]} » ?`, message: "Cette action est tracée dans le journal d'audit. La décision finale revient toujours à un humain habilité.", confirmLabel: "Confirmer la décision", tone: decision === "rejected" ? "danger" : "primary" });
    if (!ok) return;
    setBusy("decision");
    try { await apiRequest(api, `/candidatures/${candidate.id}/decision`, { method: "PATCH", body: json({ decision }) }); toast("Décision enregistrée.", "success"); setDraft(null); onChanged(); if (decision === "selected") await createDraft(); }
    catch (caught) { toast(friendlyError(caught), "error"); } finally { setBusy(""); }
  }
  async function send() {
    if (!(await confirm({ title: "Envoyer cet email ?", message: `L'envoi à ${draft.recipient} est définitif.`, confirmLabel: "Envoyer" }))) return;
    setBusy("email");
    try { await apiRequest(api, `/candidatures/${candidate.id}/emails/send`, { method: "POST", body: json({ confirmed: true, idempotency_key: key, subject: draft.subject, html: draft.html }) }); toast("Email envoyé.", "success"); setDraft(null); onChanged(); }
    catch (caught) { toast(friendlyError(caught), "error"); } finally { setBusy(""); }
  }
  const options = [["to_review", "À revoir"], ["selected", "Retenir"], ["rejected", "Refuser"], ["withdrawn", "Retiré"]];
  return <div className="rh-stack">
    <HrScorePanel candidate={candidate} canWrite={canWrite} onChanged={onChanged} />
    <div className="rh-decision">
      <div><span className="rh-muted">Décision actuelle</span><strong>{candidate.hr_decision ? <Badge tone={DECISION_TONES[candidate.hr_decision]}>{DECISION_LABELS[candidate.hr_decision]}</Badge> : "Aucune"}</strong></div>
      <p><Icon name="shield" size={16} />L'IA fournit une analyse ; la décision est prise par un recruteur. Le CV, l'analyse, la justification et la décision restent conservés ensemble.</p>
    </div>
    {canWrite ? <div className="rh-decision-actions">{options.map(([value, label]) => <button className={`rh-btn${candidate.hr_decision === value ? " is-on" : ""}${value === "rejected" ? " is-quiet-danger" : value === "selected" ? " is-primary" : ""}`} disabled={Boolean(busy) || candidate.hr_decision === value} key={value} onClick={() => decide(value)} type="button">{label}</button>)}</div> : <p className="rh-muted">Rôle lecteur : consultation uniquement.</p>}
    {candidate.hr_decision === "selected" && canWrite && !draft ? <button className="rh-btn" disabled={busy === "draft"} onClick={createDraft} type="button"><Icon name="mail" size={16} />Préparer l'email de sélection</button> : null}
    {draft ? <Panel ai subtitle={`Destinataire : ${draft.recipient}${draft.reply_to ? ` · Réponse à : ${draft.reply_to}` : ""}`} title="Email proposé par l'IA">
      <div className="rh-form"><Field label="Objet"><input onChange={(e) => setDraft({ ...draft, subject: e.target.value })} value={draft.subject} /></Field>
        <Field label="Message"><RichEditor onChange={(html) => setDraft({ ...draft, html })} value={draft.html} /></Field>
        <details className="rh-details"><summary>Aperçu tel que reçu</summary><div className="rh-preview" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(draft.html) }} /></details>
        <div className="rh-actions"><button className="rh-btn" onClick={() => setDraft(null)} type="button">Fermer</button><button className="rh-btn is-primary" disabled={busy === "email"} onClick={send} type="button">{busy === "email" ? "Envoi…" : "Confirmer et envoyer"}</button></div></div>
    </Panel> : null}
    <Panel subtitle="Entretiens réalisés et notes des évaluateurs." title="Évaluations">
      {evals.length ? <ul className="rh-eval-list">{evals.map((e) => <li key={e.id}><div><strong>{e.evaluator}</strong><Badge tone={e.recommendation === "favorable" ? "green" : e.recommendation === "defavorable" ? "red" : "amber"}>{e.recommendation}</Badge><span className="rh-muted">{e.total}/50</span></div>{e.comment ? <p>{e.comment}</p> : null}</li>)}</ul> : <p className="rh-muted">Aucune évaluation enregistrée.</p>}
    </Panel>
  </div>;
}

function ActivityTab({ candidate, version, onChanged, canWrite }) {
  const { api, toast } = useApp();
  const [text, setText] = useState("");
  const [only, setOnly] = useState("");
  const events = useApi(`/candidatures/${candidate.id}/events`, version);
  const list = (events.data?.evenements || []).filter((e) => !only || e.event_type === only);
  async function addNote(event) {
    event.preventDefault();
    try { await apiRequest(api, `/candidatures/${candidate.id}/notes`, { method: "POST", body: json({ text: text.trim() }) }); setText(""); toast("Note ajoutée.", "success"); onChanged(); }
    catch (caught) { toast(friendlyError(caught), "error"); }
  }
  return <div className="rh-stack">
    {canWrite ? <form className="rh-noteform" onSubmit={addNote}><textarea aria-label="Nouvelle note RH" maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder="Ajouter une note interne (justification, observation factuelle)…" rows="2" value={text} /><button className="rh-btn is-primary" disabled={!text.trim()} type="submit">Ajouter la note</button></form> : null}
    <div className="rh-row-between"><h3>Historique</h3><select aria-label="Filtrer l'historique" onChange={(e) => setOnly(e.target.value)} value={only}><option value="">Tout l'historique</option><option value="hr_note_added">Notes uniquement</option><option value="pipeline_status_changed">Changements d'étape</option><option value="hr_decision_changed">Décisions</option></select></div>
    <ErrorNote>{events.error}</ErrorNote>{events.loading && !events.data ? <Loading /> : null}
    <ol className="rh-timeline">{list.map((event) => <li className={`is-${EVENT_TONES[event.event_type] || "slate"}`} key={event.id}><i aria-hidden="true" /><div><div className="rh-row-between"><strong>{EVENT_LABELS[event.event_type] || event.event_type}</strong><small>{relativeDay(event.created_at)}</small></div>{eventDetail(event) ? <p className={event.event_type === "hr_note_added" ? "rh-note-text" : ""}>{eventDetail(event)}</p> : null}<small className="rh-muted">{event.actor}</small></div></li>)}</ol>
    {!events.loading && !list.length ? <p className="rh-muted">Aucun événement.</p> : null}
  </div>;
}

function ProfileTab({ candidate, files, onErase, isAdmin }) {
  const { api } = useApp();
  return <div className="rh-stack">
    <Panel title="Coordonnées"><dl className="rh-kv">
      <div><dt>Référence</dt><dd><code className="rh-ref">{candidate.reference || "—"}</code></dd></div>
      <div><dt>Email (identifiant)</dt><dd><a href={`mailto:${candidate.email}`}>{candidate.email}</a></dd></div>
      <div><dt>Téléphone</dt><dd>{candidate.phone || "—"}</dd></div>
      <div><dt>Localisation</dt><dd>{candidate.candidate_location || "—"}</dd></div>
      <div><dt>Portfolio</dt><dd>{candidate.portfolio_url ? <a href={candidate.portfolio_url} rel="noreferrer noopener" target="_blank">{candidate.portfolio_url}</a> : "—"}</dd></div>
      <div><dt>Candidature reçue</dt><dd>{dateTime(candidate.created_at)}</dd></div>
      <div><dt>Consentement</dt><dd>{candidate.consent_at ? dateTime(candidate.consent_at) : "—"}</dd></div>
      <div><dt>Diplôme détecté</dt><dd>{candidate.education_level || "—"}</dd></div>
      <div><dt>Expérience détectée</dt><dd>{candidate.experience_years != null ? `${candidate.experience_years} an(s)` : "—"}</dd></div>
    </dl></Panel>
    <Panel subtitle="Chaque téléchargement est journalisé." title="Documents">{(files || []).length ? <ul className="rh-plain">{files.map((f) => <li key={f.id}><a href={`${api}/candidatures/${candidate.id}/fichiers/${f.id}`}><Icon name="file" size={14} /> {f.kind === "cv" ? "CV" : "Lettre de motivation"} — {f.original_name}</a></li>)}</ul> : <p className="rh-muted">Aucun document.</p>}</Panel>
    {isAdmin ? <Panel subtitle="Droit à l'effacement : supprime le dossier, les CV chiffrés, les entretiens et les évaluations." title="Protection des données"><button className="rh-btn is-danger" onClick={onErase} type="button"><Icon name="trash" size={16} />Effacer définitivement ce candidat</button></Panel> : null}
  </div>;
}

export function CandidateDrawer({ id, initialTab = "analysis", onClose }) {
  const { api, perms, confirm, toast, refreshCore } = useApp();
  const [tab, setTab] = useState(initialTab);
  const [version, setVersion] = useState(0);
  const { data, error, loading } = useApi(`/candidatures/${id}`, version);
  useEffect(() => setTab(initialTab), [id, initialTab]);
  const reload = () => { setVersion((v) => v + 1); refreshCore(); };
  const candidate = data?.candidature;
  async function move(status) {
    if (!(await confirm({ title: `Passer à « ${PIPELINE_LABELS[status]} » ?`, message: "Le changement d'étape est tracé et peut notifier le candidat.", confirmLabel: "Changer d'étape" }))) return;
    try { await apiRequest(api, `/candidatures/${id}/pipeline`, { method: "PATCH", body: json({ status }) }); toast("Étape mise à jour.", "success"); reload(); }
    catch (caught) { toast(friendlyError(caught), "error"); }
  }
  async function erase() {
    if (!(await confirm({ title: "Effacer définitivement ce dossier ?", message: "Données, CV chiffrés, entretiens et évaluations seront supprimés. Cette action est irréversible.", confirmLabel: "Effacer", tone: "danger" }))) return;
    if (!(await confirm({ title: "Dernière confirmation", message: `Supprimer toutes les données de ${candidate.full_name} ?`, confirmLabel: "Supprimer toutes les données", tone: "danger" }))) return;
    try { await apiRequest(api, `/candidatures/${id}`, { method: "DELETE" }); toast("Dossier effacé.", "success"); refreshCore(); onClose(); }
    catch (caught) { toast(friendlyError(caught), "error"); }
  }
  function printDossier() {
    const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const rows = (candidate.analysis?.criteria || []).map((i) => `<tr><td>${esc(i.criterion)}</td><td>${esc(assessTone[i.assessment]?.[1])}</td><td>${esc(i.evidence)}</td></tr>`).join("");
    const notes = (candidate.notes || []).map((n) => `<li>${esc(n.text)} <small>— ${esc(n.actor)}, ${esc(dateShort(n.created_at))}</small></li>`).join("");
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Dossier — ${esc(candidate.full_name)}</title><style>body{font-family:Inter,system-ui,sans-serif;color:#0f172a;max-width:760px;margin:2rem auto;padding:0 1.5rem;line-height:1.5}h1{margin:0}h2{font-size:1.05rem;border-bottom:1px solid #cbd5e1;padding-bottom:.3rem;margin-top:1.8rem}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:.45rem;border-bottom:1px solid #e2e8f0;vertical-align:top}.muted{color:#475569}@media print{button{display:none}}</style></head><body><h1>${esc(candidate.full_name)}</h1><p class="muted">${esc(candidate.job_title)} — ${esc(PIPELINE_LABELS[stageOf(candidate)])}${candidate.match_score != null ? ` — Score indicatif ${esc(candidate.match_score)}/100` : ""}</p><h2>Coordonnées</h2><p>${esc(candidate.email)} — ${esc(candidate.phone || "—")}</p>${candidate.analysis ? `<h2>Analyse IA (consultative, validation humaine requise)</h2><p>${esc(candidate.analysis.summary)}</p><table><thead><tr><th>Critère</th><th>Résultat</th><th>Élément relevé</th></tr></thead><tbody>${rows}</tbody></table>` : ""}<h2>Décision</h2><p>${esc(DECISION_LABELS[candidate.hr_decision] || "Aucune décision enregistrée")}</p><h2>Notes RH</h2><ul>${notes || "<li>Aucune note.</li>"}</ul><button onclick="window.print()">Imprimer</button></body></html>`;
    const win = window.open(URL.createObjectURL(new Blob([html], { type: "text/html" })), "_blank");
    if (!win) toast("Le navigateur a bloqué l'ouverture de la fenêtre d'impression.", "error");
  }
  const canWrite = perms.write;
  return <Drawer onClose={onClose} title={candidate ? candidate.full_name : "Candidature"} subtitle={candidate ? `${candidate.reference ? `${candidate.reference} · ` : ""}${candidate.job_title} · reçue ${relativeDay(candidate.created_at)}` : ""} wide>
    {loading && !candidate ? <Loading /> : null}<ErrorNote>{error}</ErrorNote>
    {candidate ? <>
      <div className="rh-cand-head">
        <Avatar name={candidate.full_name} size={52} />
        <div className="rh-badges"><StageBadge status={stageOf(candidate)} />{candidate.hr_decision ? <Badge tone={DECISION_TONES[candidate.hr_decision]}>{DECISION_LABELS[candidate.hr_decision]}</Badge> : null}{candidate.match_score != null ? <Badge tone="indigo">Score IA {candidate.match_score}/100</Badge> : null}{candidate.final_score != null ? <Badge tone="blue">Final {fmtScore(candidate.final_score)}/170</Badge> : null}</div>
        <button className="rh-btn is-sm" onClick={printDossier} type="button"><Icon name="file" size={14} />Dossier imprimable</button>
      </div>
      <PipelineStepper candidate={candidate} canWrite={canWrite} onMove={move} />
      <Tabs label="Sections du dossier" onChange={setTab} tabs={[["analysis", "Analyse IA"], ["cv", "CV", (data.fichiers || []).length], ["interviews", "Entretiens"], ["decision", "Décision"], ["activity", "Activité"], ["profile", "Profil"]]} value={tab} />
      <div className="rh-tabpanel" role="tabpanel">
        {tab === "analysis" ? <AnalysisTab candidate={candidate} canWrite={canWrite} onChanged={reload} /> : null}
        {tab === "cv" ? <CvTab candidate={candidate} files={data.fichiers} /> : null}
        {tab === "interviews" ? <CandidateInterviews candidate={candidate} canWrite={canWrite} onChanged={reload} /> : null}
        {tab === "decision" ? <DecisionTab candidate={candidate} canWrite={canWrite} onChanged={reload} /> : null}
        {tab === "activity" ? <ActivityTab candidate={candidate} canWrite={canWrite} onChanged={reload} version={version} /> : null}
        {tab === "profile" ? <ProfileTab candidate={candidate} files={data.fichiers} isAdmin={perms.admin} onErase={erase} /> : null}
      </div>
    </> : null}
  </Drawer>;
}
