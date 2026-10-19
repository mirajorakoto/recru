const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { promisify } = require("node:util");
const sanitizeHtml = require("sanitize-html");

const scrypt = promisify(crypto.scrypt);

const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const SAFE_EMAIL_TAGS = ["p", "br", "strong", "em", "ul", "ol", "li", "a"];

function getEncryptionKey(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    throw new Error("RECRUITMENT_FILE_KEY must contain exactly 32 base64-encoded bytes.");
  }
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new Error("RECRUITMENT_FILE_KEY must contain exactly 32 base64-encoded bytes.");
  }
  return key;
}

function validatePdf(buffer) {
  if (buffer.length < 5 || buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("Le contenu ne correspond pas à un PDF valide.");
  }
  if (!buffer.subarray(Math.max(0, buffer.length - 4096)).includes(Buffer.from("%%EOF", "ascii"))) {
    throw new Error("Le PDF est incomplet ou corrompu.");
  }
  return PDF_MIME;
}

function readZipEntries(buffer) {
  const minimumEocdSize = 22;
  const searchStart = Math.max(0, buffer.length - minimumEocdSize - 0xffff);
  let eocdOffset = -1;
  for (let offset = buffer.length - minimumEocdSize; offset >= searchStart; offset -= 1) {
    if (
      buffer.readUInt32LE(offset) === 0x06054b50 &&
      offset + minimumEocdSize + buffer.readUInt16LE(offset + 20) === buffer.length
    ) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("Le document DOCX est corrompu.");

  const entriesCount = buffer.readUInt16LE(eocdOffset + 10);
  const directorySize = buffer.readUInt32LE(eocdOffset + 12);
  const directoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (
    buffer.readUInt16LE(eocdOffset + 4) !== 0 ||
    buffer.readUInt16LE(eocdOffset + 6) !== 0 ||
    buffer.readUInt16LE(eocdOffset + 8) !== entriesCount ||
    entriesCount === 0xffff ||
    directorySize === 0xffffffff ||
    directoryOffset === 0xffffffff ||
    entriesCount > 1000 ||
    directoryOffset + directorySize > eocdOffset
  ) {
    throw new Error("Le document DOCX est corrompu.");
  }

  const entries = [];
  let offset = directoryOffset;
  for (let index = 0; index < entriesCount; index += 1) {
    if (offset + 46 > directoryOffset + directorySize || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("Le document DOCX est corrompu.");
    }
    const flags = buffer.readUInt16LE(offset + 8);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength;
    if (nextOffset > directoryOffset + directorySize || flags & 0x1) {
      throw new Error("Le document DOCX est corrompu.");
    }
    entries.push({
      name: buffer.subarray(offset + 46, offset + 46 + nameLength).toString(flags & 0x800 ? "utf8" : "latin1"),
      inflatedSize: buffer.readUInt32LE(offset + 24)
    });
    offset = nextOffset;
  }
  if (offset !== directoryOffset + directorySize) throw new Error("Le document DOCX est corrompu.");
  return entries;
}

function validateDocx(buffer, originalName) {
  if (!/\.docx$/i.test(originalName) || /\.docm$/i.test(originalName)) {
    throw new Error("Seuls les documents DOCX sans macro sont acceptés.");
  }
  const entries = readZipEntries(buffer);
  const names = new Set(entries.map((entry) => entry.name));
  const inflatedSize = entries.reduce((total, entry) => total + entry.inflatedSize, 0);
  if (!names.has("[Content_Types].xml") || !names.has("word/document.xml")) {
    throw new Error("Le fichier n'est pas un document DOCX valide.");
  }
  if (entries.some((entry) => /vbaProject\.bin$/i.test(entry.name))) {
    throw new Error("Les documents contenant des macros sont refusés.");
  }
  if (entries.some((entry) => entry.name.includes("..") || entry.name.startsWith("/") || entry.name.includes("\0"))) {
    throw new Error("Le document DOCX contient un chemin non sûr.");
  }
  if (inflatedSize > 30 * 1024 * 1024) {
    throw new Error("Le document DOCX décompressé est trop volumineux.");
  }
  return DOCX_MIME;
}

function validateCandidateDocument(file, maxBytes) {
  if (!file?.buffer?.length) throw new Error("Le fichier est vide.");
  if (file.buffer.length > maxBytes) throw new Error("Le fichier dépasse la taille autorisée.");
  const extension = path.extname(file.originalname || "").toLowerCase();
  if (extension === ".pdf") return validatePdf(file.buffer);
  if (extension === ".docx") return validateDocx(file.buffer, file.originalname);
  throw new Error("Format non supporté. Utilisez PDF ou DOCX.");
}

function encryptDocument({ buffer, storageDir, key, applicationPublicId, kind }) {
  fs.mkdirSync(storageDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(storageDir, 0o700);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const filename = `${applicationPublicId}-${kind}-${crypto.randomUUID()}.enc`;
  const encryptedPath = path.join(storageDir, filename);
  fs.writeFileSync(encryptedPath, encrypted, { mode: 0o600, flag: "wx" });
  return {
    encrypted_path: encryptedPath,
    iv: iv.toString("base64"),
    auth_tag: authTag.toString("base64"),
    sha256: crypto.createHash("sha256").update(buffer).digest("hex")
  };
}

// Node fs/crypto errors embed the absolute server path in their message
// (e.g. "ENOENT: ... open '/var/lib/techzone/recruitment/<file>.enc'").
// This strips any such path so it never reaches a database column, an
// API response, or a server log.
function sanitizeStorageError(error) {
  const message = String(error?.message || "Erreur de traitement du document.");
  return message
    .replace(/open '[^']*'/gi, "open '[fichier]'")
    .replace(/'[^']*\.enc'/gi, "'[fichier]'");
}

function decryptDocument(file, key) {
  try {
    const encrypted = fs.readFileSync(file.encrypted_path);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(file.iv, "base64"));
    decipher.setAuthTag(Buffer.from(file.auth_tag, "base64"));
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  } catch (error) {
    // Never let the raw error (with its absolute file path) escape this
    // function: routes and the worker only ever see the sanitized message.
    throw new Error(sanitizeStorageError(error));
  }
}

function sanitizeEmailHtml(value) {
  return sanitizeHtml(String(value || ""), {
    allowedTags: SAFE_EMAIL_TAGS,
    allowedAttributes: { a: ["href", "rel"] },
    allowedSchemes: ["https", "mailto"],
    transformTags: { a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }) }
  });
}

