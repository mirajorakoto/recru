#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const issuesDirectory = path.join(repositoryRoot, "planning/github/issues");
const backlogDocument = path.join(repositoryRoot, "docs/10-backlog-github.md");
const repository = "hasiniaina7/techzone-recrutement";
const owner = "hasiniaina7";
const assignee = "mirajorakoto";
const projectTitle = "TechZone Recrutement — Livraison V1";

const sprintDefinitions = {
  S1: { title: "S1", startDate: "2026-08-06", due: "2026-08-12", milestone: "S1 — Socle fiable" },
  S2: { title: "S2", startDate: "2026-08-13", due: "2026-08-19", milestone: "S2 — Parcours candidat sécurisé" },
  S3: { title: "S3", startDate: "2026-08-20", due: "2026-08-26", milestone: "S3 — IA et API RH" },
  S4: { title: "S4", startDate: "2026-08-27", due: "2026-09-02", milestone: "S4 — Livraison V1" }
};

const labels = {
  "priority:must": { color: "b60205", description: "Exigence indispensable à la livraison V1" },
  "priority:should": { color: "1d76db", description: "Exigence à différer explicitement si la capacité manque" },
  "area:foundation": { color: "5319e7", description: "Socle, configuration et migrations" },
  "area:security": { color: "d93f0b", description: "Sécurité et confidentialité" },
  "area:public": { color: "0e8a16", description: "Parcours candidat public" },
  "area:ai": { color: "6f42c1", description: "Analyse assistée par IA" },
  "area:hr": { color: "fbca04", description: "Cockpit et décisions RH humaines" },
  "area:email": { color: "c5def5", description: "Brouillons et envois email" },
  "area:operations": { color: "0052cc", description: "Purge, déploiement et exploitation" }
};

function fail(message) {
  throw new Error(message);
}

function parseFrontmatter(filename) {
  const source = fs.readFileSync(filename, "utf8");
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) fail(`${path.basename(filename)}: frontmatter absent ou invalide.`);
  const metadata = {};
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 1) fail(`${path.basename(filename)}: métadonnée invalide: ${line}`);
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = JSON.parse(value);
    if (value === "true" || value === "false") value = value === "true";
    if (/^\d+$/.test(value)) value = Number(value);
    metadata[key] = value;
  }
  return {
    ...metadata,
    filename,
    body: match[2].trimEnd(),
    sourceIds: String(metadata.source_ids || "").split(",").filter(Boolean),
    dependencies: String(metadata.depends_on || "").split(",").filter((value) => value !== "none")
  };
}

function loadIssues() {
  return fs.readdirSync(issuesDirectory)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => parseFrontmatter(path.join(issuesDirectory, name)));
}

function parseBacklogRows() {
  const source = fs.readFileSync(backlogDocument, "utf8");
  return source.split("\n")
    .filter((line) => /^\| B-\d{3} \|/.test(line))
    .map((line) => {
      const columns = line.split("|").slice(1, -1).map((value) => value.trim());
      return { id: columns[0], points: Number(columns[4]), issue: columns[6] };
    });
}

