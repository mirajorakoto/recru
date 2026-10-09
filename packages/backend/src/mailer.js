const nodemailer = require("nodemailer");

const maskEmail = (value) => String(value || "").replace(/^(.).*(@.*)$/, "$1***$2");

function smtpConfigured(smtp) {
  return Boolean(smtp?.host && smtp.user && smtp.pass && smtp.host !== "localhost");
}

function hintFor(error, smtp) {
  if (error?.code === "EAUTH") return "Identifiants refusés : vérifiez SMTP_USER et SMTP_PASS dans le .env.";
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "ECONNREFUSED", "ENOTFOUND", "EDNS"].includes(error?.code)) {
    return `Serveur injoignable : vérifiez SMTP_HOST (${smtp.host}) et SMTP_PORT (${smtp.port}). Le port 465 exige SMTP_SECURE=true, le port 587 exige SMTP_SECURE=false.`;
  }
  if (error?.code === "EENVELOPE") return "Adresse d'expéditeur ou de destinataire refusée : vérifiez SMTP_FROM.";
  return "";
}

/**
 * Transport e-mail unique de l'application, piloté par le .env :
 *   - SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASS  → envoi réel ;
 *   - sinon (ou MAIL_MODE=simulation / déploiement de recette) → e-mails simulés, affichés dans la console.
 * Chaque envoi est journalisé (destinataire masqué, jamais de mot de passe).
 */
function createMailer(config, { log = console } = {}) {
  const real = smtpConfigured(config.smtp) && config.mailMode !== "simulation" && !config.isTestDeployment;
  if (!real) {
    return {
      mode: "simulation",
      transporter: {
        async sendMail(message) {
          log.log(`[email simulé] à ${maskEmail(message.to)} — « ${message.subject} »`);
          return { simulated: true };
        }
      },
      async verify() {
        log.warn("[email] Aucun SMTP actif : les e-mails sont SIMULÉS (affichés ici, non envoyés). Renseignez SMTP_HOST, SMTP_USER et SMTP_PASS dans le .env pour envoyer de vrais e-mails.");
        return false;
      }
    };
  }
  const smtp = config.smtp;
  const base = nodemailer.createTransport({
    host: smtp.host, port: smtp.port, secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000
  });
  return {
    mode: "smtp",
    transporter: {
      async sendMail(message) {
        const info = await base.sendMail({ from: smtp.from, ...message });
        log.log(`[email] envoyé à ${maskEmail(message.to)} — « ${message.subject} »`);
        return info;
      }
    },
    async verify() {
      try {
        await base.verify();
        log.log(`[email] SMTP prêt : ${smtp.host}:${smtp.port} (${smtp.secure ? "TLS" : "STARTTLS"}), expéditeur « ${smtp.from} ».`);
        return true;
      } catch (error) {
        log.error(`[email] SMTP INACCESSIBLE (${[error.code, error.responseCode].filter(Boolean).join(" · ") || "erreur"}) : ${String(error.message).slice(0, 160)}`);
        const hint = hintFor(error, smtp);
        if (hint) log.error(`[email] ${hint}`);
        return false;
      }
    }
  };
}

module.exports = { createMailer, smtpConfigured };
