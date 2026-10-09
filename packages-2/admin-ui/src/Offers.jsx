import { useMemo, useState } from "react";
import { apiRequest, CATEGORY_LABELS, CATEGORY_WEIGHTS, CONTRACT_TYPES, dateShort, friendlyError, JOB_NEXT, JOB_NEXT_LABELS, JOB_STATUS_LABELS, JOB_STATUS_TONES, json, plural, SENIORITY, slugify, toLocalInput, WORK_MODES } from "./lib";
import { Badge, Drawer, Empty, ErrorNote, Field, Icon, PageHeader, Tabs, Toggle, useApi, useApp } from "./ui";

const blankJob = { slug: "", title: "", summary: "", description: "", location: "Fianarantsoa", work_mode: "onsite", contract_type: "stage", employer_type: "techzone", partner_name: "", status: "draft", urgent: false, criteria: [], department: "", required_diploma: "", required_experience: "", seniority: "", languages: [], application_deadline: "", image_media_id: "", sender_display_name: "", reply_to: "", signature_html: "" };

function CriteriaBuilder({ criteria, onChange }) {
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("competence");
  const [required, setRequired] = useState(true);
  function add() {
    const text = label.trim();
    if (!text || criteria.length >= 30 || criteria.some((c) => c.label.toLowerCase() === text.toLowerCase())) return;
    onChange([...criteria, { label: text, required, category }]);
    setLabel("");
  }
  const groups = [[true, "Obligatoires"], [false, "Souhaités"]];
  const present = [...new Set(criteria.map((c) => c.category))];
  const weightSum = present.reduce((s, c) => s + CATEGORY_WEIGHTS[c], 0) || 1;
  return <fieldset className="rh-fieldset"><legend>Critères de matching</legend>
    <p className="rh-muted">Ces critères alimentent l'analyse IA et le score explicable. Un critère obligatoire pèse double.</p>
    <div className="rh-criteria-add">
      <input aria-label="Nouveau critère" maxLength={300} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder="Ex. : Java, Spring Boot, Bac+3, Anglais courant" value={label} />
      <select aria-label="Catégorie" onChange={(e) => setCategory(e.target.value)} value={category}>{Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <label className="rh-check"><input checked={required} onChange={(e) => setRequired(e.target.checked)} type="checkbox" />Obligatoire</label>
      <button className="rh-btn is-primary" disabled={!label.trim() || criteria.length >= 30} onClick={add} type="button"><Icon name="plus" size={16} />Ajouter</button>
    </div>
    <div className="rh-two">{groups.map(([flag, title]) => { const items = criteria.map((c, i) => ({ ...c, i })).filter((c) => Boolean(c.required) === flag); return <div key={title}><h4>{title} <span className="rh-muted">({items.length})</span></h4>
      <ul className="rh-criteria">{items.map((c) => <li key={c.i}><span><strong>{c.label}</strong><small>{CATEGORY_LABELS[c.category] || "Compétence"}</small></span>
        <button aria-label={`Basculer ${c.label} en ${flag ? "souhaité" : "obligatoire"}`} className="rh-icon-btn" onClick={() => onChange(criteria.map((x, j) => j === c.i ? { ...x, required: !x.required } : x))} title={flag ? "Rendre souhaité" : "Rendre obligatoire"} type="button"><Icon name="refresh" size={14} /></button>
        <button aria-label={`Retirer ${c.label}`} className="rh-icon-btn" onClick={() => onChange(criteria.filter((_, j) => j !== c.i))} type="button"><Icon name="close" size={14} /></button></li>)}{!items.length ? <li className="rh-muted">Aucun.</li> : null}</ul></div>; })}</div>
    {present.length ? <p className="rh-fineprint">Pondération appliquée : {present.map((c) => `${CATEGORY_LABELS[c]} ${Math.round((CATEGORY_WEIGHTS[c] / weightSum) * 100)} %`).join(", ")}.</p> : null}
  </fieldset>;
}

function JobEditor({ job, onClose, onSaved }) {
  const { api, toast } = useApp();
  const editing = Boolean(job?.id);
  const [draft, setDraft] = useState(() => ({ ...blankJob, ...(job || {}), languages: job?.languages || [], criteria: job?.criteria || [], application_deadline: job?.application_deadline ? toLocalInput(job.application_deadline) : "", image_media_id: job?.image_media_id || "" }));
  const [languages, setLanguages] = useState((job?.languages || []).join(", "));
  const [slugTouched, setSlugTouched] = useState(editing);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const set = (name, value) => setDraft((c) => ({ ...c, [name]: value }));
  const statuses = editing ? [job.status, ...(JOB_NEXT[job.status] || [])] : ["draft", "published"];
  async function submit(event) {
    event.preventDefault();
    setError("");
    if (draft.status === "published" && !draft.criteria.length) { setError("Une offre publiée doit contenir au moins un critère."); return; }
    const deadline = draft.application_deadline ? new Date(draft.application_deadline) : null;
    if (draft.status === "published" && deadline && deadline.getTime() <= Date.now()) { setError("Une offre publiée doit avoir une date limite future."); return; }
    const body = { title: draft.title, slug: draft.slug, summary: draft.summary, description: draft.description, location: draft.location, work_mode: draft.work_mode, contract_type: draft.contract_type, employer_type: draft.employer_type, status: draft.status, urgent: Boolean(draft.urgent), criteria: draft.criteria, department: draft.department, required_diploma: draft.required_diploma, required_experience: draft.required_experience, seniority: draft.seniority, languages: languages.split(",").map((s) => s.trim()).filter(Boolean), application_deadline: deadline ? deadline.toISOString() : null, image_media_id: draft.image_media_id ? Number(draft.image_media_id) : null, sender_display_name: draft.sender_display_name, reply_to: draft.reply_to, signature_html: draft.signature_html };
    if (draft.employer_type === "partner") body.partner_name = draft.partner_name;
    setPending(true);
    try { await apiRequest(api, editing ? `/offres/${job.id}` : "/offres", { method: editing ? "PATCH" : "POST", body: json(body) }); toast(editing ? "Offre mise à jour." : "Offre créée.", "success"); onSaved(); }
    catch (caught) { setError(caught.message); } finally { setPending(false); }
  }
  return <Drawer onClose={onClose} subtitle="Titre, conditions et critères utilisés par le module IA." title={editing ? "Modifier l'offre" : "Nouvelle offre"} wide
    footer={<><ErrorNote>{error}</ErrorNote><button className="rh-btn" onClick={onClose} type="button">Annuler</button><button className="rh-btn is-primary" disabled={pending} form="rh-job" type="submit">{pending ? "Enregistrement…" : "Enregistrer l'offre"}</button></>}>
    <form className="rh-form" id="rh-job" onSubmit={submit}>
      <fieldset className="rh-fieldset"><legend>Poste</legend>
        <div className="rh-grid-2">
          <Field label="Titre"><input onChange={(e) => { set("title", e.target.value); if (!slugTouched) set("slug", slugify(e.target.value)); }} required value={draft.title} /></Field>
          <Field hint="Adresse publique de l'offre : minuscules, chiffres et tirets." label="Identifiant (slug)"><input onChange={(e) => { setSlugTouched(true); set("slug", slugify(e.target.value)); }} pattern="[a-z0-9]+(-[a-z0-9]+)*" required value={draft.slug} /></Field>
          <Field label="Département"><input onChange={(e) => set("department", e.target.value)} value={draft.department || ""} /></Field>
          <Field label="Localisation"><input onChange={(e) => set("location", e.target.value)} required value={draft.location} /></Field>
          <Field label="Type de contrat"><select onChange={(e) => set("contract_type", e.target.value)} value={draft.contract_type}>{CONTRACT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Mode de travail"><select onChange={(e) => set("work_mode", e.target.value)} value={draft.work_mode}>{WORK_MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Employeur"><select onChange={(e) => set("employer_type", e.target.value)} value={draft.employer_type}><option value="techzone">TechZone</option><option value="partner">Partenaire</option></select></Field>
          {draft.employer_type === "partner" ? <Field label="Nom du partenaire"><input onChange={(e) => set("partner_name", e.target.value)} required value={draft.partner_name || ""} /></Field> : null}
        </div>
        <Field hint={`${draft.summary.length}/300`} label="Résumé"><textarea maxLength={300} onChange={(e) => set("summary", e.target.value)} required rows="2" value={draft.summary} /></Field>
        <Field label="Description"><textarea onChange={(e) => set("description", e.target.value)} required rows="7" value={draft.description} /></Field>
      </fieldset>
      <fieldset className="rh-fieldset"><legend>Profil recherché</legend>
        <div className="rh-grid-2">
          <Field label="Diplôme requis"><input onChange={(e) => set("required_diploma", e.target.value)} placeholder="Bac+3" value={draft.required_diploma || ""} /></Field>
          <Field label="Expérience requise"><input onChange={(e) => set("required_experience", e.target.value)} placeholder="0–2 ans" value={draft.required_experience || ""} /></Field>
          <Field label="Niveau recherché"><select onChange={(e) => set("seniority", e.target.value)} value={draft.seniority || ""}>{SENIORITY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field hint="Séparées par une virgule." label="Langues"><input onChange={(e) => setLanguages(e.target.value)} placeholder="Français, Anglais" value={languages} /></Field>
        </div>
      </fieldset>
      <CriteriaBuilder criteria={draft.criteria} onChange={(criteria) => set("criteria", criteria)} />
      <fieldset className="rh-fieldset"><legend>Publication</legend>
        <div className="rh-grid-2">
          <Field hint={editing ? "Un statut ne peut qu'avancer : brouillon → publiée → clôturée → archivée." : undefined} label="Statut"><select onChange={(e) => set("status", e.target.value)} value={draft.status}>{statuses.map((s) => <option key={s} value={s}>{JOB_STATUS_LABELS[s]}</option>)}</select></Field>
          <Field label="Date limite de candidature"><input onChange={(e) => set("application_deadline", e.target.value)} type="datetime-local" value={draft.application_deadline} /></Field>
        </div>
        <Toggle checked={Boolean(draft.urgent)} hint="Mise en avant sur le portail candidat." label="Offre urgente" onChange={(v) => set("urgent", v)} />
      </fieldset>
      <details className="rh-details"><summary>Emails et visuel (avancé)</summary>
        <div className="rh-grid-2">
          <Field label="Nom d'expéditeur affiché"><input maxLength={120} onChange={(e) => set("sender_display_name", e.target.value)} value={draft.sender_display_name || ""} /></Field>
          <Field label="Adresse de réponse"><input onChange={(e) => set("reply_to", e.target.value)} type="email" value={draft.reply_to || ""} /></Field>
          <Field label="Identifiant d'image (médiathèque)"><input min="1" onChange={(e) => set("image_media_id", e.target.value)} type="number" value={draft.image_media_id || ""} /></Field>
        </div>
        <Field hint="HTML autorisé : paragraphes, listes, liens https." label="Signature des emails"><textarea onChange={(e) => set("signature_html", e.target.value)} rows="3" value={draft.signature_html || ""} /></Field>
      </details>
    </form>
  </Drawer>;
}

export function OffersPage({ offers, candidates, refresh, canWrite, openJobCandidates, openRanking }) {
  const { api, confirm, toast } = useApp();
  const [tab, setTab] = useState("all");
  const [editing, setEditing] = useState(undefined);
  const stats = useApi("/tableau-de-bord");
  const perJob = useMemo(() => {
    const map = {};
    for (const row of stats.data?.candidatures_par_offre || []) map[row.job_id] = { n: row.n, score: row.score_moyen };
    for (const job of offers) if (!map[job.id]) map[job.id] = { n: candidates.filter((c) => c.job_id === job.id).length, score: null };
    return map;
  }, [stats.data, offers, candidates]);
  const counts = offers.reduce((all, j) => ({ ...all, [j.status]: (all[j.status] || 0) + 1 }), {});
  const rows = offers.filter((j) => tab === "all" || j.status === tab);
  async function transition(job, next) {
    const ok = await confirm({ title: `${JOB_NEXT_LABELS[next]} « ${job.title} » ?`, message: next === "published" ? "L'offre deviendra visible sur le portail candidat." : next === "closed" ? "Plus aucune candidature ne sera acceptée. Cette étape est irréversible." : "L'offre sera archivée. Cette étape est irréversible.", confirmLabel: JOB_NEXT_LABELS[next], tone: next === "published" ? "primary" : "danger" });
    if (!ok) return;
    try { await apiRequest(api, `/offres/${job.id}`, { method: "PATCH", body: json({ status: next }) }); toast("Statut mis à jour.", "success"); refresh(); }
    catch (caught) { toast(friendlyError(caught), "error"); }
  }
  async function remove(job) {
    if (!(await confirm({ title: `Supprimer « ${job.title} » ?`, message: "Seul un brouillon sans candidature peut être supprimé.", confirmLabel: "Supprimer", tone: "danger" }))) return;
    try { await apiRequest(api, `/offres/${job.id}`, { method: "DELETE" }); toast("Offre supprimée.", "success"); refresh(); }
    catch (caught) { toast(friendlyError(caught), "error"); }
  }
  const duplicate = (job) => setEditing({ ...job, id: undefined, title: `${job.title} (copie)`, slug: `${job.slug}-copie`, status: "draft", application_deadline: null });
  const kpis = [["Publiées", counts.published || 0], ["Brouillons", counts.draft || 0], ["Clôturées", counts.closed || 0], ["Candidatures", Object.values(perJob).reduce((s, j) => s + j.n, 0)]];
  return <div className="rh-page">
    <PageHeader actions={canWrite ? <button className="rh-btn is-primary" onClick={() => setEditing(null)} type="button"><Icon name="plus" size={16} />Nouvelle offre</button> : null} subtitle="Créez, publiez et suivez vos offres. Les critères alimentent le matching IA." title="Offres d'emploi" />
    <div className="rh-kpis is-compact">{kpis.map(([label, value]) => <div className="rh-kpi" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <Tabs label="Statut des offres" onChange={setTab} tabs={[["all", "Toutes", offers.length], ...Object.entries(JOB_STATUS_LABELS).map(([v, l]) => [v, l, counts[v] || 0])]} value={tab} />
    <div className="rh-table-wrap"><table className="rh-table is-static"><thead><tr><th>Offre</th><th>Contrat</th><th>Statut</th><th>Candidatures</th><th>Score moyen</th><th>Date limite</th><th><span className="rh-sr">Actions</span></th></tr></thead>
      <tbody>{rows.map((job) => { const stat = perJob[job.id] || { n: 0 }; const next = JOB_NEXT[job.status] || []; return <tr key={job.id}>
        <td><strong>{job.title}{job.urgent ? <Badge tone="red">Urgent</Badge> : null}</strong><small>{[job.department, job.location].filter(Boolean).join(" · ")} — {plural((job.criteria || []).length, "critère")}</small></td>
        <td>{(CONTRACT_TYPES.find(([v]) => v === job.contract_type) || [0, job.contract_type])[1]}</td>
        <td><Badge dot tone={JOB_STATUS_TONES[job.status]}>{JOB_STATUS_LABELS[job.status]}</Badge></td>
        <td><button className="rh-link" onClick={() => openJobCandidates(job.id)} type="button">{stat.n}</button></td>
        <td>{stat.score != null ? stat.score : "—"}</td><td className="rh-nowrap">{job.application_deadline ? dateShort(job.application_deadline) : "—"}{job.status === "published" && job.interviews_unlocked === false ? <small>Convocations après cette date</small> : null}</td>
        <td><div className="rh-rowactions">{stat.n ? <button className="rh-btn is-sm" onClick={() => openRanking(job.id)} type="button"><Icon name="reports" size={14} />Classement</button> : null}{canWrite ? <>
          <button aria-label={`Modifier ${job.title}`} className="rh-icon-btn" onClick={() => setEditing(job)} title="Modifier" type="button"><Icon name="edit" size={16} /></button>
          <button aria-label={`Dupliquer ${job.title}`} className="rh-icon-btn" onClick={() => duplicate(job)} title="Dupliquer" type="button"><Icon name="plus" size={16} /></button>
          {next.map((n) => <button className="rh-btn is-sm" key={n} onClick={() => transition(job, n)} type="button">{JOB_NEXT_LABELS[n]}</button>)}
          {job.status === "draft" && !stat.n ? <button aria-label={`Supprimer ${job.title}`} className="rh-icon-btn is-danger" onClick={() => remove(job)} title="Supprimer" type="button"><Icon name="trash" size={16} /></button> : null}
        </> : null}</div></td></tr>; })}</tbody></table>
      {!rows.length ? <Empty icon="offers" title="Aucune offre ici" action={canWrite ? <button className="rh-btn is-primary" onClick={() => setEditing(null)} type="button">Créer une offre</button> : null}>Les offres apparaîtront dans ce tableau.</Empty> : null}
    </div>
    {editing !== undefined ? <JobEditor job={editing} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); refresh(); }} /> : null}
  </div>;
}
