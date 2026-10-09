const path = require("node:path");

function validateHostAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") throw new Error("L'adaptateur hôte recrutement est introuvable.");
  if (!adapter.db || typeof adapter.db.prepare !== "function") {
    throw new Error("L'adaptateur hôte doit fournir la connexion SQLite partagée `db`.");
  }
  if (typeof adapter.sessionMiddleware !== "function") {
    throw new Error("L'adaptateur hôte doit fournir `sessionMiddleware`.");
  }
  if (typeof adapter.requireAdminOrigin !== "function") {
    throw new Error("L'adaptateur hôte doit fournir `requireAdminOrigin`.");
  }
  if (typeof adapter.requireAdminSession !== "function") {
    throw new Error("L'adaptateur hôte doit fournir `requireAdminSession`.");
  }
  if (adapter.resolveMediaAsset !== undefined && typeof adapter.resolveMediaAsset !== "function") {
    throw new Error("`resolveMediaAsset` doit être une fonction lorsqu'il est fourni.");
  }
  return adapter;
}

function loadHostAdapter(modulePath, { requireImpl = require } = {}) {
  if (!modulePath) throw new Error("RECRUITMENT_HOST_ADAPTER est obligatoire en production.");
  const resolvedPath = path.resolve(modulePath);
  let adapter;
  try {
    adapter = requireImpl(resolvedPath);
  } catch {
    throw new Error("Impossible de charger l'adaptateur hôte recrutement configuré.");
  }
  return validateHostAdapter(adapter);
}

module.exports = { loadHostAdapter, validateHostAdapter };
