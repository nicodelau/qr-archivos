// Funciones puras (sin DOM) para poder testearlas con Node.
(function (root) {
  const FILES_DIR = "files";
  const MAX_BYTES = 50 * 1024 * 1024;

  function sanitizeName(name) {
    if (typeof name !== "string" || !name.trim()) throw new Error("Nombre de archivo vacío");
    const dot = name.lastIndexOf(".");
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot + 1) : "";
    const clean = (s) =>
      s.normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^A-Za-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
        .toLowerCase();
    const b = clean(base) || "archivo";
    const e = clean(ext);
    return e ? `${b}.${e}` : b;
  }

  function buildPath(name, now, dir = FILES_DIR) {
    const d = now instanceof Date ? now : new Date();
    const stamp = d.toISOString().slice(0, 19).replace(/[-:T]/g, "");
    return `${dir}/${stamp}-${sanitizeName(name)}`;
  }

  const ORIGINALS_DIR = "originals";
  const CONVERTIBLE = ["doc", "docx", "odt", "rtf", "txt", "xls", "xlsx", "ods", "csv", "ppt", "pptx", "odp"];

  function baseName(name) {
    const dot = name.lastIndexOf(".");
    return dot > 0 ? name.slice(0, dot) : name;
  }

  function isConvertible(name) {
    const dot = name.lastIndexOf(".");
    return dot > 0 && CONVERTIBLE.includes(name.slice(dot + 1).toLowerCase());
  }

  function pdfNameFor(name) {
    return `${baseName(name)}.pdf`;
  }

  function planUpload(name, now) {
    if (!isConvertible(name)) {
      const path = buildPath(name, now);
      return { uploadPath: path, servedPath: path, converts: false };
    }
    const uploadPath = buildPath(name, now, ORIGINALS_DIR);
    const file = uploadPath.slice(ORIGINALS_DIR.length + 1);
    return { uploadPath, servedPath: `${FILES_DIR}/${pdfNameFor(file)}`, converts: true };
  }

  function detectRepo(hostname, pathname) {
    const m = /^([a-z0-9-]+)\.github\.io$/i.exec(hostname || "");
    if (!m) return null;
    const repo = (pathname || "/").split("/").filter(Boolean)[0];
    return repo ? { owner: m[1], repo } : { owner: m[1], repo: `${m[1]}.github.io` };
  }

  function publicUrl(owner, repo, path) {
    const site = `https://${owner.toLowerCase()}.github.io`;
    const prefix = repo.toLowerCase() === `${owner.toLowerCase()}.github.io` ? "" : `/${repo}`;
    return `${site}${prefix}/${path.split("/").map(encodeURIComponent).join("/")}`;
  }

  const PBKDF2_ITER = 600000;
  const MIN_PASSWORD = 12;
  const subtle = () => globalThis.crypto.subtle;
  const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const BAD_LOGIN = "Usuario o contraseña incorrectos";

  async function deriveKey(password, salt, iter) {
    const base = await subtle().importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
    return subtle().deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations: iter },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }

  async function sealToken(token, password, iter = PBKDF2_ITER) {
    if (!token || !password) throw new Error("Token y contraseña son obligatorios");
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt, iter);
    const ct = await subtle().encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token));
    return { salt: toB64(salt), iv: toB64(iv), ct: toB64(ct), iter };
  }

  async function openToken(entry, password) {
    try {
      const key = await deriveKey(password, fromB64(entry.salt), entry.iter || PBKDF2_ITER);
      const pt = await subtle().decrypt({ name: "AES-GCM", iv: fromB64(entry.iv) }, key, fromB64(entry.ct));
      return new TextDecoder().decode(pt);
    } catch {
      throw new Error(BAD_LOGIN);
    }
  }

  function normalizeUser(name) {
    const n = String(name || "").trim().toLowerCase();
    if (!/^[a-z0-9._-]{2,32}$/.test(n)) throw new Error("Usuario inválido: 2-32 caracteres, sin espacios");
    return n;
  }

  function validatePassword(p) {
    if (typeof p !== "string" || p.length < MIN_PASSWORD) {
      throw new Error(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`);
    }
  }

  function generatePassword(length = 16) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(length));
    return Array.from(bytes, (b) => chars[b % chars.length]).join("");
  }

  function parseFileName(name) {
    const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})-(.+)$/.exec(name);
    if (!m) return { label: name, date: null };
    return { label: m[7], date: new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6])) };
  }

  function formatBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  function whatsappShareUrl(label, url) {
    if (!url) throw new Error("Falta la URL a compartir");
    const text = label ? `${label}\n${url}` : url;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }

  const api = {
    whatsappShareUrl,
    FILES_DIR, ORIGINALS_DIR, MAX_BYTES, sanitizeName, buildPath, detectRepo, publicUrl,
    baseName, isConvertible, pdfNameFor, planUpload,
    sealToken, openToken, normalizeUser, validatePassword, generatePassword, parseFileName, formatBytes,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.QRLib = api;
})(this);
