(function () {
  "use strict";

  const REPO = "Joaqui-2006/catalogo-gorras";
  const BRANCH = "main";
  const TOKEN_KEY = "monarch_gh_token";          // se guarda SOLO en sessionStorage (muere al cerrar la pestaña)
  const SESSION_KEY = "monarch_admin_session";
  const PLACEHOLDER = "../assets/img/placeholder.svg";
  const DEFAULT_DESC = "Describe los materiales, visera y estilo de esta gorra.";
  const MIN_PASS = 14;
  const NEW_ITERATIONS = 600000;                 // PBKDF2-SHA256 (OWASP 2023+)
  const LEGACY_KEYS = [
    "monarch_custom_products", "monarch_custom_settings", // overrides locales antiguos (ya no se usan)
  ];

  const resolveAdminImg = (src) => {
    const s = String(src || "").trim();
    if (!s) return PLACEHOLDER;
    if (s.startsWith("data:") || s.startsWith("http")) return s;
    return "../" + s.replace(/^(\.\.\/|\/)+/, "");
  };
  const normImg = (src) => String(src || "").trim().replace(/^(\.\.\/|\/)+/, "");

  let categories = ["Snapback", "Trucker", "Dad Hat", "Edición limitada"];
  let publishedCategories = [...categories];
  let products = [];          // cada gorra puede llevar _img (foto pendiente de subir) — se quita al guardar
  let publishedImages = new Set(); // fotos que hay hoy publicadas en el repo (para borrar huérfanas)
  let dirty = false;          // hay cambios sin publicar
  let catsDirty = false;      // las categorías cambiaron

  const $ = (id) => document.getElementById(id);
  const escapeHTML = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  document.addEventListener("error", (e) => {
    const t = e.target;
    if (t && t.tagName === "IMG" && !t.dataset.failed) {
      t.dataset.failed = "1";
      t.src = PLACEHOLDER;
    }
  }, true);

  function markDirty() { dirty = true; }
  window.addEventListener("beforeunload", (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ""; }
  });

  /* ---------- Modal de confirmación ---------- */
  let bsConfirmModal = null;
  function askConfirm({
    title = "¿Estás seguro?",
    text = "",
    confirmText = "Sí, eliminar",
    previewImg = null,
    variant = "danger",
    icon = "bi-trash3-fill",
    onlyOk = false
  }) {
    return new Promise((resolve) => {
      const modalEl = $("confirmModal");
      if (!modalEl) return resolve(false);
      $("confirmModalTitle").textContent = title;
      $("confirmModalText").innerHTML = text; // quien llama debe escapar lo que sea dinámico

      const iconWrap = $("confirmModalIcon").parentElement;
      iconWrap.className = "confirm-icon-wrap" + (variant !== "danger" ? ` variant-${variant}` : "");
      $("confirmModalIcon").className = `bi ${icon}`;

      const okBtn = $("confirmModalOk");
      const cancelBtn = $("confirmModalCancel");
      cancelBtn.classList.toggle("d-none", !!onlyOk);

      if (variant === "success") {
        okBtn.className = "btn btn-accent px-4 flex-grow-1";
        okBtn.innerHTML = `<i class="bi bi-check2-circle me-1"></i> ${escapeHTML(confirmText)}`;
      } else if (variant === "warning") {
        okBtn.className = "btn btn-accent px-4 flex-grow-1";
        okBtn.innerHTML = `<i class="bi bi-check2 me-1"></i> ${escapeHTML(confirmText)}`;
      } else {
        okBtn.className = "btn btn-danger-glow px-4 flex-grow-1";
        okBtn.innerHTML = `<i class="bi bi-trash3-fill me-1"></i> ${escapeHTML(confirmText)}`;
      }

      const prevBox = $("confirmModalPreview");
      if (previewImg) {
        prevBox.innerHTML = `<img src="${escapeHTML(previewImg)}" alt="" class="confirm-preview-img">`;
        prevBox.classList.remove("d-none");
      } else {
        prevBox.innerHTML = "";
        prevBox.classList.add("d-none");
      }

      bsConfirmModal = bsConfirmModal || new bootstrap.Modal(modalEl);
      let decided = false;

      const onOk = () => {
        decided = true;
        cleanup();
        bsConfirmModal.hide();
        resolve(true);
      };
      const onHidden = () => {
        cleanup();
        if (!decided) resolve(false);
      };
      function cleanup() {
        okBtn.removeEventListener("click", onOk);
        modalEl.removeEventListener("hidden.bs.modal", onHidden);
      }

      okBtn.addEventListener("click", onOk);
      modalEl.addEventListener("hidden.bs.modal", onHidden);
      bsConfirmModal.show();
    });
  }

  /* ---------- Token de GitHub (solo sessionStorage; nunca se sube al repo) ---------- */
  function getToken() {
    try { return (sessionStorage.getItem(TOKEN_KEY) || "").trim(); } catch (e) { return ""; }
  }
  function setToken(v) {
    try {
      if (v) sessionStorage.setItem(TOKEN_KEY, v);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
  }

  function updateAuthBadge() {
    const b = $("authBadge");
    if (getToken()) {
      b.textContent = "Publicación activa";
      b.className = "status-pill bg-success bg-opacity-25 text-success";
    } else {
      b.textContent = "Falta llave de publicación";
      b.className = "status-pill bg-warning bg-opacity-25 text-warning";
    }
  }

  function showAlert(msg, type = "info") {
    const box = $("alertBox");
    box.className = `alert alert-${type}`;
    box.innerHTML = msg; // los mensajes dinámicos se escapan antes de llegar aquí
    box.classList.remove("d-none");
  }

  const NEEDS_TOKEN_MSG =
    'Falta la <strong>llave de publicación</strong> (token de GitHub). Pégala en la pestaña <strong>Seguridad y Cuenta</strong>. Sin ella no se puede publicar nada.';

  /* ---------- Compresión de imagen en navegador ---------- */
  function compressImage(file, maxSize = 1000, quality = 0.84) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let w = img.width;
          let h = img.height;
          if (w > maxSize || h > maxSize) {
            if (w > h) { h = Math.round((h * maxSize) / w); w = maxSize; }
            else { w = Math.round((w * maxSize) / h); h = maxSize; }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          // Fondo blanco: los PNG con transparencia no deben quedar negros al pasar a JPEG
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          const base64 = dataUrl.split(",")[1];
          const cleanName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
          const fileName = `gorra-${Date.now()}-${cleanName.slice(0, 28)}.jpg`;
          resolve({ fileName, base64, dataUrl });
        };
        img.onerror = () => reject(new Error("El archivo no parece ser una imagen válida."));
        img.src = ev.target.result;
      };
      reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
      reader.readAsDataURL(file);
    });
  }

  /* ---------- Categorías ---------- */
  function renderCategories() {
    const box = $("categoriesPills");
    const sel = $("deleteCategorySelect");
    if (sel) {
      sel.innerHTML = categories.map((cat, idx) => {
        const count = products.filter((p) => p.category === cat).length;
        return `<option value="${idx}">${escapeHTML(cat)} (${count} ${count === 1 ? "gorra" : "gorras"})</option>`;
      }).join("");
    }
    if (!box) return;
    if (!categories.length) {
      box.innerHTML = '<span class="small text-secondary">No hay categorías creadas. Agrega una arriba.</span>';
      return;
    }
    box.innerHTML = categories.map((cat, idx) => {
      const count = products.filter((p) => p.category === cat).length;
      return `
        <span class="badge rounded-pill d-inline-flex align-items-center gap-2 px-3 py-2" style="background:#141a2e;border:1px solid rgba(43,92,255,.45);font-size:.82rem">
          <span>${escapeHTML(cat)} <small class="text-secondary">(${count})</small></span>
          <button type="button" class="btn-close btn-close-white" style="font-size:.55rem" data-del-cat="${idx}" title="Eliminar categoría «${escapeHTML(cat)}»"></button>
        </span>`;
    }).join("");
  }

  async function removeCategoryByIndex(idx) {
    const catName = categories[idx];
    if (!catName) return;
    const inUse = products.filter((p) => p.category === catName).length;
    const text = inUse > 0
      ? `Se eliminará la categoría <strong class="text-light">«${escapeHTML(catName)}»</strong> junto con sus <strong class="text-danger">${inUse} gorra(s)</strong>.`
      : `Se eliminará la categoría <strong class="text-light">«${escapeHTML(catName)}»</strong> de los filtros de la tienda.`;
    const ok = await askConfirm({ title: "Eliminar categoría", text, confirmText: "Eliminar categoría" });
    if (!ok) return;
    if (inUse > 0) products = products.filter((p) => p.category !== catName);
    categories.splice(idx, 1);
    if (!categories.length) categories.push("General");
    catsDirty = true;
    markDirty();
    renderCaps();
    showAlert(`Categoría <strong>«${escapeHTML(catName)}»</strong> eliminada. Pulsa <strong>Guardar y publicar cambios</strong> para actualizar la tienda.`, "warning");
  }

  /* ---------- Lista de gorras ---------- */
  function renderCaps() {
    $("capCounter").textContent = `${products.length} ${products.length === 1 ? "gorra" : "gorras"}`;
    renderCategories();
    const box = $("capsList");
    if (!products.length) {
      box.innerHTML = `<div class="panel-card text-center text-secondary py-5">No hay gorras. Pulsa <strong>Nueva gorra</strong> para agregar la primera.</div>`;
      return;
    }

    box.innerHTML = products.map((p, i) => {
      const previewSrc = p._img ? p._img.dataUrl : resolveAdminImg(p.image);
      const cats = categories.includes(p.category) ? categories : [...categories, p.category];
      const pathLabel = p._img ? `${normImg(p.image)} (pendiente por guardar)` : normImg(p.image);
      return `
        <div class="cap-row" data-idx="${i}">
          <div class="d-flex flex-column flex-md-row gap-3 align-items-start">
            <div class="text-center">
              <img src="${escapeHTML(previewSrc)}" alt="" class="cap-preview mb-2" data-preview="${i}">
              <div>
                <label class="btn btn-outline-info btn-sm rounded-pill w-100" style="font-size:.78rem">
                  <i class="bi bi-camera-fill"></i> Cambiar foto
                  <input type="file" accept="image/*" class="d-none" data-file="${i}">
                </label>
              </div>
            </div>

            <div class="flex-grow-1 w-100">
              <div class="row g-2">
                <div class="col-md-5">
                  <label class="form-label small text-secondary mb-1">Nombre de la gorra</label>
                  <input type="text" class="form-control form-control-sm" data-field="name" data-idx="${i}" value="${escapeHTML(p.name)}">
                </div>
                <div class="col-6 col-md-3">
                  <label class="form-label small text-secondary mb-1">Precio (COP)</label>
                  <input type="number" class="form-control form-control-sm" data-field="price" data-idx="${i}" value="${Number(p.price) || 0}" min="0" step="1000">
                </div>
                <div class="col-6 col-md-4">
                  <label class="form-label small text-secondary mb-1">Categoría</label>
                  <select class="form-select form-select-sm" data-field="category" data-idx="${i}">
                    ${cats.map((c) => `<option value="${escapeHTML(c)}"${c === p.category ? " selected" : ""}>${escapeHTML(c)}</option>`).join("")}
                  </select>
                </div>
                <div class="col-12">
                  <label class="form-label small text-secondary mb-1">Descripción</label>
                  <textarea class="form-control form-control-sm" rows="2" data-field="description" data-idx="${i}">${escapeHTML(p.description)}</textarea>
                </div>
                <div class="col-12 d-flex justify-content-between align-items-center pt-1">
                  <span class="small text-secondary">Ruta de imagen: <code data-path="${i}">${escapeHTML(pathLabel)}</code></span>
                  <div class="btn-group btn-group-sm">
                    <button type="button" class="btn btn-outline-secondary" data-move="-1" data-idx="${i}" title="Subir" ${i === 0 ? "disabled" : ""}><i class="bi bi-arrow-up"></i></button>
                    <button type="button" class="btn btn-outline-secondary" data-move="1" data-idx="${i}" title="Bajar" ${i === products.length - 1 ? "disabled" : ""}><i class="bi bi-arrow-down"></i></button>
                    <button type="button" class="btn btn-outline-danger" data-del="${i}" title="Eliminar gorra"><i class="bi bi-trash"></i> Eliminar</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>`;
    }).join("");
  }

  /* ---------- GitHub API ---------- */
  const ghHeaders = (token, json) => ({
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    ...(json ? { "Content-Type": "application/json" } : {})
  });

  async function ghGetSha(path, token) {
    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}?ref=${BRANCH}`, {
      headers: ghHeaders(token), cache: "no-store"
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub (${res.status}) al consultar ${path}`);
    const j = await res.json();
    return j.sha || null;
  }

  // Lee un archivo del repo SIEMPRE actualizado (la caché de GitHub Pages puede tardar minutos).
  async function ghGetText(path, token) {
    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}?ref=${BRANCH}`, {
      headers: ghHeaders(token), cache: "no-store"
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub (${res.status}) al leer ${path}`);
    const j = await res.json();
    const bin = atob(String(j.content || "").replace(/\n/g, ""));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  async function ghPutFile(path, base64Content, message, token) {
    const sha = await ghGetSha(path, token);
    const body = { message, content: base64Content, branch: BRANCH };
    if (sha) body.sha = sha;
    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
      method: "PUT",
      headers: ghHeaders(token, true),
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Error HTTP ${res.status} subiendo ${path}`);
    }
    return res.json();
  }

  async function ghDeleteFile(path, message, token) {
    const sha = await ghGetSha(path, token);
    if (!sha) return;
    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
      method: "DELETE",
      headers: ghHeaders(token, true),
      body: JSON.stringify({ message, sha, branch: BRANCH })
    });
    if (!res.ok) throw new Error(`Error HTTP ${res.status} borrando ${path}`);
  }

  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin);
  }

  /* ---------- Cargar datos (siempre desde el repo, nunca de una copia local) ---------- */
  async function loadJson(path) {
    const token = getToken();
    if (token) {
      try {
        const txt = await ghGetText(`content/${path}`, token);
        if (txt) return JSON.parse(txt);
      } catch (e) {
        showAlert(`No pude leer <code>${escapeHTML(path)}</code> con tu llave (${escapeHTML(e.message)}). Muestro la versión pública, que puede estar desactualizada.`, "warning");
      }
    }
    const res = await fetch(`../content/${path}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function loadCatalog() {
    try {
      const data = await loadJson("products.json");
      products = (Array.isArray(data.products) ? data.products : []).map((p) => ({
        name: String(p.name ?? ""),
        price: Number(p.price) || 0,
        category: String(p.category ?? ""),
        description: String(p.description ?? ""),
        image: normImg(p.image) || "assets/img/placeholder.svg"
      }));
      publishedImages = new Set(products.map((p) => normImg(p.image)));
      renderCaps();
    } catch (e) {
      showAlert("No se pudo cargar el catálogo: " + escapeHTML(e.message), "danger");
    }
  }

  /* ---------- Guardar y publicar ---------- */
  function validateProducts() {
    const issues = [];
    const seen = new Set();
    products.forEach((p) => {
      const n = String(p.name || "").trim();
      const label = n ? `«${escapeHTML(n)}»` : "(sin nombre)";
      if (!n) issues.push("Hay una gorra sin nombre.");
      const key = n.toLowerCase();
      if (n && seen.has(key)) issues.push(`Nombre repetido: ${label}. El pedido usa el nombre, así que se mezclarían.`);
      seen.add(key);
      if (!(Number(p.price) > 0)) issues.push(`${label} no tiene precio.`);
      const d = String(p.description || "").trim();
      if (!d || d === DEFAULT_DESC) issues.push(`${label} tiene la descripción de ejemplo.`);
      const img = normImg(p.image);
      if (!p._img && (!img || /placeholder\.svg$/i.test(img))) issues.push(`${label} no tiene foto.`);
    });
    return issues;
  }

  function cleanProductsForPublish() {
    return products.map((p) => ({
      name: String(p.name).trim(),
      price: Number(p.price) || 0,
      category: p.category,
      description: String(p.description || "").trim(),
      image: normImg(p.image)
    }));
  }

  async function saveAllToGitHub() {
    const token = getToken();
    if (!token) { showAlert(NEEDS_TOKEN_MSG, "warning"); return; }

    const issues = validateProducts();
    if (issues.length) {
      const shown = issues.slice(0, 8).map((t) => "• " + t).join("<br>");
      const more = issues.length > 8 ? `<br>…y ${issues.length - 8} más.` : "";
      const ok = await askConfirm({
        title: "Revisa antes de publicar",
        text: `Esto lo verán tus clientes:<br><br>${shown}${more}`,
        confirmText: "Publicar de todos modos",
        variant: "warning",
        icon: "bi-exclamation-triangle-fill"
      });
      if (!ok) return;
    }

    const btn = $("btnSaveAll");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Publicando...`;

    try {
      // 1) Fotos nuevas
      for (const p of products) {
        if (!p._img) continue;
        showAlert(`Subiendo fotografía <code>${escapeHTML(p._img.fileName)}</code>...`, "info");
        await ghPutFile(`assets/img/${p._img.fileName}`, p._img.base64, `Subir imagen ${p._img.fileName} desde panel admin`, token);
        p.image = `assets/img/${p._img.fileName}`;
        delete p._img;
      }

      // 2) Catálogo
      const clean = cleanProductsForPublish();
      await ghPutFile("content/products.json", utf8ToBase64(JSON.stringify({ products: clean }, null, 2) + "\n"),
        "Actualizar catálogo de gorras desde panel admin", token);

      // 3) Categorías (solo si cambiaron)
      if (catsDirty) {
        const current = await loadJson("settings.json").catch(() => ({}));
        const next = { ...current, categories: [...categories] };
        await ghPutFile("content/settings.json", utf8ToBase64(JSON.stringify(next, null, 2) + "\n"),
          "Actualizar categorías del catálogo desde panel admin", token);
        publishedCategories = [...categories];
        catsDirty = false;
      }

      // 4) Fotos huérfanas subidas por el panel (gorra-*.jpg) que ya nadie usa
      const nowUsed = new Set(clean.map((p) => p.image));
      let removed = 0;
      for (const img of publishedImages) {
        if (nowUsed.has(img) || !/^assets\/img\/gorra-[^/]+\.jpg$/i.test(img)) continue;
        try { await ghDeleteFile(img, `Borrar imagen sin uso ${img}`, token); removed++; } catch (e) { /* no es crítico */ }
      }
      publishedImages = nowUsed;

      dirty = false;
      renderCaps();
      showAlert(
        '<i class="bi bi-check-circle-fill me-1"></i> <strong>¡Publicado!</strong> La tienda se actualiza en 1 a 2 minutos.' +
        (removed ? ` Se borraron ${removed} foto(s) sin uso.` : ""), "success");
    } catch (err) {
      showAlert(`<i class="bi bi-exclamation-triangle-fill me-1"></i> <strong>No se pudo publicar.</strong> ${escapeHTML(err.message)}. Tus cambios siguen en pantalla; vuelve a pulsar Guardar.`, "danger");
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="bi bi-cloud-arrow-up-fill me-1"></i> Guardar y publicar cambios`;
    }
  }

  /* ---------- WhatsApp y redes ---------- */
  let siteSettings = {
    tagline: "More than caps",
    whatsappNumber: "573156994134",
    categories: [...categories],
    social: { instagram: "", tiktok: "", facebook: "" }
  };

  async function loadSiteSettings() {
    try {
      const remote = await loadJson("settings.json");
      siteSettings = { ...siteSettings, ...remote, social: { ...siteSettings.social, ...(remote.social || {}) } };
    } catch (e) {
      showAlert("No se pudo cargar la configuración: " + escapeHTML(e.message), "danger");
    }
    if (Array.isArray(siteSettings.categories) && siteSettings.categories.length) {
      categories = [...siteSettings.categories];
      publishedCategories = [...categories];
      renderCaps();
    }
    if ($("setWhatsapp")) $("setWhatsapp").value = siteSettings.whatsappNumber || "";
    if ($("setTagline")) $("setTagline").value = siteSettings.tagline || "More than caps";
    if ($("setInstagram")) $("setInstagram").value = siteSettings.social.instagram || "";
    if ($("setTiktok")) $("setTiktok").value = siteSettings.social.tiktok || "";
    if ($("setFacebook")) $("setFacebook").value = siteSettings.social.facebook || "";
  }

  async function saveSiteSettings(e) {
    if (e) e.preventDefault();
    const btn = $("btnSaveSocial");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Guardando...`;

    try {
      const token = getToken();
      if (!token) { showAlert(NEEDS_TOKEN_MSG, "warning"); return; }

      const cleanWa = ($("setWhatsapp").value || "").replace(/\D/g, "");
      if (cleanWa.length < 10) throw new Error("Ingresa un número de WhatsApp válido con indicativo (ej. 573156994134).");

      const social = {};
      for (const [k, id] of [["instagram", "setInstagram"], ["tiktok", "setTiktok"], ["facebook", "setFacebook"]]) {
        const raw = ($(id).value || "").trim();
        if (raw && !UTIL.safeUrl(raw)) throw new Error(`El enlace de ${k} debe empezar por https://`);
        social[k] = raw;
      }

      siteSettings = {
        tagline: ($("setTagline").value || "More than caps").trim(),
        whatsappNumber: cleanWa,
        categories: [...publishedCategories],   // solo las categorías ya publicadas
        social
      };

      await ghPutFile("content/settings.json", utf8ToBase64(JSON.stringify(siteSettings, null, 2) + "\n"),
        "Actualizar WhatsApp y redes sociales desde panel admin", token);
      showAlert('<i class="bi bi-check-circle-fill me-1"></i> <strong>¡WhatsApp y redes publicados!</strong> Se verán en la tienda en 1 a 2 minutos.', "success");
    } catch (err) {
      showAlert(`<i class="bi bi-exclamation-triangle-fill me-1"></i> ${escapeHTML(err.message)}`, "danger");
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="bi bi-cloud-arrow-up-fill me-1"></i> Guardar WhatsApp y Redes Sociales`;
    }
  }

  /* ---------- Estadísticas (Abacus global + actividad local de este navegador) ---------- */
  async function fetchAbacusVal(key) {
    try {
      const res = await fetch(`${CONFIG.statsBase}/get/${CONFIG.statsNamespace}/${key}`, { cache: "no-store" });
      if (!res.ok) return 0;
      const d = await res.json();
      return Number(d.value) || 0;
    } catch (e) {
      return 0;
    }
  }

  function readLocalStats() {
    try {
      return JSON.parse(localStorage.getItem("monarch_local_stats") || "null") || null;
    } catch (e) { return null; }
  }

  // Últimos 7 días en hora de Colombia (misma zona con la que se registran las visitas)
  function last7Days() {
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 864e5);
      out.push({
        key: UTIL.dayKey(d),
        label: d.toLocaleDateString("es-CO", { timeZone: CONFIG.statsTimezone, weekday: "short", day: "numeric" })
      });
    }
    return out;
  }

  async function productNames() {
    if (products.length) return products.map((p) => String(p.name).trim()).filter(Boolean);
    try {
      const data = await loadJson("products.json");
      return (data.products || []).map((p) => String(p.name || "").trim()).filter(Boolean);
    } catch (e) { return []; }
  }

  async function loadStats() {
    const local = readLocalStats() || {
      totalVisits: 0, totalWhatsappClicks: 0, totalCartAdds: 0, totalOrderSends: 0,
      byDate: {}, byProduct: {}, recentEvents: []
    };
    const days = last7Days();
    const names = [...new Set(await productNames())];

    const [gV, gW, gC, gO, ...rest] = await Promise.all([
      fetchAbacusVal("visits"),
      fetchAbacusVal("whatsapp"),
      fetchAbacusVal("cart-adds"),
      fetchAbacusVal("orders"),
      ...days.map((d) => fetchAbacusVal(`day-${d.key}`)),
      ...names.map((n) => fetchAbacusVal(`p-${UTIL.slug(n)}`))
    ]);
    const dayVals = rest.slice(0, days.length);
    const prodVals = rest.slice(days.length);

    const localProd = (n) => {
      const m = (local.byProduct || {})[n] || {};
      return (m.views || 0) + (m.wa || 0) + (m.cart || 0);
    };

    renderStats({
      totalVisits: Math.max(local.totalVisits || 0, gV),
      totalWhatsappClicks: Math.max(local.totalWhatsappClicks || 0, gW),
      totalCartAdds: Math.max(local.totalCartAdds || 0, gC),
      totalOrderSends: Math.max(local.totalOrderSends || 0, gO),
      days: days.map((d, i) => ({
        label: d.label,
        v: Math.max(((local.byDate || {})[d.key] || {}).visits || 0, dayVals[i])
      })),
      products: names.map((n, i) => ({ name: n, n: Math.max(localProd(n), prodVals[i]) })),
      recentEvents: local.recentEvents || []
    });
  }

  function renderStats(s) {
    $("kpiVisits").textContent = s.totalVisits || 0;
    $("kpiWa").textContent = s.totalWhatsappClicks || 0;
    $("kpiCart").textContent = s.totalCartAdds || 0;
    $("kpiOrders").textContent = s.totalOrderSends || 0;

    const maxV = Math.max(1, ...s.days.map((d) => d.v));
    $("chart7Days").innerHTML = s.days.map((d) => {
      const pct = Math.max(6, Math.round((d.v / maxV) * 100));
      return `
        <div class="day-col">
          <span class="day-num">${d.v}</span>
          <div class="day-bar" style="height:${pct}%"></div>
          <span class="day-lbl">${escapeHTML(d.label)}</span>
        </div>`;
    }).join("");

    const entries = s.products.filter((p) => p.n > 0).sort((a, b) => b.n - a.n).slice(0, 6);
    const topBox = $("topProducts");
    if (!entries.length) {
      topBox.innerHTML = `<p class="text-secondary small mb-0">Aún no hay interacciones con gorras individuales. Se registrarán cuando los visitantes abran una gorra, consulten por WhatsApp o la agreguen al pedido.</p>`;
    } else {
      const max = Math.max(1, entries[0].n);
      topBox.innerHTML = entries.map((e) => `
        <div class="mb-3">
          <div class="d-flex justify-content-between small mb-1">
            <strong>${escapeHTML(e.name)}</strong>
            <span class="text-secondary">${e.n} interacciones</span>
          </div>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.round((e.n / max) * 100)}%"></div></div>
        </div>`).join("");
    }

    const labels = {
      visit: '<span class="badge bg-primary bg-opacity-25 text-info">Visita al catálogo</span>',
      view: '<span class="badge bg-secondary bg-opacity-25 text-light">Vio detalle de gorra</span>',
      wa: '<span class="badge bg-success bg-opacity-25 text-success">Clic en WhatsApp</span>',
      cart: '<span class="badge bg-info bg-opacity-25 text-info">Agregó al pedido</span>',
      order: '<span class="badge bg-warning bg-opacity-25 text-warning">Envió pedido por WhatsApp</span>'
    };
    $("recentTable").innerHTML = s.recentEvents.length
      ? s.recentEvents.map((ev) => `
          <tr>
            <td class="small text-secondary">${escapeHTML(new Date(ev.ts).toLocaleString("es-CO"))}</td>
            <td>${labels[ev.type] || escapeHTML(ev.type)}</td>
            <td>${ev.product ? escapeHTML(ev.product) : '<span class="text-secondary">—</span>'}</td>
          </tr>`).join("")
      : `<tr><td colspan="3" class="text-center text-secondary py-3">Sin actividad registrada en este navegador.</td></tr>`;
  }

  /* ---------- Eventos de interfaz ---------- */
  function bindEvents() {
    const list = $("capsList");

    list.addEventListener("input", (e) => {
      const el = e.target;
      const idx = Number(el.dataset.idx);
      const field = el.dataset.field;
      if (Number.isNaN(idx) || !field || !products[idx]) return;
      products[idx][field] = field === "price" ? Number(el.value) || 0 : el.value;
      markDirty();
    });

    list.addEventListener("change", async (e) => {
      const fileInput = e.target.closest("[data-file]");
      if (!fileInput || !fileInput.files[0]) return;
      const idx = Number(fileInput.dataset.file);
      const cap = products[idx];
      if (!cap) return;
      try {
        const compressed = await compressImage(fileInput.files[0]);
        cap._img = compressed;                              // la foto viaja con SU gorra, no con una posición
        cap.image = `assets/img/${compressed.fileName}`;
        markDirty();
        renderCaps();
        showAlert(`Foto lista para <strong>${escapeHTML(cap.name)}</strong>. Pulsa <strong>Guardar y publicar cambios</strong> arriba a la derecha.`, "info");
      } catch (err) {
        showAlert("No se pudo procesar la imagen: " + escapeHTML(err.message), "danger");
      } finally {
        fileInput.value = "";
      }
    });

    list.addEventListener("click", (e) => {
      const del = e.target.closest("[data-del]");
      if (del) {
        const cap = products[Number(del.dataset.del)];
        if (!cap) return;
        askConfirm({
          title: "Eliminar gorra",
          text: `¿Seguro que deseas eliminar la gorra <strong class="text-light">«${escapeHTML(cap.name)}»</strong> del catálogo?`,
          confirmText: "Sí, eliminar gorra",
          previewImg: cap._img ? cap._img.dataUrl : resolveAdminImg(cap.image)
        }).then((ok) => {
          if (!ok) return;
          const at = products.indexOf(cap);          // posición actual (puede haber cambiado)
          if (at === -1) return;
          products.splice(at, 1);
          markDirty();
          renderCaps();
          showAlert(`Gorra <strong>«${escapeHTML(cap.name)}»</strong> eliminada. Pulsa <strong>Guardar y publicar cambios</strong> para actualizar la tienda.`, "warning");
        });
        return;
      }
      const move = e.target.closest("[data-move]");
      if (move) {
        const idx = Number(move.dataset.idx);
        const target = idx + Number(move.dataset.move);
        if (target >= 0 && target < products.length) {
          [products[idx], products[target]] = [products[target], products[idx]];
          markDirty();
          renderCaps();
        }
      }
    });

    if ($("btnAddCategory")) {
      const handleAddCategory = () => {
        const inp = $("newCategoryInput");
        const val = (inp.value || "").trim();
        if (!val) {
          askConfirm({
            title: "Escribe un nombre",
            text: "Por favor escribe el nombre de la nueva categoría antes de agregarla (por ejemplo: <strong class='text-light'>Beanie</strong> o <strong class='text-light'>Gorra Plana</strong>).",
            confirmText: "Entendido", variant: "warning", icon: "bi-exclamation-circle-fill", onlyOk: true
          });
          return;
        }
        if (categories.some((c) => c.toLowerCase() === val.toLowerCase())) {
          askConfirm({
            title: "Categoría ya existente",
            text: `La categoría <strong class="text-light">«${escapeHTML(val)}»</strong> ya existe en tu catálogo.`,
            confirmText: "Entendido", variant: "warning", icon: "bi-info-circle-fill", onlyOk: true
          });
          return;
        }
        categories.push(val);
        catsDirty = true;
        markDirty();
        renderCaps();
        inp.value = "";
        showAlert(`Categoría <strong>«${escapeHTML(val)}»</strong> agregada. Pulsa <strong>Guardar y publicar cambios</strong> para publicarla.`, "success");
      };
      $("btnAddCategory").addEventListener("click", handleAddCategory);
      if ($("newCategoryInput")) {
        $("newCategoryInput").addEventListener("keydown", (e) => {
          if (e.key === "Enter") { e.preventDefault(); handleAddCategory(); }
        });
      }
    }

    if ($("categoriesPills")) {
      $("categoriesPills").addEventListener("click", (e) => {
        const btn = e.target.closest("[data-del-cat]");
        if (btn) removeCategoryByIndex(Number(btn.dataset.delCat));
      });
    }

    if ($("btnDeleteCategory")) {
      $("btnDeleteCategory").addEventListener("click", () => {
        const sel = $("deleteCategorySelect");
        if (sel && sel.value !== "") removeCategoryByIndex(Number(sel.value));
      });
    }

    $("btnAddCap").addEventListener("click", () => {
      products.unshift({
        name: "Nueva Gorra Monarch",
        price: 85000,
        category: categories[0] || "Snapback",
        description: DEFAULT_DESC,
        image: "assets/img/placeholder.svg"
      });
      markDirty();
      renderCaps();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    $("btnSaveAll").addEventListener("click", saveAllToGitHub);
    if ($("socialForm")) $("socialForm").addEventListener("submit", saveSiteSettings);

    // --- Llave de publicación ---
    $("btnSaveToken").addEventListener("click", async () => {
      const v = $("ghToken").value.trim();
      if (!v) { showAlert("Pega primero tu token de GitHub.", "warning"); return; }
      try {
        const res = await fetch(`https://api.github.com/repos/${REPO}`, { headers: ghHeaders(v), cache: "no-store" });
        if (res.status === 401) throw new Error("GitHub rechazó el token (inválido o vencido).");
        if (res.status === 404) throw new Error("El token no tiene acceso a este repositorio.");
        if (!res.ok) throw new Error(`GitHub respondió ${res.status}.`);
        const info = await res.json();
        if (info.permissions && info.permissions.push === false) {
          throw new Error("El token solo puede leer. Necesita el permiso Contents: Read and write.");
        }
      } catch (err) {
        showAlert(`<i class="bi bi-exclamation-triangle-fill me-1"></i> ${escapeHTML(err.message)}`, "danger");
        return;
      }
      setToken(v);
      $("ghToken").value = "";
      updateAuthBadge();
      showAlert('<i class="bi bi-check-circle-fill me-1"></i> Llave verificada. Ya puedes publicar. Se borra al cerrar esta pestaña.', "success");
      if (!dirty) { await loadCatalog(); await loadSiteSettings(); }
    });

    $("btnClearToken").addEventListener("click", () => {
      setToken("");
      $("ghToken").value = "";
      updateAuthBadge();
      showAlert("Llave eliminada de este navegador.", "info");
    });

    $("btnToggleToken").addEventListener("click", () => {
      const inp = $("ghToken");
      inp.type = inp.type === "password" ? "text" : "password";
    });

    $("btnRefreshStats").addEventListener("click", loadStats);
    $("btnTabVisitas").addEventListener("shown.bs.tab", loadStats);

    $("btnResetStats").addEventListener("click", async () => {
      const ok = await askConfirm({
        title: "Reiniciar contadores locales",
        text: "Se borrará la actividad guardada en <strong class='text-light'>este navegador</strong>. Los contadores globales de visitantes viven en un servicio externo y <strong class='text-light'>no se pueden reiniciar desde aquí</strong>.",
        confirmText: "Sí, borrar locales"
      });
      if (!ok) return;
      try { localStorage.removeItem("monarch_local_stats"); } catch (e) {}
      loadStats();
    });
  }

  /* ---------- Autenticación (Web Crypto) ---------- */
  // OJO: es una barrera de comodidad, no seguridad real. El hash está en un archivo público;
  // lo que de verdad protege el sitio es que solo tú tienes el token de GitHub.
  const LOCAL_CREDS_KEY = "monarch_custom_creds";
  const LOCKOUT_KEY = "monarch_login_lockout";
  function getLockoutState() {
    try { return JSON.parse(localStorage.getItem(LOCKOUT_KEY) || "null") || { fails: 0, until: 0 }; }
    catch (e) { return { fails: 0, until: 0 }; }
  }
  function setLockoutState(st) {
    try { localStorage.setItem(LOCKOUT_KEY, JSON.stringify(st)); } catch (e) {}
  }
  function timingSafeEqualHex(a, b) {
    const sa = String(a || "");
    const sb = String(b || "");
    if (sa.length !== sb.length) return false;
    let diff = 0;
    for (let i = 0; i < sa.length; i++) diff |= sa.charCodeAt(i) ^ sb.charCodeAt(i);
    return diff === 0;
  }

  async function pbkdf2Hex(password, salt, iterations = 60000) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: enc.encode(salt), iterations, hash: "SHA-256" },
      keyMaterial,
      256
    );
    return Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Siempre se intenta primero el archivo público (con anti-caché). La copia local solo vale
  // unos minutos tras cambiar la contraseña, mientras GitHub Pages termina de publicar el cambio.
  async function loadAuthConfig() {
    let remote = null;
    try {
      const res = await fetch(`../content/auth.json?t=${Date.now()}`, { cache: "no-store" });
      if (res.ok) remote = await res.json();
    } catch (e) {}
    let local = null;
    try { local = JSON.parse(localStorage.getItem(LOCAL_CREDS_KEY) || "null"); } catch (e) {}
    if (local && local.passwordHash && local.savedAt && Date.now() - local.savedAt < 15 * 60 * 1000 &&
        (!remote || remote.passwordHash !== local.passwordHash)) {
      return local;
    }
    try { localStorage.removeItem(LOCAL_CREDS_KEY); } catch (e) {}
    if (!remote) throw new Error("No se pudo cargar la configuración de acceso. Revisa tu conexión.");
    return remote;
  }

  async function initPanelData() {
    await Promise.all([loadCatalog(), loadSiteSettings()]);
    loadStats();
  }

  function unlockAdminPanel(username) {
    $("loginScreen").classList.add("d-none");
    $("adminApp").classList.remove("d-none");
    $("userBadge").innerHTML = `<i class="bi bi-person-check-fill me-1"></i>${escapeHTML(username)}`;
    $("newAdminUser").value = username;
    updateAuthBadge();
    initPanelData();
  }

  function lockAdminPanel() {
    localStorage.removeItem(SESSION_KEY);
    setToken("");
    $("adminApp").classList.add("d-none");
    $("loginScreen").classList.remove("d-none");
    $("loginPass").value = "";
  }

  async function checkExistingSession() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return;
    try {
      const sess = JSON.parse(raw);
      const cfg = await loadAuthConfig();
      if (sess && sess.exp > Date.now() && sess.h === cfg.passwordHash) {
        unlockAdminPanel(cfg.username || "admin");
        return;
      }
    } catch (e) {}
    localStorage.removeItem(SESSION_KEY);
  }

  function bindAuthEvents() {
    $("btnToggleLoginPass").addEventListener("click", () => {
      const inp = $("loginPass");
      inp.type = inp.type === "password" ? "text" : "password";
    });

    $("loginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const errBox = $("loginError");
      errBox.classList.add("d-none");
      const btn = $("btnLoginSubmit");
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Verificando...`;

      try {
        const lock = getLockoutState();
        if (lock.until > Date.now()) {
          const secs = Math.ceil((lock.until - Date.now()) / 1000);
          throw new Error(`Demasiados intentos fallidos. Espera ${secs} segundos antes de volver a intentar.`);
        }
        const cfg = await loadAuthConfig();
        const userIn = $("loginUser").value.trim();
        const passIn = $("loginPass").value;
        const hash = await pbkdf2Hex(passIn, cfg.salt, cfg.iterations || 60000);
        const userOk = userIn.toLowerCase() === String(cfg.username).toLowerCase();
        const passOk = timingSafeEqualHex(hash, cfg.passwordHash);

        if (!userOk || !passOk) {
          const fails = (lock.fails || 0) + 1;
          const until = fails >= 5 ? Date.now() + 60000 : 0;
          setLockoutState({ fails: until ? 0 : fails, until });
          throw new Error(until ? "Demasiados intentos fallidos. Cuenta bloqueada por 60 segundos." : `Usuario o contraseña incorrectos (intento ${fails}/5).`);
        }
        setLockoutState({ fails: 0, until: 0 });

        localStorage.setItem(SESSION_KEY, JSON.stringify({
          u: cfg.username,
          h: cfg.passwordHash,
          exp: Date.now() + 1000 * 60 * 60 * 12
        }));
        unlockAdminPanel(cfg.username);
      } catch (err) {
        errBox.textContent = err.message;
        errBox.classList.remove("d-none");
      } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="bi bi-box-arrow-in-right me-1"></i> Iniciar sesión`;
      }
    });

    $("btnLogout").addEventListener("click", lockAdminPanel);

    $("changeCredsForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = $("btnChangeCreds");
      btn.disabled = true;
      try {
        const token = getToken();
        if (!token) throw new Error("Primero guarda tu llave de publicación (token de GitHub) en esta misma pestaña: la contraseña nueva se publica en el repositorio.");

        const cfg = await loadAuthConfig();
        const currentHash = await pbkdf2Hex($("currentAdminPass").value, cfg.salt, cfg.iterations || 60000);
        if (!timingSafeEqualHex(currentHash, cfg.passwordHash)) throw new Error("La contraseña actual no es correcta.");

        const newUsername = $("newAdminUser").value.trim();
        const newPassword = $("newAdminPass").value;
        if (newUsername.length < 3) throw new Error("El usuario debe tener al menos 3 caracteres.");
        if (newPassword.length < MIN_PASS) throw new Error(`La nueva contraseña debe tener al menos ${MIN_PASS} caracteres (usa una frase larga).`);

        const rnd = crypto.getRandomValues(new Uint8Array(16));
        const newSalt = "monarch_" + Array.from(rnd).map((b) => b.toString(16).padStart(2, "0")).join("");
        const newHash = await pbkdf2Hex(newPassword, newSalt, NEW_ITERATIONS);

        // Solo usuario, sal e iteraciones y hash. NUNCA el token ni nada derivado de él.
        const updatedCfg = { username: newUsername, salt: newSalt, iterations: NEW_ITERATIONS, passwordHash: newHash };

        await ghPutFile("content/auth.json", utf8ToBase64(JSON.stringify(updatedCfg, null, 2) + "\n"),
          "Actualizar credenciales de administrador", token);

        localStorage.setItem(LOCAL_CREDS_KEY, JSON.stringify({ ...updatedCfg, savedAt: Date.now() }));
        localStorage.setItem(SESSION_KEY, JSON.stringify({ u: newUsername, h: newHash, exp: Date.now() + 1000 * 60 * 60 * 12 }));

        $("userBadge").innerHTML = `<i class="bi bi-person-check-fill me-1"></i>${escapeHTML(newUsername)}`;
        $("currentAdminPass").value = "";
        $("newAdminPass").value = "";
        showAlert('<i class="bi bi-shield-check me-1"></i> <strong>¡Usuario y contraseña actualizados!</strong> Pueden tardar 1 a 2 minutos en valer en otros dispositivos.', "success");
      } catch (err) {
        showAlert(`<i class="bi bi-exclamation-triangle-fill me-1"></i> ${escapeHTML(err.message)}`, "danger");
      } finally {
        btn.disabled = false;
      }
    });
  }

  // Limpieza de datos antiguos: overrides locales y token que antes se guardaba en localStorage
  try {
    LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem(TOKEN_KEY);
  } catch (e) {}

  bindEvents();
  bindAuthEvents();
  checkExistingSession();
})();