function validateBacklog(issues) {
  const errors = [];
  const requiredKeys = ["id", "title", "sprint", "milestone", "due", "points", "priority", "area", "assignee", "publish", "source_ids", "depends_on"];
  const expectedIssueIds = Array.from({ length: 4 }, (_, sprintIndex) =>
    Array.from({ length: 3 }, (_, issueIndex) => `TZR-S${sprintIndex + 1}-0${issueIndex + 1}`)
  ).flat();
  const issueIds = new Set(issues.map((issue) => issue.id));

  if (issues.length !== 12) errors.push(`12 brouillons attendus, ${issues.length} trouvés.`);
  if (issueIds.size !== issues.length) errors.push("Les identifiants de brouillon ne sont pas uniques.");
  for (const id of expectedIssueIds) if (!issueIds.has(id)) errors.push(`Brouillon manquant: ${id}.`);

  const sourceOwners = new Map();
  for (const issue of issues) {
    for (const key of requiredKeys) {
      if (issue[key] === undefined || issue[key] === "") errors.push(`${issue.id || issue.filename}: métadonnée ${key} manquante.`);
    }
    if (!sprintDefinitions[issue.sprint]) errors.push(`${issue.id}: sprint invalide ${issue.sprint}.`);
    if (issue.milestone !== sprintDefinitions[issue.sprint]?.milestone) errors.push(`${issue.id}: milestone incohérent.`);
    if (issue.due !== sprintDefinitions[issue.sprint]?.due) errors.push(`${issue.id}: échéance incohérente.`);
    if (!Number.isInteger(issue.points) || issue.points < 1) errors.push(`${issue.id}: points invalides.`);
    if (!["Must", "Should"].includes(issue.priority)) errors.push(`${issue.id}: priorité invalide.`);
    if (issue.assignee !== assignee) errors.push(`${issue.id}: assignation attendue à ${assignee}.`);
    if ((issue.sprint === "S1" || issue.sprint === "S2") !== issue.publish) errors.push(`${issue.id}: indicateur publish incohérent.`);
    if (!issue.body.includes(`<!-- backlog-key: ${issue.id} -->`)) errors.push(`${issue.id}: marqueur anti-doublon absent.`);
    for (const dependency of issue.dependencies) {
      if (!issueIds.has(dependency)) errors.push(`${issue.id}: dépendance inconnue ${dependency}.`);
      if (dependency === issue.id) errors.push(`${issue.id}: auto-dépendance interdite.`);
    }
    for (const sourceId of issue.sourceIds) {
      if (!/^B-\d{3}$/.test(sourceId)) errors.push(`${issue.id}: ID Excel invalide ${sourceId}.`);
      if (sourceOwners.has(sourceId)) errors.push(`${sourceId}: affecté à ${sourceOwners.get(sourceId)} et ${issue.id}.`);
      sourceOwners.set(sourceId, issue.id);
    }
  }

  const expectedSourceIds = Array.from({ length: 75 }, (_, index) => `B-${String(index + 1).padStart(3, "0")}`);
  for (const sourceId of expectedSourceIds) if (!sourceOwners.has(sourceId)) errors.push(`ID Excel non couvert: ${sourceId}.`);
  for (const sourceId of sourceOwners.keys()) if (!expectedSourceIds.includes(sourceId)) errors.push(`ID Excel hors plage: ${sourceId}.`);

  const rows = parseBacklogRows();
  if (rows.length !== 75) errors.push(`Le document doit contenir 75 lignes de traçabilité, ${rows.length} trouvées.`);
  const historicalPoints = rows.reduce((total, row) => total + row.points, 0);
  if (historicalPoints !== 236) errors.push(`Le total Excel doit rester 236, valeur trouvée: ${historicalPoints}.`);
  for (const row of rows) {
    const ownerIssue = sourceOwners.get(row.id);
    if (ownerIssue !== row.issue) errors.push(`${row.id}: document=${row.issue}, brouillon=${ownerIssue}.`);
  }

  if (errors.length) fail(`Validation échouée:\n- ${errors.join("\n- ")}`);
  return { issueCount: issues.length, sourceCount: sourceOwners.size, historicalPoints };
}

function runGh(args, { input, allowFailure = false } = {}) {
  const result = spawnSync("gh", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    input,
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.status !== 0 && !allowFailure) {
    const detail = (result.stderr || result.stdout || "Erreur GitHub inconnue").trim();
    fail(`gh ${args.slice(0, 3).join(" ")} a échoué: ${detail}`);
  }
  return result;
}

function ghJson(args, options) {
  const result = runGh(args, options);
  if (result.status !== 0) return null;
  const output = result.stdout.trim();
  return output ? JSON.parse(output) : null;
}

function graphQl(query, variables) {
  const payload = ghJson(["api", "graphql", "--input", "-"], {
    input: JSON.stringify({ query, variables })
  });
  if (payload.errors?.length) fail(`GraphQL: ${payload.errors.map((error) => error.message).join("; ")}`);
  return payload.data;
}

