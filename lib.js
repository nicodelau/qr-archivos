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

  function buildPath(name, now) {
    const d = now instanceof Date ? now : new Date();
    const stamp = d.toISOString().slice(0, 19).replace(/[-:T]/g, "");
    return `${FILES_DIR}/${stamp}-${sanitizeName(name)}`;
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

  const api = { FILES_DIR, MAX_BYTES, sanitizeName, buildPath, detectRepo, publicUrl };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.QRLib = api;
})(this);
