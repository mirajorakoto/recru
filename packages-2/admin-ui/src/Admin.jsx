import { useEffect, useState } from "react";
import { apiRequest, CATEGORY_LABELS, CATEGORY_WEIGHTS, dateTime, downloadCsv, eventDetail, EVENT_LABELS, EVENT_TONES, friendlyError, JOB_NEXT_LABELS, json, PIPELINE_LABELS, PIPELINE_STATUSES, plural, parseDbDate, relativeDay, ROLE_LABELS, STAFF_ROLES } from "./lib";
import { Avatar, Badge, BarChart, Donut, Empty, ErrorNote, Field, HBars, Icon, Loading, PageHeader, Panel, Tabs, Toggle, useApi, useApp } from "./ui";
import { Kpi } from "./Dashboard";

/* ---------------------------------------------------------- équipe & comptes */
export function TeamPage() {
  const { api, me, confirm, toast } = useApp();
  const [tab, setTab] = useState("staff");
  const [version, setVersion] = useState(0);
  const [form, setForm] = useState({ email: "", role: "recruteur" });
  const [search, setSearch] = useState("");
  const staff = useApi("/equipe", version);
  const accounts = useApi(tab === "accounts" ? "/comptes?limit=200" : null, version);
  const reload = () => setVersion((v) => v + 1);
  async function save(member, patch) {
    try { await apiRequest(api, "/equipe", { method: "POST", body: json({ email: member.email, role: member.role, active: Boolean(member.active), ...patch }) }); toast("Équipe mise à jour.", "success"); reload(); }
    catch (caught) { toast(friendlyError(caught), "error"); }
  }
  async function add(event) {
    event.preventDefault();
    try { await apiRequest(api, "/equipe", { method: "POST", body: json({ ...form, active: true }) }); setForm({ email: "", role: "recruteur" }); toast("Membre ajouté.", "success"); reload(); }
    catch (caught) { toast(friendlyError(caught), "error"); }
  }
  async function toggleAccount(account) {
    const next = account.active ? "desactiver" : "activer";
    if (!(await confirm({ title: `${account.active ? "Désactiver" : "Réactiver"} ce compte ?`, message: account.email, confirmLabel: account.active ? "Désactiver" : "Réactiver", tone: account.active ? "danger" : "primary" }))) return;
    try { await apiRequest(api, `/comptes/${account.id}/${next}`, { method: "POST", body: "{}" }); toast("Compte mis à jour.", "success"); reload(); }
    catch (caught) { toast(friendlyError(caught), "error"); }
  }
  async function eraseAccount(account) {
    if (!(await confirm({ title: "Effacer ce compte candidat ?", message: `${account.email} et ses candidatures seront supprimés définitivement.`, confirmLabel: "Effacer", tone: "danger" }))) return;
    try { await apiRequest(api, `/comptes/${account.id}`, { method: "DELETE" }); toast("Compte effacé.", "success"); reload(); }
    catch (caught) { toast(friendlyError(caught), "error"); }
  }
  const members = staff.data?.membres || [];
  const accs = (accounts.data?.comptes || []).filter((a) => !search || `${a.email} ${a.full_name}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="rh-page">
    <PageHeader subtitle="Gérez les rôles du personnel RH et les comptes candidats." title="Utilisateurs et rôles" />
    <Tabs label="Utilisateurs" onChange={setTab} tabs={[["staff", "Équipe RH", members.length], ["accounts", "Comptes candidats"], ["roles", "Rôles et permissions"]]} value={tab} />
    {tab === "staff" ? <>
      <Panel subtitle="Un membre se connecte via le portail administrateur existant ; son rôle est défini ici." title="Ajouter un membre">
        <form className="rh-inline-form" onSubmit={add}><input aria-label="Email du membre" onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="prenom.nom@entreprise.com" required type="email" value={form.email} /><select aria-label="Rôle" onChange={(e) => setForm({ ...form, role: e.target.value })} value={form.role}>{STAFF_ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select><button className="rh-btn is-primary" type="submit"><Icon name="plus" size={16} />Ajouter</button></form>
      </Panel>
      <ErrorNote>{staff.error}</ErrorNote>
      <div className="rh-table-wrap"><table className="rh-table is-static"><thead><tr><th>Membre</th><th>Rôle</th><th>Actif</th></tr></thead><tbody>{members.map((m) => <tr key={m.email}>
        <td><div className="rh-person"><Avatar name={m.email} /><div><strong>{m.email}</strong>{m.email === me?.email ? <small>Vous</small> : null}</div></div></td>
        <td><select aria-label={`Rôle de ${m.email}`} onChange={(e) => save(m, { role: e.target.value })} value={m.role}>{STAFF_ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
        <td><Toggle checked={Boolean(m.active)} label={m.active ? "Actif" : "Désactivé"} onChange={(v) => save(m, { active: v })} /></td></tr>)}</tbody></table>
        {!staff.loading && !members.length ? <Empty icon="team" title="Aucun membre">Ajoutez le premier membre de l'équipe RH.</Empty> : null}</div>
    </> : null}
    {tab === "accounts" ? <>
      <div className="rh-toolbar"><label className="rh-searchbox"><Icon name="search" size={16} /><input aria-label="Rechercher un compte" onChange={(e) => setSearch(e.target.value)} placeholder="Nom ou email" value={search} /></label></div>
      <ErrorNote>{accounts.error}</ErrorNote>{accounts.loading ? <Loading /> : null}
      <div className="rh-table-wrap"><table className="rh-table is-static"><thead><tr><th>Candidat</th><th>Statut</th><th>Dernière connexion</th><th>Inscrit</th><th /></tr></thead><tbody>{accs.map((a) => <tr key={a.id}>
        <td><div className="rh-person"><Avatar name={a.full_name || a.email} /><div><strong>{a.full_name}</strong><small>{a.email}</small></div></div></td>
        <td><Badge dot tone={a.active ? "green" : "slate"}>{a.active ? "Actif" : "Désactivé"}</Badge></td><td>{a.last_login_at ? relativeDay(a.last_login_at) : "Jamais"}</td><td>{relativeDay(a.created_at)}</td>
        <td><div className="rh-rowactions"><button className="rh-btn is-sm" onClick={() => toggleAccount(a)} type="button">{a.active ? "Désactiver" : "Réactiver"}</button><button aria-label={`Effacer ${a.email}`} className="rh-icon-btn is-danger" onClick={() => eraseAccount(a)} type="button"><Icon name="trash" size={16} /></button></div></td></tr>)}</tbody></table>
        {!accounts.loading && !accs.length ? <Empty icon="candidates" title="Aucun compte candidat" /> : null}</div>
    </> : null}
    {tab === "roles" ? <div className="rh-grid-3">
      {[["Administrateur", "admin", ["Gérer l'équipe et les comptes", "Modifier les paramètres IA", "Consulter le journal d'audit", "Effacer des données (droit à l'effacement)", "Tous les droits du recruteur"]], ["Recruteur / RH", "recruteur", ["Créer et publier des offres", "Consulter CV et analyses IA", "Planifier et évaluer les entretiens", "Changer étapes et décisions", "Envoyer les emails de sélection"]], ["Lecteur", "lecteur", ["Consulter offres et candidatures", "Voir tableaux de bord et agenda", "Aucune modification possible"]]].map(([title, key, items]) => <Panel key={key} subtitle={key === me?.role ? "Votre rôle actuel" : undefined} title={title}><ul className="rh-ticks">{items.map((i) => <li key={i}><Icon name="check" size={14} />{i}</li>)}</ul></Panel>)}
    </div> : null}
  </div>;
}

/* ------------------------------------------------------------ journal d'audit */
export function JournalPage({ openCandidate }) {
  const [filters, setFilters] = useState({ event_type: "", actor: "", application_id: "" });
  const [before, setBefore] = useState([]); // pile de curseurs
  const cursor = before[before.length - 1];
  const params = new URLSearchParams({ limit: "50" });
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
  if (cursor) params.set("before_id", String(cursor));
  const { data, error, loading } = useApi(`/audit?${params}`);
  const events = data?.events || [];
  const set = (name, value) => { setBefore([]); setFilters((c) => ({ ...c, [name]: value })); };
  return <div className="rh-page">
    <PageHeader actions={<button className="rh-btn" disabled={!events.length} onClick={() => downloadCsv("journal-audit.csv", ["Date", "Événement", "Acteur", "Candidature", "Détail"], events.map((e) => [e.created_at, EVENT_LABELS[e.event_type] || e.event_type, e.actor, e.application_id || "", eventDetail(e)]))} type="button"><Icon name="download" size={16} />Exporter la page</button>} subtitle="Traçabilité des accès sensibles, décisions et modifications (réservé aux administrateurs)." title="Journal d'audit" />
    <div className="rh-toolbar">
      <select aria-label="Type d'événement" onChange={(e) => set("event_type", e.target.value)} value={filters.event_type}><option value="">Tous les événements</option>{Object.entries(EVENT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <input aria-label="Acteur" onChange={(e) => set("actor", e.target.value)} placeholder="Acteur (email)" value={filters.actor} />
      <input aria-label="Numéro de candidature" min="1" onChange={(e) => set("application_id", e.target.value)} placeholder="N° de candidature" type="number" value={filters.application_id} />
    </div>
    <ErrorNote>{error}</ErrorNote>{loading && !data ? <Loading /> : null}
    <div className="rh-table-wrap"><table className="rh-table is-static"><thead><tr><th>Date</th><th>Événement</th><th>Acteur</th><th>Détail</th><th /></tr></thead><tbody>{events.map((e) => <tr key={e.id}>
      <td className="rh-nowrap">{dateTime(parseDbDate(e.created_at))}</td>
      <td><Badge tone={EVENT_TONES[e.event_type] || "slate"}>{EVENT_LABELS[e.event_type] || e.event_type}</Badge></td><td>{e.actor}</td><td className="rh-evidence">{eventDetail(e) || "—"}</td>
      <td>{e.application_id ? <button className="rh-link" onClick={() => openCandidate(e.application_id)} type="button">Dossier n° {e.application_id}</button> : null}</td></tr>)}</tbody></table>
      {!loading && !events.length ? <Empty icon="journal" title="Aucun événement" /> : null}</div>
    <div className="rh-center rh-actions"><button className="rh-btn" disabled={!before.length} onClick={() => setBefore(before.slice(0, -1))} type="button">Plus récents</button><button className="rh-btn" disabled={!data?.next_before_id} onClick={() => setBefore([...before, data.next_before_id])} type="button">Plus anciens</button></div>
  </div>;
}

/* ----------------------------------------------------------------- paramètres */
const AI_FIELDS = [["technical", "Preuves techniques", "Ex. : privilégier les projets réalisés et technologies citées."], ["communication", "Communication", "Ex. : relever les expériences d'équipe ou de présentation."], ["experience", "Expérience", "Ex. : distinguer stages, alternance et emplois."], ["clarify", "Points à clarifier", "Ex. : signaler les périodes ou technologies imprécises."]];

export function SettingsPage({ theme, setTheme }) {
  const { api, perms, toast } = useApp();
  const [tab, setTab] = useState("ai");
  const { data, loading } = useApi(perms.admin ? "/parametres/analyse-ia" : null);
  const [draft, setDraft] = useState(null);
  const [pending, setPending] = useState(false);
  useEffect(() => { if (data?.parametres) setDraft({ criteria: { technical: "", communication: "", experience: "", clarify: "", ...(data.parametres.criteria || {}) }, options: { summaryOnly: true, requireHumanReview: true, hideIrrelevant: true, ...(data.parametres.options || {}) } }); }, [data]);
  async function save(event) {
    event.preventDefault(); setPending(true);
    try { await apiRequest(api, "/parametres/analyse-ia", { method: "PATCH", body: json(draft) }); toast("Paramètres de l'analyse IA enregistrés.", "success"); }
    catch (caught) { toast(friendlyError(caught), "error"); } finally { setPending(false); }
  }
  return <div className="rh-page">
    <PageHeader subtitle="Orientation de l'analyse IA, règles du pipeline, protection des données et affichage." title="Paramètres" />
    <Tabs label="Paramètres" onChange={setTab} tabs={[["ai", "Analyse IA"], ["score", "Score et pipeline"], ["data", "Données et sécurité"], ["display", "Affichage"]]} value={tab} />
    {tab === "ai" ? (perms.admin ? (loading || !draft ? <Loading /> : <form className="rh-stack" onSubmit={save}>
      <Panel ai subtitle="Ces consignes orientent les preuves que l'IA cherche dans les CV. Elles n'influencent jamais la décision." title="Consignes d'analyse">
        <div className="rh-form">{AI_FIELDS.map(([key, label, hint]) => <Field hint={hint} key={key} label={label}><textarea maxLength={500} onChange={(e) => setDraft({ ...draft, criteria: { ...draft.criteria, [key]: e.target.value } })} rows="2" value={draft.criteria[key]} /></Field>)}</div>
      </Panel>
      <Panel title="Garde-fous">
        <Toggle checked={draft.options.requireHumanReview} hint="Rappelle que l'analyse est consultative." label="Exiger la validation humaine" onChange={(v) => setDraft({ ...draft, options: { ...draft.options, requireHumanReview: v } })} />
        <Toggle checked={draft.options.summaryOnly} hint="Évite la reproduction du CV dans la synthèse." label="Synthèse concise uniquement" onChange={(v) => setDraft({ ...draft, options: { ...draft.options, summaryOnly: v } })} />
        <Toggle checked={draft.options.hideIrrelevant} hint="Ne retient que les informations utiles au poste." label="Masquer les informations hors sujet" onChange={(v) => setDraft({ ...draft, options: { ...draft.options, hideIrrelevant: v } })} />
      </Panel>
      <div className="rh-actions"><button className="rh-btn is-primary" disabled={pending} type="submit">{pending ? "Enregistrement…" : "Enregistrer"}</button></div>
    </form>) : <Empty icon="shield" title="Réservé aux administrateurs">Seul un administrateur peut modifier les consignes d'analyse IA.</Empty>) : null}
    {tab === "score" ? <div className="rh-stack">
      <Panel subtitle="Pondérations du prototype : elles ne mesurent pas la valeur d'un candidat." title="Formule du score explicable">
        <HBars format={(v) => `${v} pts`} rows={Object.entries(CATEGORY_WEIGHTS).map(([k, v]) => ({ label: CATEGORY_LABELS[k], value: v }))} tone="indigo" />
        <p className="rh-fineprint">Score = 0,40 × compétences + 0,20 × expérience + 0,15 × formation + 0,10 × langues + 0,15 × autres critères. Les catégories absentes de l'offre sont renormalisées.</p>
      </Panel>
      <Panel title="Étapes du pipeline"><ol className="rh-steplist">{PIPELINE_STATUSES.map(([v, l]) => <li key={v}><Badge tone={PIPELINE_STATUSES.find(([x]) => x === v)[2]}>{l}</Badge></li>)}</ol></Panel>
      <Panel title="Cycle de vie d'une offre"><p>Brouillon → {JOB_NEXT_LABELS.published} → {JOB_NEXT_LABELS.closed} → {JOB_NEXT_LABELS.archived}. Une offre publiée exige au moins un critère et une date limite future.</p></Panel>
    </div> : null}
    {tab === "data" ? <div className="rh-grid-3">
      {[["CV chiffrés", "Les documents sont stockés chiffrés (AES-256-GCM), avec empreinte d'intégrité."], ["Accès journalisés", "Consultations de dossiers, téléchargements et décisions sont tracés dans le journal d'audit."], ["Conservation limitée", "Les dossiers des offres clôturées sont purgés automatiquement après la durée de rétention configurée."], ["Droit à l'effacement", "Un administrateur peut effacer un candidat ou un compte depuis sa fiche."], ["Décision humaine", "L'IA fournit des indications explicables ; aucune décision n'est automatique."], ["Données minimales", "Seules les informations nécessaires au recrutement sont collectées."]].map(([t, d]) => <Panel key={t} title={t}><p>{d}</p></Panel>)}
    </div> : null}
    {tab === "display" ? <Panel title="Thème"><div className="rh-segment" role="radiogroup" aria-label="Thème">{[["system", "Système"], ["light", "Clair"], ["dark", "Sombre"]].map(([v, l]) => <button aria-checked={theme === v} className={theme === v ? "is-on" : ""} key={v} onClick={() => setTheme(v)} role="radio" type="button">{l}</button>)}</div></Panel> : null}
  </div>;
}

/* -------------------------------------------------------------------- rapports */
export function ReportsPage({ candidates, navigate }) {
  const { data, error, loading } = useApi("/tableau-de-bord");
  if (loading && !data) return <div className="rh-page"><Loading /></div>;
  if (error) return <div className="rh-page"><ErrorNote>{error}</ErrorNote></div>;
  const t = data.totals || {}; const by = data.candidatures_par_statut || {};
  const total = t.candidatures || 0;
  const rate = (n) => (total ? `${Math.round((n / total) * 100)} %` : "—");
  const month = (m) => { const [y, mo] = String(m).split("-"); return new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit" }).format(new Date(Number(y), Number(mo) - 1, 1)); };
  const funnel = ["nouvelle", "cv_analyse", "preselectionnee", "entretien", "evaluation", "acceptee"];
  return <div className="rh-page">
    <PageHeader actions={<button className="rh-btn" onClick={() => downloadCsv("rapport-recrutement.csv", ["Indicateur", "Valeur"], [["Offres", t.offres], ["Offres publiées", t.offres_publiees], ["Candidatures", t.candidatures], ["Entretiens", t.entretiens], ["Recrutés", t.recrutes], ["Score IA moyen", t.score_moyen], ...Object.entries(by).map(([k, v]) => [`Statut : ${PIPELINE_LABELS[k] || k}`, v]), ...(data.candidatures_par_offre || []).map((r) => [`Offre : ${r.title}`, r.n])])} type="button"><Icon name="download" size={16} />Exporter le rapport</button>} subtitle="Indicateurs de suivi du recrutement sur l'ensemble des offres." title="Rapports et statistiques" />
    <div className="rh-kpis"><Kpi icon="candidates" label="Candidatures" value={total} /><Kpi icon="check" label="Taux de présélection" tone="blue" value={rate((by.preselectionnee || 0) + (by.entretien || 0) + (by.evaluation || 0) + (by.acceptee || 0))} /><Kpi icon="interviews" label="Passés en entretien" tone="amber" value={rate((by.entretien || 0) + (by.evaluation || 0) + (by.acceptee || 0))} /><Kpi icon="shield" label="Taux de recrutement" tone="green" value={rate(by.acceptee || 0)} /><Kpi icon="sparkles" label="Score IA moyen" tone="blue" value={t.score_moyen ?? "—"} /></div>
    <div className="rh-grid-main">
      <Panel title="Évolution des candidatures"><BarChart ariaLabel="Candidatures par mois" data={(data.candidatures_par_mois || []).map((r) => ({ label: month(r.mois), value: r.n }))} /></Panel>
      <Panel title="Statuts"><Donut centerLabel="dossiers" data={PIPELINE_STATUSES.filter(([v]) => by[v]).map(([v, l]) => ({ label: l, value: by[v] }))} /></Panel>
    </div>
    <div className="rh-grid-3">
      <Panel title="Entonnoir"><HBars rows={funnel.map((v) => ({ label: PIPELINE_LABELS[v], value: by[v] || 0 }))} /></Panel>
      <Panel title="Candidatures par offre"><HBars rows={(data.candidatures_par_offre || []).map((r) => ({ label: r.title, value: r.n, hint: r.score_moyen != null ? `score ${r.score_moyen}` : "" }))} /></Panel>
      <Panel title="Compétences les plus présentes"><HBars rows={(data.competences_frequentes || []).map((s) => ({ label: s.skill, value: s.n }))} tone="indigo" /></Panel>
    </div>
  </div>;
}

/* -------------------------------------------------------------------- alertes */
export function AlertsPage({ navigate, openCandidate, isAdmin }) {
  const { data } = useApi("/tableau-de-bord");
  const audit = useApi(isAdmin ? "/audit?limit=15" : null);
  const a = data?.alertes || {};
  const items = [[a.analyses_echouees, "analyse(s) IA en échec : relancez-les depuis la fiche du candidat", "candidates", "alert", "red"], [a.entretiens_aujourdhui, "entretien(s) prévu(s) aujourd'hui", "interviews", "interviews", "amber"], [a.nouvelles_24h, "nouvelle(s) candidature(s) reçue(s) en 24 h", "candidates", "candidates", "blue"], [a.a_traiter, "dossier(s) à traiter", "pipeline", "clock", "slate"], [a.entretiens_a_venir, "entretien(s) à venir", "interviews", "calendar", "slate"]].filter(([n]) => n > 0);
  return <div className="rh-page">
    <PageHeader subtitle="Ce qui demande votre attention maintenant." title="Alertes" />
    {items.length ? <ul className="rh-notifs">{items.map(([n, text, page, icon, tone]) => <li key={text}><span className={`rh-kpi-icon is-${tone}`}><Icon name={icon === "calendar" ? "interviews" : icon} size={18} /></span><div><strong>{n}</strong> {text}</div><button className="rh-btn is-sm" onClick={() => navigate(page)} type="button">Voir</button></li>)}</ul> : <Empty icon="check" title="Tout est à jour">Aucune alerte pour le moment.</Empty>}
    {isAdmin ? <Panel subtitle="Activité récente du système" title="Derniers événements"><ol className="rh-timeline">{(audit.data?.events || []).map((e) => <li className={`is-${EVENT_TONES[e.event_type] || "slate"}`} key={e.id}><i /><div><div className="rh-row-between"><strong>{EVENT_LABELS[e.event_type] || e.event_type}</strong><small>{relativeDay(e.created_at)}</small></div>{eventDetail(e) ? <p>{eventDetail(e)}</p> : null}<small className="rh-muted">{e.actor}{e.application_id ? <> · <button className="rh-link" onClick={() => openCandidate(e.application_id)} type="button">Dossier n° {e.application_id}</button></> : null}</small></div></li>)}</ol></Panel> : null}
  </div>;
}