function ensureLabels() {
  for (const [name, definition] of Object.entries(labels)) {
    runGh(["label", "create", name, "--repo", repository, "--color", definition.color, "--description", definition.description, "--force"]);
  }
}

function ensureMilestones(sprints) {
  const existing = ghJson(["api", `repos/${repository}/milestones?state=all&per_page=100`]) || [];
  for (const sprint of sprints) {
    const definition = sprintDefinitions[sprint];
    if (existing.some((milestone) => milestone.title === definition.milestone)) continue;
    runGh([
      "api", `repos/${repository}/milestones`, "--method", "POST",
      "-f", `title=${definition.milestone}`,
      "-f", `description=Objectif ${sprint} du backlog TechZone Recrutement`,
      "-f", `due_on=${definition.due}T20:59:59Z`
    ]);
  }
}

function createIterationField(projectId) {
  const query = `
    mutation($input: CreateProjectV2FieldInput!) {
      createProjectV2Field(input: $input) {
        projectV2Field {
          ... on ProjectV2IterationField {
            id
            name
          }
        }
      }
    }
  `;
  const iterations = Object.values(sprintDefinitions).map(({ title, startDate }) => ({ title, startDate, duration: 7 }));
  graphQl(query, {
    input: {
      projectId,
      dataType: "ITERATION",
      name: "Sprint",
      iterationConfiguration: { startDate: "2026-08-06", duration: 7, iterations }
    }
  });
}

function updateSingleSelectField(fieldId, name, optionNames) {
  const colors = ["GREEN", "YELLOW", "PURPLE", "RED", "BLUE", "ORANGE", "GRAY", "PINK"];
  const query = `
    mutation($input: UpdateProjectV2FieldInput!) {
      updateProjectV2Field(input: $input) {
        projectV2Field {
          ... on ProjectV2SingleSelectField { id name }
        }
      }
    }
  `;
  graphQl(query, {
    input: {
      fieldId,
      name,
      singleSelectOptions: optionNames.map((option, index) => ({
        name: option,
        color: colors[index % colors.length],
        description: `${name}: ${option}`
      }))
    }
  });
}

function projectFields(projectNumber) {
  const query = `
    query($owner: String!, $number: Int!) {
      user(login: $owner) {
        projectV2(number: $number) {
          fields(first: 100) {
            nodes {
              ... on ProjectV2IterationField {
                id
                name
                configuration {
                  iterations {
                    id
                    title
                    startDate
                  }
                }
              }
              ... on ProjectV2SingleSelectField {
                id
                name
                options {
                  id
                  name
                }
              }
              ... on ProjectV2Field {
                id
                name
              }
            }
          }
        }
      }
    }
  `;
  const data = graphQl(query, { owner, number: projectNumber });
  return data.user.projectV2.fields.nodes;
}

function ensureProject(sync) {
  const listed = ghJson(["project", "list", "--owner", owner, "--limit", "100", "--format", "json"]);
  let project = listed.projects.find((item) => item.title === projectTitle);
  let created = false;
  if (!project) {
    project = ghJson(["project", "create", "--owner", owner, "--title", projectTitle, "--format", "json"]);
    created = true;
  }
  runGh([
    "project", "edit", String(project.number), "--owner", owner,
    "--visibility", "PRIVATE",
    "--description", "Pilotage GitHub Flow de la livraison V1 du module TechZone Recrutement, du 6 août au 2 septembre 2026.",
    "--readme", "Les issues S1 et S2 sont publiées initialement. Les brouillons S3 et S4 sont revus le 19 août avant toute publication."
  ]);
  runGh(["project", "link", String(project.number), "--owner", owner, "--repo", "techzone-recrutement"]);

  let fields = projectFields(project.number);
  const desiredSelects = {
    Status: ["Ready", "In progress", "In review", "Blocked", "Done"],
    Priority: ["Must", "Should"],
    Area: ["Foundation", "Security", "Public", "AI", "HR", "Email", "Operations"]
  };
  for (const [name, options] of Object.entries(desiredSelects)) {
    let field = fields.find((candidate) => candidate.name === name);
    if (!field) {
      field = ghJson([
        "project", "field-create", String(project.number), "--owner", owner,
        "--name", name, "--data-type", "SINGLE_SELECT",
        "--single-select-options", options.join(","), "--format", "json"
      ]);
      fields = projectFields(project.number);
      continue;
    }
    const actualOptions = (field.options || []).map((option) => option.name);
    if (JSON.stringify(actualOptions) !== JSON.stringify(options)) {
      if (!created && !sync) fail(`Le champ ${name} existe avec d'autres options. Utiliser --sync pour l'aligner.`);
      updateSingleSelectField(field.id, name, options);
      fields = projectFields(project.number);
    }
  }

  if (!fields.some((field) => field.name === "Sprint")) {
    createIterationField(project.id);
    fields = projectFields(project.number);
  }
  for (const [name, dataType] of [["Points", "NUMBER"], ["Source IDs", "TEXT"]]) {
    if (!fields.some((field) => field.name === name)) {
      runGh(["project", "field-create", String(project.number), "--owner", owner, "--name", name, "--data-type", dataType]);
      fields = projectFields(project.number);
    }
  }
  return { ...project, fields };
}

