(function () {
  const L = window.QRLib;
  const $ = (id) => document.getElementById(id);
  const REPO = L.detectRepo(location.hostname, location.pathname) || { owner: "nicodelau", repo: "qr-archivos" };
  const USERS_PATH = "users.json";
  const SESSION_KEY = "qr.session";
  const PUBLISH_NOTE = "Si recién lo subiste, GitHub Pages tarda ~1 minuto en publicarlo. El QR ya es definitivo.";
  const CONVERT_NOTE = "Se está convirtiendo a PDF (~3 minutos). El QR ya es definitivo y abrirá el PDF cuando esté listo.";

  let session = null; // { user, token }
  let files = [];

  // ---------- utilidades ----------
  function setMsg(el, text, kind) {
    el.textContent = text;
    el.className = "msg" + (kind ? " " + kind : "");
  }

  function show(view) {
    for (const v of ["vLogin", "vSetup", "vDash"]) $(v).hidden = v !== view;
  }

  const storage = {
    load() {
      for (const s of [sessionStorage, localStorage]) {
        try { const raw = s.getItem(SESSION_KEY); if (raw) return JSON.parse(raw); } catch { /* sin storage */ }
      }
      return null;
    },
    save(data, remember) {
      try { (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(data)); } catch { /* sin storage */ }
    },
    clear() {
      for (const s of [sessionStorage, localStorage]) { try { s.removeItem(SESSION_KEY); } catch { /* sin storage */ } }
    },
  };

  async function gh(path, token, opts = {}) {
    const headers = { Accept: "application/vnd.github+json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (opts.body) headers["Content-Type"] = "application/json";
    const res = await fetch(`https://api.github.com/repos/${REPO.owner}/${REPO.repo}/${path}`, { ...opts, headers, cache: "no-store" });
    if (res.status === 404 && !opts.method) return null;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const hint = res.status === 401 ? " (token inválido o vencido)" : res.status === 403 ? " (sin permiso o límite de la API)" : "";
      const err = new Error(`GitHub ${res.status}${hint}: ${body.message || res.statusText}`);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  const encPath = (p) => p.split("/").map(encodeURIComponent).join("/");

  function decodeB64Json(b64) {
    const bytes = Uint8Array.from(atob(b64.replace(/\n/g, "")), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function encodeB64(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  }

  async function loadUsers(token) {
    const file = await gh(`contents/${USERS_PATH}`, token);
    if (!file) return { users: {}, sha: null };
    const data = decodeB64Json(file.content);
    return { users: (data && data.users) || {}, sha: file.sha };
  }

  function readBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] || "");
      r.onerror = () => reject(new Error("No se pudo leer el archivo."));
      r.readAsDataURL(file);
    });
  }

  function renderQR(container, url, size) {
    container.innerHTML = "";
    new QRCode(container, { text: url, width: size, height: size, correctLevel: QRCode.CorrectLevel.M });
  }

  function downloadQR(url, name) {
    const tmp = document.createElement("div");
    renderQR(tmp, url, 1024);
    const a = document.createElement("a");
    a.href = tmp.querySelector("canvas").toDataURL("image/png");
    a.download = `qr-${name}.png`;
    a.click();
  }

  function whatsappLink(f, extraClass) {
    const a = document.createElement("a");
    a.className = `btn wa ${extraClass || ""}`.trim();
    a.href = L.whatsappShareUrl(f.label.replace(/\.[^.]+$/, ""), f.url);
    a.target = "_blank"; a.rel = "noopener";
    a.textContent = "WhatsApp";
    return a;
  }

  async function copy(text, noteEl) {
    try { await navigator.clipboard.writeText(text); setMsg(noteEl, "Link copiado.", "ok"); }
    catch { setMsg(noteEl, text); }
  }

  // ---------- login ----------
  $("loginForm").onsubmit = async (e) => {
    e.preventDefault();
    const msg = $("lMsg");
    $("lBtn").disabled = true;
    setMsg(msg, "Verificando…");
    try {
      const user = L.normalizeUser($("lUser").value);
      const { users } = await loadUsers(null);
      if (!users[user]) throw new Error("Usuario o contraseña incorrectos");
      const token = await L.openToken(users[user], $("lPass").value);
      session = { user, token };
      storage.save(session, $("lRemember").checked);
      $("lPass").value = "";
      setMsg(msg, "");
      enterDashboard();
    } catch (err) {
      setMsg(msg, err.message, "err");
    } finally {
      $("lBtn").disabled = false;
    }
  };

  // ---------- setup ----------
  function addUserRow(name = "") {
    const row = document.createElement("div");
    row.className = "user-row";
    row.innerHTML = `
      <div><label>Usuario</label><input type="text" class="uName" autocapitalize="none" autocomplete="off"></div>
      <div><label>Contraseña (mín. 12)</label><input type="text" class="uPass" autocomplete="off"></div>
      <button type="button" class="ghost sm uGen">Generar</button>`;
    row.querySelector(".uName").value = name;
    row.querySelector(".uGen").onclick = () => { row.querySelector(".uPass").value = L.generatePassword(); };
    $("sUsers").appendChild(row);
  }

  $("sAdd").onclick = () => addUserRow();

  $("setupForm").onsubmit = async (e) => {
    e.preventDefault();
    const msg = $("sMsg");
    $("sBtn").disabled = true;
    try {
      const token = $("sToken").value.trim();
      if (!token) throw new Error("Falta el token.");
      const rows = [...document.querySelectorAll(".user-row")]
        .map((r) => ({ name: r.querySelector(".uName").value, pass: r.querySelector(".uPass").value }))
        .filter((r) => r.name.trim() || r.pass);
      if (!rows.length) throw new Error("Agregá al menos un usuario.");
      const entries = rows.map((r) => { const n = L.normalizeUser(r.name); L.validatePassword(r.pass); return { n, pass: r.pass }; });

      setMsg(msg, "Verificando el token…");
      const current = await loadUsers(token);
      setMsg(msg, "Cifrando…");
      const users = { ...current.users };
      for (const { n, pass } of entries) users[n] = await L.sealToken(token, pass);

      setMsg(msg, "Guardando en el repo…");
      await gh(`contents/${USERS_PATH}`, token, {
        method: "PUT",
        body: JSON.stringify({
          message: `Usuarios: ${entries.map((x) => x.n).join(", ")}`,
          content: encodeB64(JSON.stringify({ version: 1, users }, null, 2) + "\n"),
          ...(current.sha ? { sha: current.sha } : {}),
        }),
      });
      $("sToken").value = "";
      setMsg(msg, `Listo: ${entries.map((x) => x.n).join(", ")}. Guardá las contraseñas antes de salir de esta pantalla.`, "ok");
    } catch (err) {
      setMsg(msg, err.message, "err");
    } finally {
      $("sBtn").disabled = false;
    }
  };

  // ---------- dashboard ----------
  function logout() {
    session = null;
    storage.clear();
    files = [];
    show("vLogin");
  }
  $("dLogout").onclick = logout;

  function enterDashboard() {
    $("dUser").textContent = session.user;
    show("vDash");
    loadFiles();
  }

  async function authed(fn) {
    try {
      return await fn();
    } catch (err) {
      if (err.status === 401) { logout(); setMsg($("lMsg"), "La sesión expiró: el token de GitHub ya no es válido.", "err"); }
      throw err;
    }
  }

  const CONVERSION_TIMEOUT_MS = 15 * 60 * 1000;
  const REFRESH_MS = 30 * 1000;
  let refreshTimer = null;

  async function listDir(dir) {
    const items = (await authed(() => gh(`contents/${dir}`, session.token))) || [];
    return items.filter((i) => i.type === "file" && !i.name.startsWith("."));
  }

  async function loadFiles() {
    clearTimeout(refreshTimer);
    try {
      const [served, originals] = await Promise.all([listDir(L.FILES_DIR), listDir(L.ORIGINALS_DIR)]);
      const servedNames = new Set(served.map((i) => i.name));
      const originalByPdf = new Map(originals.map((o) => [L.pdfNameFor(o.name), o]));
      const ready = served.map((i) => ({
        ...i, ...L.parseFileName(i.name), original: originalByPdf.get(i.name) || null,
        url: L.publicUrl(REPO.owner, REPO.repo, i.path),
      }));
      const pending = originals
        .filter((o) => !servedNames.has(L.pdfNameFor(o.name)))
        .map((o) => {
          const pdf = L.pdfNameFor(o.name);
          const info = L.parseFileName(o.name);
          const failed = !!info.date && Date.now() - info.date.getTime() > CONVERSION_TIMEOUT_MS;
          return {
            ...o, ...info, name: pdf, pending: !failed, failed,
            url: L.publicUrl(REPO.owner, REPO.repo, `${L.FILES_DIR}/${pdf}`),
          };
        });
      files = [...ready, ...pending].sort((a, b) => b.name.localeCompare(a.name));
      renderStats();
      renderGrid();
      if (files.some((f) => f.pending)) refreshTimer = setTimeout(loadFiles, REFRESH_MS);
    } catch (err) {
      setMsg($("upMsg"), err.message, "err");
    }
  }

  function renderStats() {
    $("stCount").textContent = files.length;
    $("stSize").textContent = L.formatBytes(files.reduce((s, f) => s + f.size, 0));
    const last = files.find((f) => f.date);
    $("stLast").textContent = last ? last.date.toLocaleDateString("es-AR") : "–";
  }

  function renderGrid() {
    const q = $("search").value.trim().toLowerCase();
    const list = files.filter((f) => !q || f.label.toLowerCase().includes(q));
    const grid = $("grid");
    grid.innerHTML = "";
    $("empty").hidden = list.length > 0;
    $("empty").textContent = files.length ? "Ningún archivo coincide con la búsqueda." : "Todavía no hay archivos.";
    for (const f of list) {
      const card = document.createElement("div");
      card.className = "card file";
      const qr = document.createElement("div");
      qr.className = "qrbox";
      qr.title = "Ver QR";
      qr.onclick = () => openModal(f);
      renderQR(qr, f.url, 128);
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = f.label;
      const meta = document.createElement("div");
      meta.className = "meta";
      const status = f.pending ? "Convirtiendo a PDF…" : f.failed ? "No se pudo convertir" : L.formatBytes(f.size);
      meta.textContent = [status, f.date && f.date.toLocaleString("es-AR")].filter(Boolean).join(" · ");
      if (f.failed) meta.style.color = "var(--err)";
      const actions = document.createElement("div");
      actions.className = "row";
      const open = document.createElement(f.pending || f.failed ? "span" : "a");
      open.className = "btn ghost sm"; open.textContent = "Abrir";
      if (f.pending || f.failed) open.style.opacity = ".5";
      else { open.href = f.url; open.target = "_blank"; open.rel = "noopener"; }
      const png = document.createElement("button");
      png.className = "sm"; png.textContent = "QR PNG"; png.onclick = () => downloadQR(f.url, f.label);
      const wa = whatsappLink(f, "sm");
      const del = document.createElement("button");
      del.className = "danger sm"; del.textContent = "Eliminar"; del.onclick = () => removeFile(f);
      actions.append(open, wa, png, del);
      card.append(qr, name, meta, actions);
      grid.appendChild(card);
    }
  }
  $("search").oninput = renderGrid;

  async function upload(file) {
    const msg = $("upMsg");
    try {
      if (file.size > L.MAX_BYTES) throw new Error("El archivo supera 50 MB.");
      setMsg(msg, `Subiendo ${file.name}…`);
      const plan = L.planUpload(file.name);
      const content = await readBase64(file);
      await authed(() => gh(`contents/${encPath(plan.uploadPath)}`, session.token, {
        method: "PUT",
        body: JSON.stringify({ message: `Subir ${file.name} (${session.user})`, content }),
      }));
      setMsg(msg, plan.converts ? `Listo: ${file.name} subido. Se está convirtiendo a PDF.` : `Listo: ${file.name} subido.`, "ok");
      await loadFiles();
      const servedName = plan.servedPath.split("/").pop();
      const added = files.find((f) => f.name === servedName);
      if (added) openModal(added, plan.converts ? CONVERT_NOTE : PUBLISH_NOTE);
    } catch (err) {
      setMsg(msg, err.message, "err");
    }
  }

  async function removeFile(f) {
    if (!confirm(`¿Eliminar "${f.label}"? El QR dejará de funcionar.`)) return;
    const del = (item) => authed(() => gh(`contents/${encPath(item.path)}`, session.token, {
      method: "DELETE",
      body: JSON.stringify({ message: `Eliminar ${item.name} (${session.user})`, sha: item.sha }),
    }));
    try {
      await del(f);
      if (f.original) await del(f.original);
      setMsg($("upMsg"), `Eliminado: ${f.label}.`, "ok");
      await loadFiles();
    } catch (err) {
      setMsg($("upMsg"), err.message, "err");
    }
  }

  const drop = $("drop"), input = $("file");
  drop.onclick = () => input.click();
  input.onchange = () => { if (input.files[0]) upload(input.files[0]); input.value = ""; };
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = (e) => {
    e.preventDefault(); drop.classList.remove("over");
    if (e.dataTransfer.files[0]) upload(e.dataTransfer.files[0]);
  };

  // ---------- modal ----------
  let modalFile = null;
  function openModal(f, note) {
    modalFile = f;
    $("mName").textContent = f.label;
    renderQR($("mQr"), f.url, 240);
    $("mUrl").innerHTML = "";
    const a = document.createElement("a");
    a.href = f.url; a.target = "_blank"; a.rel = "noopener"; a.textContent = f.url;
    $("mUrl").appendChild(a);
    $("mWa").replaceWith(Object.assign(whatsappLink(f), { id: "mWa" }));
    setMsg($("mNote"), note || "");
    $("modal").hidden = false;
  }
  $("mClose").onclick = () => { $("modal").hidden = true; };
  $("modal").onclick = (e) => { if (e.target === $("modal")) $("modal").hidden = true; };
  $("mDl").onclick = () => modalFile && downloadQR(modalFile.url, modalFile.label);
  $("mCopy").onclick = () => modalFile && copy(modalFile.url, $("mNote"));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("modal").hidden = true; });

  // ---------- arranque ----------
  async function start() {
    if (location.hash === "#setup") {
      addUserRow(); addUserRow();
      show("vSetup");
      return;
    }
    session = storage.load();
    if (session && session.token) { enterDashboard(); return; }
    show("vLogin");
    try {
      const { users } = await loadUsers(null);
      if (!Object.keys(users).length) {
        setMsg($("lMsg"), "Todavía no hay usuarios. Configuralos en #setup.", "err");
        const a = document.createElement("a");
        a.href = "#setup"; a.textContent = " Ir a configurar";
        $("lMsg").appendChild(a);
      }
    } catch (err) {
      setMsg($("lMsg"), err.message, "err");
    }
  }
  window.addEventListener("hashchange", () => location.reload());
  start();
})();
