const test = require("node:test");
const assert = require("node:assert");
const L = require("./lib.js");

test("sanitizeName quita acentos, espacios y símbolos", () => {
  assert.strictEqual(L.sanitizeName("Menú del Día (v2).PDF"), "menu-del-dia-v2.pdf");
  assert.strictEqual(L.sanitizeName("sin_extension"), "sin_extension");
  assert.strictEqual(L.sanitizeName("###.png"), "archivo.png");
});

test("sanitizeName rechaza vacío", () => {
  assert.throws(() => L.sanitizeName("  "));
  assert.throws(() => L.sanitizeName(undefined));
});

test("buildPath agrega timestamp y carpeta", () => {
  const p = L.buildPath("Foto 1.jpg", new Date("2026-10-15T12:34:56Z"));
  assert.strictEqual(p, "files/20261015123456-foto-1.jpg");
});

test("detectRepo desde GitHub Pages", () => {
  assert.deepStrictEqual(L.detectRepo("nicodelau.github.io", "/qr-archivos/"), { owner: "nicodelau", repo: "qr-archivos" });
  assert.deepStrictEqual(L.detectRepo("nicodelau.github.io", "/"), { owner: "nicodelau", repo: "nicodelau.github.io" });
  assert.strictEqual(L.detectRepo("localhost", "/"), null);
});

test("sealToken/openToken: ida y vuelta con la contraseña correcta", async () => {
  const sealed = await L.sealToken("github_pat_abc", "una-clave-larga-123", 1000);
  assert.ok(sealed.salt && sealed.iv && sealed.ct);
  assert.strictEqual(sealed.iter, 1000);
  assert.ok(!JSON.stringify(sealed).includes("github_pat_abc"));
  assert.strictEqual(await L.openToken(sealed, "una-clave-larga-123"), "github_pat_abc");
});

test("openToken falla con contraseña incorrecta o entrada inválida", async () => {
  const sealed = await L.sealToken("tok", "clave-correcta-123", 1000);
  await assert.rejects(L.openToken(sealed, "clave-incorrecta-1"), /incorrectos/);
  await assert.rejects(L.openToken(null, "x"), /incorrectos/);
});

test("normalizeUser y validatePassword", () => {
  assert.strictEqual(L.normalizeUser("  Nicolas "), "nicolas");
  assert.throws(() => L.normalizeUser("a b"));
  assert.throws(() => L.validatePassword("corta"));
  assert.doesNotThrow(() => L.validatePassword("suficientemente-larga"));
});

test("generatePassword genera claves válidas y distintas", () => {
  const a = L.generatePassword(), b = L.generatePassword();
  assert.strictEqual(a.length, 16);
  assert.notStrictEqual(a, b);
  assert.doesNotThrow(() => L.validatePassword(a));
});

test("parseFileName separa fecha y nombre", () => {
  const r = L.parseFileName("20261015123456-menu.pdf");
  assert.strictEqual(r.label, "menu.pdf");
  assert.strictEqual(r.date.toISOString(), "2026-10-15T12:34:56.000Z");
  assert.deepStrictEqual(L.parseFileName("otro.pdf"), { label: "otro.pdf", date: null });
});

test("formatBytes", () => {
  assert.strictEqual(L.formatBytes(512), "512 B");
  assert.strictEqual(L.formatBytes(1536), "1.5 KB");
  assert.strictEqual(L.formatBytes(5 * 1024 * 1024), "5.0 MB");
});

test("publicUrl arma la URL de Pages", () => {
  assert.strictEqual(L.publicUrl("NicoDelau", "qr-archivos", "files/a b.pdf"), "https://nicodelau.github.io/qr-archivos/files/a%20b.pdf");
  assert.strictEqual(L.publicUrl("x", "x.github.io", "files/a.pdf"), "https://x.github.io/files/a.pdf");
});
