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

test("publicUrl arma la URL de Pages", () => {
  assert.strictEqual(L.publicUrl("NicoDelau", "qr-archivos", "files/a b.pdf"), "https://nicodelau.github.io/qr-archivos/files/a%20b.pdf");
  assert.strictEqual(L.publicUrl("x", "x.github.io", "files/a.pdf"), "https://x.github.io/files/a.pdf");
});