function existingBacklogIssues() {
  const items = ghJson(["api", `repos/${repository}/issues?state=all&per_page=100`]) || [];
  return items.filter((item) => !item.pull_request && /<!-- backlog-key: TZR-S\d-\d{2} -->/.test(item.body || ""));
}

function createOrReuseIssue(draft, existing, sync) {
  const marker = `<!-- backlog-key: ${draft.id} -->`;
  const found = existing.find((issue) => (issue.body || "").includes(marker));
  const labelNames = [`priority:${draft.priority.toLowerCase()}`, `area:${draft.area.toLowerCase()}`];
  if (found) {
    if (sync) {
      runGh([
        "issue", "edit", String(found.number), "--repo", repository,
        "--title", draft.title, "--body", draft.body,
        "--milestone", draft.milestone, "--add-assignee", draft.assignee,
        "--add-label", labelNames.join(",")
      ]);
    }
    return { number: found.number, url: found.html_url, existing: true };
  }
  const result = runGh([
    "issue", "create", "--repo", repository,
    "--title", draft.title, "--body", draft.body,
    "--assignee", draft.assignee, "--milestone", draft.milestone,
    "--label", labelNames.join(",")
  ]);
  const url = result.stdout.trim();
  return { number: Number(url.split("/").pop()), url, existing: false };
}

function findOption(field, name) {
  const option = (field.options || []).find((candidate) => candidate.name === name);
  if (!option) fail(`Option ${name} absente du champ ${field.name}.`);
  return option.id;
}

function findIteration(field, title) {
  const iterations = field.configuration?.iterations || [];
  const iteration = iterations.find((candidate) => candidate.title === title);
  if (!iteration) fail(`Itération ${title} absente du champ Sprint.`);
  return iteration.id;
}

function editProjectItem(project, itemId, field, valueArgs) {
  runGh([
    "project", "item-edit", "--id", itemId, "--project-id", project.id,
    "--field-id", field.id, ...valueArgs
  ]);
}

function addToProject(project, issue, draft) {
  const listed = ghJson(["project", "item-list", String(project.number), "--owner", owner, "--limit", "100", "--format", "json"]);
  let item = listed.items.find((candidate) => candidate.content?.url === issue.url || candidate.url === issue.url);
  if (!item) item = ghJson(["project", "item-add", String(project.number), "--owner", owner, "--url", issue.url, "--format", "json"]);

  const fields = projectFields(project.number);
  const status = fields.find((field) => field.name === "Status");
  const sprint = fields.find((field) => field.name === "Sprint");
  const priority = fields.find((field) => field.name === "Priority");
  const points = fields.find((field) => field.name === "Points");
  const area = fields.find((field) => field.name === "Area");
  const sourceIds = fields.find((field) => field.name === "Source IDs");
  for (const field of [status, sprint, priority, points, area, sourceIds]) if (!field) fail("Un champ du Project est absent.");

  editProjectItem(project, item.id, status, ["--single-select-option-id", findOption(status, "Ready")]);
  editProjectItem(project, item.id, sprint, ["--iteration-id", findIteration(sprint, draft.sprint)]);
  editProjectItem(project, item.id, priority, ["--single-select-option-id", findOption(priority, draft.priority)]);
  editProjectItem(project, item.id, points, ["--number", String(draft.points)]);
  editProjectItem(project, item.id, area, ["--single-select-option-id", findOption(area, draft.area)]);
  editProjectItem(project, item.id, sourceIds, ["--text", draft.sourceIds.join(", ")]);
}

