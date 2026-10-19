const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  deriveSubKey,
  generatePassword,
  hashPassword,
  signToken,
  validatePasswordStrength,
  verifyPassword,
  verifyToken
} = require("./security");

const RH_COOKIE = "rh_session";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const escapeHtml = (value) => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

/**
 * Authentification de l'espace RH : UN SEUL compte (administrateur + recruteur confondus).
 *
 *   GET    /auth/status           -> { configured }               (public : l'écran sait s'il faut créer le compte)
 *   POST   /auth/setup            -> crée le compte RH            (uniquement tant qu'aucun compte n'existe)
 *   POST   /auth/login            -> ouvre la session
 *   POST   /auth/logout           -> ferme la session
 *   POST   /auth/forgot-password  -> génère un nouveau mot de passe et l'envoie par e-mail au compte RH
 *   POST   /auth/password         -> changement de mot de passe (session + mot de passe actuel)
 *   DELETE /auth/account          -> suppression du compte RH     (session + mot de passe actuel)
 *
 * Après la suppression, l'espace RH est de nouveau « non configuré » : la première personne qui
 * arrive crée le nouveau compte RH.
 */
function createRhAuth({ repository, config, encryptionKey, transporter }) {
  const sessionKey = deriveSubKey(encryptionKey, "recruitment-rh-session-v1");
  const ttlSeconds = Math.round(Number(config.rhSessionTtlHours || 12) * 3600);
  const allowConsolePassword = config.allowConsolePassword ?? process.env.NODE_ENV !== "production";

  const limiter = (limit) => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Trop de tentatives. Réessayez dans quelques minutes." }
  });
  const loginLimiter = limiter(Number(config.rhLoginRateLimit || 10));
  const forgotLimiter = limiter(Number(config.rhForgotRateLimit || 5));
  const setupLimiter = limiter(Number(config.rhLoginRateLimit || 10));

  function readCookie(req) {
    const raw = req.headers.cookie;
    if (!raw) return null;
    for (const part of raw.split(";")) {
      const index = part.indexOf("=");
      if (index < 0 || part.slice(0, index).trim() !== RH_COOKIE) continue;
      try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return null; }
    }
    return null;
  }

  function cookieAttributes(maxAge) {
    const attributes = [`Path=${config.cookiePath || "/"}`, "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`];
    if (config.cookieSecure) attributes.push("Secure");
    return attributes.join("; ");
  }

  function issueSession(res, account) {
    const token = signToken({ sub: account.id, tv: account.token_version, kind: "rh" }, sessionKey, ttlSeconds);
    res.append("Set-Cookie", `${RH_COOKIE}=${encodeURIComponent(token)}; ${cookieAttributes(ttlSeconds)}`);
  }

  function clearSession(res) {
    res.append("Set-Cookie", `${RH_COOKIE}=; ${cookieAttributes(0)}`);
  }

  /** Compte RH de la session courante, ou null (jeton invalide, mot de passe changé, compte supprimé). */
  function currentAccount(req) {
    const payload = verifyToken(readCookie(req), sessionKey);
    if (!payload || payload.kind !== "rh") return null;
    const account = repository.getRhAccount();
    if (!account || account.id !== payload.sub || account.token_version !== payload.tv) return null;
    return account;
  }

  // Défense en profondeur contre le CSRF (en plus de SameSite=Lax) : une requête qui modifie des données
  // doit venir du même site. Acceptés : Sec-Fetch-Site « same-origin » (envoyé par le navigateur, fiable
  // même derrière le proxy Vite/nginx), même hôte (y compris X-Forwarded-Host), PUBLIC_BASE_URL,
  // origines listées dans config.allowedOrigins, et en développement tout hôte local
  // (localhost / 127.0.0.1 / ::1, n'importe quel port).
  const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
  function originAllowed(req) {
    const origin = req.headers.origin;
    if (!origin) return true;
    if (req.headers["sec-fetch-site"] === "same-origin") return true;
    let parsed;
    try { parsed = new URL(origin); } catch { return false; }
    const hosts = [req.get("host"), req.get("x-forwarded-host")].filter(Boolean).flatMap((value) => String(value).split(",").map((v) => v.trim()));
    if (hosts.includes(parsed.host)) return true;
    const allowed = [config.publicBaseUrl, ...[].concat(config.allowedOrigins || [])].filter(Boolean);
    for (const value of allowed) {
      try { if (new URL(value).origin === parsed.origin) return true; } catch { /* ignoré */ }
    }
    if (process.env.NODE_ENV !== "production" && LOOPBACK.has(parsed.hostname)) return true;
    return false;
  }

  const rejectForeignOrigin = (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS" && !originAllowed(req)) {
      return res.status(403).json({ error: "Origine de la requête non autorisée." });
    }
    next();
  };

  /** Garde de toutes les routes RH : 401 sans session ; `code` indique à l'écran quoi afficher. */
  function requireRhSession(req, res, next) {
    const account = currentAccount(req);
    if (!account) {
      const configured = Boolean(repository.getRhAccount());
      return res.status(401).json({
        error: configured ? "Connexion RH requise." : "Aucun compte RH : créez-le pour accéder à l'espace RH.",
        code: configured ? "login_required" : "setup_required"
      });
    }
    return rejectForeignOrigin(req, res, () => {
      req.adminUser = { id: account.id, email: account.email, display_name: account.display_name };
      next();
    });
  }

  const publicUser = (account) => ({ email: account.email, display_name: account.display_name });
  const clean = (value, max) => String(value ?? "").trim().slice(0, max);
  const normalizeEmail = (value) => clean(value, 254).toLowerCase();

  async function checkCurrentPassword(account, password) {
    const secrets = repository.getRhAccount({ withSecrets: true });
    return Boolean(secrets) && secrets.id === account.id && verifyPassword(String(password || ""), secrets.password_hash);
  }

  const router = express.Router();
  router.use(rejectForeignOrigin);

  router.get("/status", (req, res) => {
    const account = currentAccount(req);
    res.set("Cache-Control", "no-store").json({
      configured: Boolean(account) || Boolean(repository.getRhAccount()),
      authenticated: Boolean(account)
    });
  });

  // Premier arrivé : crée le compte RH. Dès qu'il existe, cette route est fermée (409).
  router.post("/setup", setupLimiter, async (req, res) => {
    try {
      if (repository.getRhAccount()) {
        return res.status(409).json({ error: "Un compte RH existe déjà. Connectez-vous, ou supprimez-le pour en créer un nouveau.", code: "account_exists" });
      }
      const email = normalizeEmail(req.body?.email);
      if (!EMAIL_PATTERN.test(email)) return res.status(400).json({ error: "Adresse e-mail invalide." });
      const displayName = clean(req.body?.display_name, 120) || email.split("@")[0];
      validatePasswordStrength(req.body?.password);
      const account = repository.createRhAccount({
        email,
        display_name: displayName,
        password_hash: await hashPassword(req.body.password)
      });
      repository.recordEvent(null, "rh_account_created", email);
      issueSession(res, account);
      return res.status(201).json({ user: publicUser(account) });
    } catch (error) {
      if (error?.code === "RH_ACCOUNT_EXISTS") {
        return res.status(409).json({ error: "Un compte RH existe déjà. Connectez-vous, ou supprimez-le pour en créer un nouveau.", code: "account_exists" });
      }
      return res.status(400).json({ error: error?.message || "Création du compte impossible." });
    }
  });

  router.post("/login", loginLimiter, async (req, res) => {
    const account = repository.getRhAccount({ withSecrets: true });
    if (!account) return res.status(409).json({ error: "Aucun compte RH : créez-le pour accéder à l'espace RH.", code: "setup_required" });
    const email = normalizeEmail(req.body?.email);
    // Le mot de passe est toujours vérifié (temps de réponse identique, pas d'indice sur l'e-mail).
    const passwordOk = await verifyPassword(String(req.body?.password || ""), account.password_hash);
    if (!passwordOk || email !== account.email) {
      return res.status(401).json({ error: "E-mail ou mot de passe incorrect.", code: "invalid_credentials" });
    }
    repository.touchRhLogin();
    issueSession(res, account);
    return res.json({ user: publicUser(account) });
  });

  router.post("/logout", (req, res) => {
    clearSession(res);
    res.json({ ok: true });
  });

  // Mot de passe oublié : un nouveau mot de passe est généré et envoyé automatiquement à l'e-mail du
  // compte RH. Il n'est appliqué QUE si l'envoi a réussi (un SMTP en panne ne verrouille jamais le compte).
  // Réponse identique quel que soit l'e-mail saisi (aucune information sur le compte).
  router.post("/forgot-password", forgotLimiter, async (req, res) => {
    const account = repository.getRhAccount({ withSecrets: true });
    const email = normalizeEmail(req.body?.email);
    if (account && email === account.email) {
      try {
        const newPassword = generatePassword();
        const passwordHash = await hashPassword(newPassword);
        const text = [
          `Bonjour ${account.display_name},`,
          "",
          "Vous avez demandé la réinitialisation de votre mot de passe de l'espace RH TECH ZONE Recrutement.",
          "",
          `Votre nouveau mot de passe : ${newPassword}`,
          `Identifiant : ${account.email}`,
          "",
          "Connectez-vous avec ce mot de passe, puis changez-le depuis la page « Compte RH ».",
          "Si vous n'êtes pas à l'origine de cette demande, connectez-vous et changez-le immédiatement."
        ].join("\n");
        const html = `<p>Bonjour ${escapeHtml(account.display_name)},</p>`
          + "<p>Vous avez demandé la réinitialisation de votre mot de passe de l'espace RH TECH ZONE Recrutement.</p>"
          + `<p>Votre nouveau mot de passe : <strong style="font-family:monospace;font-size:16px">${escapeHtml(newPassword)}</strong><br>Identifiant : ${escapeHtml(account.email)}</p>`
          + "<p>Connectez-vous avec ce mot de passe, puis changez-le depuis la page « Compte RH ».<br>Si vous n'êtes pas à l'origine de cette demande, connectez-vous et changez-le immédiatement.</p>";
        const info = await transporter.sendMail({
          from: config.smtpFrom,
          to: account.email,
          subject: "Votre nouveau mot de passe — espace RH TECH ZONE",
          text,
          html
        });
        if (info?.simulated) {
          // Aucun SMTP actif : le mot de passe n'a pas pu être livré.
          if (allowConsolePassword) {
            console.warn(`[rh] SMTP non configuré (simulation) — nouveau mot de passe RH affiché ici, mode développement uniquement : ${newPassword}`);
            repository.setRhPassword(passwordHash);
            repository.recordEvent(null, "rh_password_reset_emailed", "system", { simulated: true });
          } else {
            console.error("[rh] Réinitialisation refusée : aucun SMTP actif, le mot de passe n'a pas pu être envoyé. Renseignez SMTP_HOST, SMTP_USER et SMTP_PASS.");
            repository.recordEvent(null, "rh_password_reset_failed", "system", { reason: "smtp_inactive" });
          }
        } else {
          repository.setRhPassword(passwordHash);
          repository.recordEvent(null, "rh_password_reset_emailed", "system");
        }
      } catch (error) {
        const detail = [error?.code, error?.responseCode, String(error?.message || "erreur").slice(0, 160)].filter(Boolean).join(" · ");
        console.error(`[rh] Envoi du nouveau mot de passe impossible — l'ancien mot de passe reste valide : ${detail}`);
        try { repository.recordEvent(null, "rh_password_reset_failed", "system", { reason: "send_failed" }); } catch { /* ignoré */ }
      }
    }
    res.status(202).json({ status: "sent" });
  });

  router.post("/password", requireRhSession, loginLimiter, async (req, res) => {
    try {
      const account = currentAccount(req);
      if (!(await checkCurrentPassword(account, req.body?.current_password))) {
        return res.status(403).json({ error: "Mot de passe actuel incorrect." });
      }
      validatePasswordStrength(req.body?.new_password);
      const updated = repository.setRhPassword(await hashPassword(req.body.new_password));
      repository.recordEvent(null, "rh_password_changed", account.email);
      issueSession(res, updated); // les autres sessions sont révoquées
      return res.json({ ok: true });
    } catch (error) {
      return res.status(400).json({ error: error?.message || "Changement impossible." });
    }
  });

  // Suppression du compte RH : exige le mot de passe actuel. Les données de recrutement sont conservées ;
  // l'espace RH redevient « non configuré » et la première personne qui arrive crée le nouveau compte.
  router.delete("/account", requireRhSession, loginLimiter, async (req, res) => {
    const account = currentAccount(req);
    if (!(await checkCurrentPassword(account, req.body?.password))) {
      return res.status(403).json({ error: "Mot de passe incorrect : le compte RH n'a pas été supprimé." });
    }
    repository.deleteRhAccount();
    repository.recordEvent(null, "rh_account_deleted", account.email);
    clearSession(res);
    return res.json({ ok: true });
  });

  return { router, requireRhSession };
}

module.exports = { createRhAuth, RH_COOKIE };
