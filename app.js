(function () {
  const L = window.QRLib;
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k) { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
    set(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* storage bloqueado */ } },
  };

  const detected = L.detectRepo(location.hostname, location.pathname);
  $("owner").value = store.get("qr.owner") || (detected && detected.owner) || "";
  $("repo").value = store.get("qr.repo") || (detected && detected.repo) || "";
  $("token").value = store.get("qr.token");
  if (!$("token").value) $("cfg").open = true;

  function cfg() {
    const owner = $("owner").value.trim(), repo = $("repo").value.trim();
    if (!owner || !repo) throw new Error("Completá usuario y repositorio en Configuración.");
    return { owner, repo, token: $("token").value.trim() };
  }

  function setMsg(el, text, kind) {
    el.textContent = text;
    el.className = "msg" + (kind ? " " + kind : "");
  }

  async function gh(path, opts) {
    const { owner, repo, token } = cfg();
    const headers = { Accept: "application/vnd.github+json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (opts && opts.body) headers["Content-Type"] = "application/json";
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/${path}`, { ...opts, headers });
    if (res.status === 404 && (!opts || opts.method !== "PUT")) return null;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const hint = res.status === 401 ? " (token inválido)" : res.status === 403 ? " (sin permiso o límite de la API)" : "";
      throw new Error(`GitHub ${res.status}${hint}: ${body.message || res.statusText}`);
    }
    return res.json();
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

  function qrDataUrl(url) {
    const tmp = document.createElement("div");
    renderQR(tmp, url, 1024);
    return tmp.querySelector("canvas").toDataURL("image/png");
  }

  function downloadQR(url, name) {
    const a = document.createElement("a");
    a.href = qrDataUrl(url);
    a.download = `qr-${name}.png`;
    a.click();
  }

  let current = null;
  function showResult(url, name) {
    current = { url, name };
    renderQR($("qr"), url, 220);
    $("url").innerHTML = "";
    const a = document.createElement("a");
    a.href = url; a.target = "_blank"; a.rel = "noopener"; a.textContent = url;
    $("url").appendChild(a);
    $("result").hidden = false;
  }

  async function upload(file) {
    const msg = $("upMsg");
    $("result").hidden = true;
    try {
      const { owner, repo, token } = cfg();
      if (!token) throw new Error("Falta el token: abrilo en Configuración.");
      if (file.size > L.MAX_BYTES) throw new Error("El archivo supera 50 MB.");
      setMsg(msg, `Subiendo ${file.name}…`);
      const path = L.buildPath(file.name);
      const content = await readBase64(file);
      await gh(`contents/${path.split("/").map(encodeURIComponent).join("/")}`, {
        method: "PUT",
        body: JSON.stringify({ message: `Subir ${file.name}`, content }),
      });
      const url = L.publicUrl(owner, repo, path);
      setMsg(msg, "Listo. Archivo subido.", "ok");
      showResult(url, path.split("/").pop());
      loadList();
    } catch (e) {
      setMsg(msg, e.message, "err");
    }
  }

  async function loadList() {
    const list = $("list");
    try {
      const { owner, repo } = cfg();
      const items = ((await gh(`contents/${L.FILES_DIR}`)) || [])
        .filter((i) => i.type === "file" && !i.name.startsWith("."))
        .sort((a, b) => b.name.localeCompare(a.name));
      list.innerHTML = "";
      if (!items.length) { list.innerHTML = "<li>Todavía no hay archivos.</li>"; return; }
      for (const it of items) {
        const url = L.publicUrl(owner, repo, it.path);
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = url; a.target = "_blank"; a.rel = "noopener"; a.textContent = it.name;
        const btns = document.createElement("span");
        btns.className = "row"; btns.style.marginTop = "0";
        const show = document.createElement("button");
        show.className = "ghost"; show.textContent = "Ver QR";
        show.onclick = () => { showResult(url, it.name); $("result").scrollIntoView({ behavior: "smooth" }); };
        const dl = document.createElement("button");
        dl.textContent = "PNG";
        dl.onclick = () => downloadQR(url, it.name);
        btns.append(show, dl);
        li.append(a, btns);
        list.appendChild(li);
      }
    } catch (e) {
      list.innerHTML = "";
      const li = document.createElement("li");
      li.textContent = e.message;
      list.appendChild(li);
    }
  }

  $("save").onclick = () => {
    store.set("qr.owner", $("owner").value.trim());
    store.set("qr.repo", $("repo").value.trim());
    store.set("qr.token", $("token").value.trim());
    setMsg($("cfgMsg"), "Guardado en este navegador.", "ok");
    loadList();
  };
  $("forget").onclick = () => {
    $("token").value = "";
    store.set("qr.token", "");
    setMsg($("cfgMsg"), "Token eliminado de este navegador.", "ok");
  };

  const drop = $("drop"), input = $("file");
  drop.onclick = () => input.click();
  input.onchange = () => { if (input.files[0]) upload(input.files[0]); input.value = ""; };
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = (e) => {
    e.preventDefault(); drop.classList.remove("over");
    if (e.dataTransfer.files[0]) upload(e.dataTransfer.files[0]);
  };

  $("dl").onclick = () => current && downloadQR(current.url, current.name);
  $("copy").onclick = async () => {
    if (!current) return;
    try { await navigator.clipboard.writeText(current.url); setMsg($("note"), "Link copiado.", "ok"); }
    catch { setMsg($("note"), current.url); }
  };

  loadList();
})();