function decodeBasicEntities(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function htmlToText(value) {
  // Les fins de paragraphe / <br> deviennent des retours à la ligne avant de retirer les balises.
  const withBreaks = String(value || "").replace(/<\/(p|li|div)>|<br\s*\/?>/gi, "\n");
  return decodeBasicEntities(sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} }))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function verifyTurnstile({ secret, token, ip, fetchImpl = fetch, bypass = false }) {
  if (bypass) return true;
  if (!secret || !token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const response = await fetchImpl("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return false;
    const result = await response.json();
    return Boolean(result.success);
  } catch {
    // Service indisponible ou délai dépassé : on refuse (fail closed) plutôt que de planter la route.
    return false;
  }
}

// ---------------------------------------------------------------------------
// Comptes candidats : mot de passe (scrypt), jetons de session (HS256), tokens
// ---------------------------------------------------------------------------
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function validatePasswordStrength(password) {
  if (typeof password !== "string" || password.length < 10 || password.length > 200) {
    throw new Error("Le mot de passe doit contenir entre 10 et 200 caractères.");
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error("Le mot de passe doit contenir au moins une lettre et un chiffre.");
  }
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, 64, SCRYPT_OPTIONS);
  return `scrypt$${salt.toString("base64")}$${derived.toString("base64")}`;
}

async function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "base64");
  const expected = Buffer.from(parts[2], "base64");
  if (salt.length === 0 || expected.length === 0) return false;
  const derived = await scrypt(String(password), salt, expected.length, SCRYPT_OPTIONS);
  return crypto.timingSafeEqual(derived, expected);
}

let dummyHash = null;
// Égalise le temps de réponse quand le compte n'existe pas (anti-énumération).
async function burnPasswordCheck(password) {
  dummyHash ||= await hashPassword("dummy-password-1234");
  await verifyPassword(password, dummyHash);
}

function deriveSubKey(masterKey, label) {
  return crypto.createHmac("sha256", masterKey).update(label).digest();
}

function signToken(payload, key, ttlSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds })).toString("base64url");
  const signature = crypto.createHmac("sha256", key).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

function verifyToken(token, key) {
  if (typeof token !== "string" || token.length > 2000) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const expected = crypto.createHmac("sha256", key).update(`${parts[0]}.${parts[1]}`).digest();
  const received = Buffer.from(parts[2], "base64url");
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return null;
  try {
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (header.alg !== "HS256" || !Number.isFinite(payload.exp) || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

/**
 * Mot de passe aléatoire lisible (sans caractères ambigus 0/O, 1/l/I), 14 caractères,
 * avec au moins une lettre et un chiffre : il respecte toujours validatePasswordStrength().
 */
function generatePassword(length = 14) {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const all = letters + digits;
  const pick = (alphabet) => alphabet[crypto.randomInt(alphabet.length)];
  const chars = [pick(letters), pick(digits)];
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

module.exports = {
  burnPasswordCheck,
  deriveSubKey,
  generatePassword,
  hashPassword,
  randomToken,
  sha256Hex,
  signToken,
  validatePasswordStrength,
  verifyPassword,
  verifyToken,
  DOCX_MIME,
  PDF_MIME,
  decryptDocument,
  encryptDocument,
  getEncryptionKey,
  htmlToText,
  sanitizeEmailHtml,
  sanitizeStorageError,
  validateCandidateDocument,
  verifyTurnstile
};