function configureRepositoryFlow() {
  const protection = {
    required_status_checks: { strict: true, contexts: ["verify"] },
    enforce_admins: true,
    required_pull_request_reviews: {
      dismiss_stale_reviews: true,
      require_code_owner_reviews: false,
      required_approving_review_count: 1,
      require_last_push_approval: false
    },
    restrictions: null,
    required_conversation_resolution: true,
    required_linear_history: true,
    allow_force_pushes: false,
    allow_deletions: false,
    block_creations: false
  };
  runGh(["api", `repos/${repository}/branches/main/protection`, "--method", "PUT", "--input", "-"], { input: JSON.stringify(protection) });
  runGh(["api", `repos/${repository}`, "--method", "PATCH", "--input", "-"], {
    input: JSON.stringify({
      allow_squash_merge: true,
      allow_merge_commit: false,
      allow_rebase_merge: false,
      delete_branch_on_merge: true
    })
  });
}

function parseArguments(argv) {
  const command = argv[0] || "validate";
  const options = { command, sprints: [], apply: false, dryRun: false, sync: false };
  for (let index = 1; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--apply") options.apply = true;
    else if (value === "--dry-run") options.dryRun = true;
    else if (value === "--sync") options.sync = true;
    else if (value === "--sprints") options.sprints = String(argv[++index] || "").split(",").filter(Boolean);
    else fail(`Option inconnue: ${value}`);
  }
  if (!["validate", "publish"].includes(command)) fail(`Commande inconnue: ${command}`);
  if (command === "publish" && options.apply === options.dryRun) fail("Choisir exactement --dry-run ou --apply.");
  if (command === "publish" && options.sprints.length === 0) fail("--sprints est obligatoire pour publier.");
  return options;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const issues = loadIssues();
  const summary = validateBacklog(issues);
  if (options.command === "validate") {
    console.log(`Validation OK: ${summary.issueCount} brouillons, ${summary.sourceCount} IDs, ${summary.historicalPoints} points Excel.`);
    return;
  }

  for (const sprint of options.sprints) if (!sprintDefinitions[sprint]) fail(`Sprint inconnu: ${sprint}.`);
  const selected = issues.filter((issue) => options.sprints.includes(issue.sprint));
  const unpublished = selected.filter((issue) => !issue.publish);
  if (unpublished.length) fail(`Brouillons non approuvés: ${unpublished.map((issue) => issue.id).join(", ")}. Passer publish à true après la revue.`);
  console.log(`${selected.length} issue(s) sélectionnée(s):`);
  for (const issue of selected) console.log(`- ${issue.id} | ${issue.title} | ${issue.assignee} | ${issue.milestone}`);
  if (options.dryRun) return;

  const permission = ghJson(["api", `repos/${repository}/collaborators/${assignee}/permission`]);
  if (!permission?.user?.permissions?.push) fail(`${assignee} ne dispose pas de l'accès write attendu.`);
  ensureLabels();
  ensureMilestones([...new Set(selected.map((issue) => issue.sprint))]);
  const project = ensureProject(options.sync);
  const existing = existingBacklogIssues();
  for (const draft of selected) {
    const issue = createOrReuseIssue(draft, existing, options.sync);
    addToProject(project, issue, draft);
    console.log(`${issue.existing ? "Réutilisée" : "Créée"}: ${issue.url}`);
  }
  configureRepositoryFlow();
  console.log(`Publication terminée dans le Project #${project.number}: ${projectTitle}.`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
