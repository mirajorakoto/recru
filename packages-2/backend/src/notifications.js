function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textToHtml(text) {
  return String(text)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * Notifications candidat : enregistrées en base (portail candidat) et,
 * optionnellement, envoyées par email. Un échec SMTP n'interrompt jamais le flux métier.
 */
function createNotifier({ repository, transporter, smtpFrom, timezone = "Indian/Antananarivo" }) {
  function formatDate(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return String(iso ?? "");
    return date.toLocaleString("fr-FR", { timeZone: timezone, dateStyle: "full", timeStyle: "short" });
  }

  async function sendPlain({ to, subject, text }) {
    if (!transporter || !to) return false;
    await transporter.sendMail({ from: smtpFrom, to, subject, text, html: textToHtml(text) });
    return true;
  }

  // Journaliser ne doit jamais lui-même interrompre le flux métier.
  function safeRecordEvent(applicationId, eventType, details) {
    try {
      repository.recordEvent(applicationId, eventType, "system", details);
    } catch {
      /* ignoré volontairement */
    }
  }

  async function notifyCandidate(application, { type, title, text, email = false }) {
    try {
      repository.addNotification({
        application_id: application.id,
        account_id: application.account_id || null,
        type,
        title,
        body: text
      });
    } catch {
      safeRecordEvent(application.id, "notification_store_failed", { type });
    }
    if (!email) return;
    try {
      await sendPlain({ to: application.email, subject: title, text });
    } catch {
      safeRecordEvent(application.id, "notification_email_failed", { type });
    }
  }

  return { formatDate, notifyCandidate, sendPlain };
}

module.exports = { createNotifier };
