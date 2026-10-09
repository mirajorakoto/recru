import { useState } from "react";
import { DECISION_LABELS, DECISION_TONES, EDUCATION_OPTIONS, exportCandidatesCsv, PIPELINE_STATUSES, plural, relativeDay, stageOf } from "./lib";
import { Avatar, Badge, Empty, ErrorNote, Field, Icon, Loading, PageHeader, Panel, StageBadge, useApi, useDebounced } from "./ui";
import { ScoreCell } from "./Candidates";

const blank = { q: "", skills: [], education: "", min_experience: "", min_score: 0, job_id: "", pipeline_status: "", hr_decision: "", sort: "score" };
const PAGE = 25;

export function SearchPage({ offers, openCandidate }) {
  const [form, setForm] = useState(blank);
  const [skill, setSkill] = useState("");
  const [offset, setOffset] = useState(0);
  const debounced = useDebounced(form, 350);
  const set = (name, value) => { setOffset(0); setForm((c) => ({ ...c, [name]: value })); };
  const params = new URLSearchParams({ sort: debounced.sort, limit: String(PAGE), offset: String(offset) });
  if (debounced.q.trim()) params.set("q", debounced.q.trim());
  if (debounced.skills.length) params.set("skills", debounced.skills.join(","));
  ["education", "min_experience", "job_id", "pipeline_status", "hr_decision"].forEach((k) => { if (debounced[k] !== "") params.set(k, debounced[k]); });
  if (Number(debounced.min_score) > 0) params.set("min_score", String(debounced.min_score));
  const { data, error, loading } = useApi(`/candidatures/recherche?${params}`);
  const rows = data?.rows || []; const total = data?.total ?? 0;
  function addSkill(value = skill) {
    const parts = value.split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    set("skills", [...new Set([...form.skills, ...parts])].slice(0, 20)); setSkill("");
  }
  const active = form.q || form.skills.length || form.education || form.min_experience !== "" || Number(form.min_score) > 0 || form.job_id || form.pipeline_status || form.hr_decision;
  const presets = [["Java + Spring Boot + Bac+3 + présélectionnée", { skills: ["java", "spring boot"], education: "bac+3", pipeline_status: "preselectionnee" }], ["Forte correspondance (≥ 80)", { min_score: 80 }], ["Retenus par le RH", { hr_decision: "selected" }]];
  return <div className="rh-page">
    <PageHeader actions={<button className="rh-btn" disabled={!rows.length} onClick={() => exportCandidatesCsv(rows)} type="button"><Icon name="download" size={16} />Exporter les résultats</button>} subtitle="Combinez nom, compétences, diplôme, expérience, offre, statut et score de correspondance." title="Recherche avancée" />
    <div className="rh-search-layout">
      <Panel title="Critères">
        <div className="rh-form">
          <Field label="Nom, email ou mot-clé du profil"><label className="rh-searchbox is-field"><Icon name="search" size={16} /><input onChange={(e) => set("q", e.target.value)} placeholder="Ex. : Rakoto" value={form.q} /></label></Field>
          <Field hint="Entrée ou virgule pour ajouter. Toutes les compétences doivent être présentes." label="Compétences">
            <div className="rh-tagbox">{form.skills.map((s) => <span key={s}>{s}<button aria-label={`Retirer ${s}`} onClick={() => set("skills", form.skills.filter((x) => x !== s))} type="button"><Icon name="close" size={12} /></button></span>)}<input aria-label="Ajouter une compétence" maxLength={80} onBlur={() => addSkill()} onChange={(e) => e.target.value.endsWith(",") ? addSkill(e.target.value) : setSkill(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }} placeholder={form.skills.length ? "" : "Java, React, SQL…"} value={skill} /></div>
          </Field>
          <div className="rh-grid-2">
            <Field label="Diplôme"><select onChange={(e) => set("education", e.target.value)} value={form.education}>{EDUCATION_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="Expérience min. (ans)"><input min="0" onChange={(e) => set("min_experience", e.target.value)} step="0.5" type="number" value={form.min_experience} /></Field>
          </div>
          <Field label={`Score de correspondance minimum : ${form.min_score}`}><input max="100" min="0" onChange={(e) => set("min_score", e.target.value)} step="5" type="range" value={form.min_score} /></Field>
          <Field label="Offre"><select onChange={(e) => set("job_id", e.target.value)} value={form.job_id}><option value="">Toutes</option>{offers.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}</select></Field>
          <div className="rh-grid-2">
            <Field label="Étape"><select onChange={(e) => set("pipeline_status", e.target.value)} value={form.pipeline_status}><option value="">Toutes</option>{PIPELINE_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="Décision RH"><select onChange={(e) => set("hr_decision", e.target.value)} value={form.hr_decision}><option value="">Toutes</option>{Object.entries(DECISION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          </div>
          <Field label="Tri"><select onChange={(e) => set("sort", e.target.value)} value={form.sort}><option value="final">Meilleur score final d'abord</option><option value="score">Meilleur score IA d'abord</option><option value="recent">Plus récentes d'abord</option></select></Field>
          {active ? <button className="rh-btn" onClick={() => { setForm(blank); setOffset(0); }} type="button">Réinitialiser les critères</button> : null}
        </div>
        <h4 className="rh-mt">Recherches rapides</h4>
        <div className="rh-presets">{presets.map(([label, patch]) => <button className="rh-chip" key={label} onClick={() => { setOffset(0); setForm({ ...blank, ...patch }); }} type="button">{label}</button>)}</div>
      </Panel>
      <section aria-live="polite">
        <div className="rh-row-between rh-resulthead"><strong>{loading ? "Recherche…" : plural(total, "résultat")}</strong>{total > PAGE ? <div className="rh-pager"><button className="rh-btn is-sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))} type="button">Précédent</button><span>{offset + 1}–{Math.min(total, offset + PAGE)} sur {total}</span><button className="rh-btn is-sm" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)} type="button">Suivant</button></div> : null}</div>
        <ErrorNote>{error}</ErrorNote>{loading && !data ? <Loading /> : null}
        <div className="rh-table-wrap"><table className="rh-table"><thead><tr><th>Candidat</th><th>Poste</th><th>Score IA</th><th>Final /170</th><th>Expérience</th><th>Diplôme</th><th>Étape</th><th>Décision</th></tr></thead>
          <tbody>{rows.map((c) => <tr key={c.id} onClick={() => openCandidate(c.id)} onKeyDown={(e) => { if (e.key === "Enter") openCandidate(c.id); }} tabIndex={0}>
            <td><div className="rh-person"><Avatar name={c.full_name} /><div><strong>{c.full_name}</strong><small>{relativeDay(c.created_at)}</small></div></div></td><td>{c.job_title}</td><td><ScoreCell score={c.match_score} /></td>
            <td>{c.final_score != null ? c.final_score : "—"}</td>
            <td>{c.experience_years != null ? `${c.experience_years} an(s)` : "—"}</td><td>{c.education_level || "—"}</td><td><StageBadge status={stageOf(c)} /></td>
            <td>{c.hr_decision ? <Badge tone={DECISION_TONES[c.hr_decision]}>{DECISION_LABELS[c.hr_decision]}</Badge> : "—"}</td></tr>)}</tbody></table>
          {!loading && !rows.length && !error ? <Empty icon="search" title="Aucun profil ne correspond">Assouplissez un critère : les compétences sont cumulatives.</Empty> : null}</div>
      </section>
    </div>
  </div>;
}
