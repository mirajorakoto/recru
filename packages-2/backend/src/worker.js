const { decryptDocument } = require("./security");

const ANALYSIS_FAILURE_MESSAGE = "L'analyse n'a pas pu être effectuée. Une vérification RH est requise.";

function createAnalysisWorker({ repository, aiService, encryptionKey, intervalMs = 5000 }) {
  let timer = null;
  let running = false;

  async function runOnce() {
    if (running) return false;
    const application = repository.claimNextAnalysis();
    if (!application) return false;
    running = true;
    try {
      const job = repository.getJobById(application.job_id);
      const files = repository.listFiles(application.id).map((file) => ({
        ...file,
        buffer: decryptDocument(file, encryptionKey)
      }));
      const analysis = await aiService.analyzeApplication({ application, job, files });
      repository.completeAnalysis(application.id, analysis, aiService.model);
      repository.recordEvent(application.id, "analysis_completed", "system", { model: aiService.model });
      return true;
    } catch (error) {
      // Provider and file errors can echo personal data. Persist only a
      // generic status for the RH retry workflow.
      repository.failAnalysis(application.id, ANALYSIS_FAILURE_MESSAGE, true);
      repository.recordEvent(application.id, "analysis_failed", "system", { reason: "processing_error" });
      return false;
    } finally {
      running = false;
    }
  }

  function start() {
    if (timer) return;
    timer = setInterval(() => void runOnce(), intervalMs);
    timer.unref?.();
    void runOnce();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { runOnce, start, stop };
}

function purgeExpiredApplications({ repository, retentionDays = 180 }) {
  const rows = repository.db.prepare(`
    SELECT a.id FROM recruitment_applications a
    JOIN recruitment_jobs j ON j.id = a.job_id
    WHERE j.closed_at IS NOT NULL
      AND j.closed_at < datetime('now', ?)
  `).all(`-${Number(retentionDays)} days`);

  // eraseApplication supprime toutes les données liées (entretiens, évaluations, notifications,
  // compétences, emails, événements) puis les fichiers chiffrés après validation de la transaction.
  for (const row of rows) repository.eraseApplication(row.id);
  return rows.length;
}

function createPurgeScheduler({
  repository,
  retentionDays = 180,
  intervalMs = 24 * 60 * 60 * 1000,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval
}) {
  let timer = null;
  let lastResult = null;

  function runNow() {
    const purged = purgeExpiredApplications({ repository, retentionDays });
    lastResult = { purged, ranAt: new Date().toISOString(), error: null };
    return lastResult;
  }

  function runSafely() {
    try {
      return runNow();
    } catch (error) {
      lastResult = { purged: 0, ranAt: new Date().toISOString(), error: "Purge recrutement échouée." };
      console.error("Purge recrutement échouée.");
      return lastResult;
    }
  }

  function start() {
    if (timer) return lastResult;
    runSafely();
    timer = setIntervalImpl(runSafely, intervalMs);
    timer.unref?.();
    return lastResult;
  }

  function stop() {
    if (timer) clearIntervalImpl(timer);
    timer = null;
  }

  return { getLastResult: () => lastResult, runNow, start, stop };
}

module.exports = { createAnalysisWorker, createPurgeScheduler, purgeExpiredApplications };
