(function () {
  "use strict";

  const REPO = "Joaqui-2006/catalogo-gorras";
  const BRANCH = "main";
  const TOKEN_KEY = "monarch_gh_token";
  const SESSION_KEY = "monarch_admin_session";
  const PLACEHOLDER = "../assets/img/placeholder.svg";
  const resolveAdminImg = (src) => {
    const s = String(src || "").trim();
    if (!s) return PLACEHOLDER;
    if (s.startsWith("data:") || s.startsWith("http")) return s;
    return "../" + s.replace(/^(\.\.\/|\/)+/, "");
  };
  let categories = ["Snapback", "Trucker", "Dad Hat", "Edición limitada"];

  let products = [];
  // pendingImages: { idx: { fileName, base64, dataUrl } }
  const pendingImages = {};

  const $ = (id) => document.getElementById(id);

  const escapeHTML = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- Token de GitHub ---------- */
  function getToken() {
    let t = localStorage.getItem(TOKEN_KEY) || "";
    if (!t) {
      try {
        const sveltiaUser = JSON.parse(localStorage.getItem("sveltia-cms.user") || "null");
        if (sveltiaUser && sveltiaUser.token) t = sveltiaUser.token;
      } catch (e) {}
    }
    return t.trim();
  }

  function updateAuthBadge() {
    const t = getToken();
    const b = $("authBadge");
    if (t) {
      b.textContent = "Sincronización nube activa";
      b.className = "status-pill bg-success bg-opacity-25 text-success";
      if ($("ghToken")) $("ghToken").value = t;
    } else {
      b.textContent = "Guardado instantáneo activo";
      b.className = "status-pill bg-info bg-opacity-25 text-info";
    }
  }

  function showAlert(msg, type = "info") {
    const box = $("alertBox");
    box.className = `alert alert-${type}`;
    box.innerHTML = msg;
    box.classList.remove("d-none");
  }

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
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          const base64 = dataUrl.split(",")[1];
          const cleanName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
          const fileName = `gorra-${Date.now()}-${cleanName.slice(0, 28)}.jpg`;
          resolve({ fileName, base64, dataUrl });
        };
        img.onerror = reject;
        img.src = ev.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  
  /* ---------- Administrar Categorías / Catálogos ---------- */
  function renderCategories() {
    const box = $("categoriesPills");
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

  /* ---------- Renderizar lista de gorras ---------- */
  function renderCaps() {
    $("capCounter").textContent = `${products.length} ${products.length === 1 ? "gorra" : "gorras"}`;
    renderCategories();
    const box = $("capsList");
    if (!products.length) {
      box.innerHTML = `<div class="panel-card text-center text-secondary py-5">No hay gorras. Pulsa <strong>Nueva gorra</strong> para agregar la primera.</div>`;
      return;
    }

    box.innerHTML = products.map((p, i) => {
      const previewSrc = pendingImages[i] ? pendingImages[i].dataUrl : resolveAdminImg(p.image);
      const cats = categories.includes(p.category) ? categories : [...categories, p.category];
      return `
        <div class="cap-row" data-idx="${i}">
          <div class="d-flex flex-column flex-md-row gap-3 align-items-start">
            <div class="text-center">
              <img src="${escapeHTML(previewSrc)}" alt="" class="cap-preview mb-2" data-preview="${i}" onerror="this.onerror=null;this.src='${PLACEHOLDER}'">
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
                  <span class="small text-secondary">Ruta de imagen: <code data-path="${i}">${escapeHTML(p.image)}</code></span>
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

  /* ---------- Cargar productos actuales ---------- */
  async function loadCatalog() {
    try {
      const localOverride = JSON.parse(localStorage.getItem("monarch_custom_products") || "null");
      if (Array.isArray(localOverride)) {
        products = localOverride;
        renderCaps();
        return;
      }
    } catch (e) {}
    try {
      const res = await fetch("../content/products.json", { cache: "no-store" });
      const data = await res.json();
      products = Array.isArray(data.products) ? data.products : [];
      renderCaps();
    } catch (e) {
      showAlert("No se pudo cargar content/products.json: " + e.message, "danger");
    }
  }

  /* ---------- Subir archivos a GitHub API ---------- */
  async function ghGetSha(path, token) {
    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}?ref=${BRANCH}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub (${res.status}) al consultar ${path}`);
    const j = await res.json();
    return j.sha || null;
  }

  async function ghPutFile(path, base64Content, message, token) {
    const sha = await ghGetSha(path, token);
    const body = { message, content: base64Content, branch: BRANCH };
    if (sha) body.sha = sha;
    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Error HTTP ${res.status} subiendo ${path}`);
    }
    return res.json();
  }

  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin);
  }

  async function saveAllToGitHub() {
    const btn = $("btnSaveAll");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Guardando...`;

    try {
      const indices = Object.keys(pendingImages);
      for (const idx of indices) {
        const img = pendingImages[idx];
        products[idx].image = img.dataUrl;
      }

      localStorage.setItem("monarch_custom_products", JSON.stringify(products));

      const token = getToken();
      if (token) {
        for (const idx of indices) {
          const img = pendingImages[idx];
          showAlert(`Subiendo fotografía <code>${escapeHTML(img.fileName)}</code> (${Number(idx) + 1})...`, "info");
          await ghPutFile(`assets/img/${img.fileName}`, img.base64, `Subir imagen ${img.fileName} desde panel admin`, token);
          products[idx].image = `assets/img/${img.fileName}`;
          delete pendingImages[idx];
        }
        siteSettings.categories = categories;
        localStorage.setItem("monarch_custom_settings", JSON.stringify(siteSettings));
        const jsonStr = JSON.stringify({ products }, null, 2) + "\n";
        await ghPutFile("content/products.json", utf8ToBase64(jsonStr), "Actualizar catálogo de gorras desde panel admin", token);
        await ghPutFile("content/settings.json", utf8ToBase64(JSON.stringify(siteSettings, null, 2) + "\n"), "Actualizar categorías del catálogo desde panel admin", token);
        localStorage.setItem("monarch_custom_products", JSON.stringify(products));
        renderCaps();
        showAlert('<i class="bi bi-check-circle-fill me-1"></i> <strong>¡Cambios guardados y sincronizados en la nube!</strong>', "success");
      } else {
        Object.keys(pendingImages).forEach((k) => delete pendingImages[k]);
        renderCaps();
        showAlert('<i class="bi bi-check-circle-fill me-1"></i> <strong>¡Cambios guardados al instante!</strong> Abre "Ver tienda" arriba a la derecha para ver tus gorras e imágenes actualizadas.', "success");
      }
    } catch (err) {
      showAlert(`<i class="bi bi-exclamation-triangle-fill me-1"></i> Se guardó localmente, pero falló la sincronización en la nube: ${escapeHTML(err.message)}`, "warning");
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="bi bi-cloud-arrow-up-fill me-1"></i> Guardar y publicar cambios`;
    }
  }

  
  /* ---------- Configuración de Redes Sociales y WhatsApp ---------- */
  let siteSettings = {
    brandName: "MONARCH STREET",
    tagline: "More than caps",
    whatsappNumber: "573156994134",
    categories: ["Snapback", "Trucker", "Dad Hat", "Edición limitada"],
    social: {
      instagram: "https://www.instagram.com/",
      tiktok: "https://www.tiktok.com/",
      facebook: "https://www.facebook.com/"
    }
  };

  async function loadSiteSettings() {
    try {
      const localS = JSON.parse(localStorage.getItem("monarch_custom_settings") || "null");
      if (localS && localS.whatsappNumber) {
        siteSettings = { ...siteSettings, ...localS, social: { ...siteSettings.social, ...(localS.social || {}) } };
      } else {
        const res = await fetch("../content/settings.json", { cache: "no-store" });
        if (res.ok) {
          const remoteS = await res.json();
          siteSettings = { ...siteSettings, ...remoteS, social: { ...siteSettings.social, ...(remoteS.social || {}) } };
        }
      }
    } catch (e) {}
    if (Array.isArray(siteSettings.categories) && siteSettings.categories.length) {
      categories = siteSettings.categories;
      renderCaps();
    }
    if ($("setWhatsapp")) $("setWhatsapp").value = siteSettings.whatsappNumber || "";
    if ($("setTagline")) $("setTagline").value = siteSettings.tagline || "More than caps";
    if ($("setInstagram")) $("setInstagram").value = (siteSettings.social && siteSettings.social.instagram) || "";
    if ($("setTiktok")) $("setTiktok").value = (siteSettings.social && siteSettings.social.tiktok) || "";
    if ($("setFacebook")) $("setFacebook").value = (siteSettings.social && siteSettings.social.facebook) || "";
  }

  async function saveSiteSettings(e) {
    if (e) e.preventDefault();
    const btn = $("btnSaveSocial");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Guardando...`;

    try {
      const cleanWa = ($("setWhatsapp").value || "").replace(/\D/g, "");
      if (cleanWa.length < 10) throw new Error("Ingresa un número de WhatsApp válido con indicativo (ej. 573156994134).");

      siteSettings = {
        brandName: "MONARCH STREET",
        tagline: ($("setTagline").value || "More than caps").trim(),
        whatsappNumber: cleanWa,
        categories,
        social: {
          instagram: ($("setInstagram").value || "").trim(),
          tiktok: ($("setTiktok").value || "").trim(),
          facebook: ($("setFacebook").value || "").trim()
        }
      };

      localStorage.setItem("monarch_custom_settings", JSON.stringify(siteSettings));

      const token = getToken();
      if (token) {
        await ghPutFile(
          "content/settings.json",
          utf8ToBase64(JSON.stringify(siteSettings, null, 2) + "\n"),
          "Actualizar WhatsApp y redes sociales desde panel admin",
          token
        );
        showAlert('<i class="bi bi-check-circle-fill me-1"></i> <strong>¡WhatsApp y redes sociales actualizados en toda la web!</strong>', "success");
      } else {
        showAlert('<i class="bi bi-check-circle-fill me-1"></i> <strong>¡WhatsApp y redes sociales guardados al instante!</strong>', "success");
      }
    } catch (err) {
      showAlert(`<i class="bi bi-exclamation-triangle-fill me-1"></i> ${escapeHTML(err.message)}`, "danger");
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="bi bi-cloud-arrow-up-fill me-1"></i> Guardar WhatsApp y Redes Sociales`;
    }
  }

  /* ---------- Estadísticas y Panel de Visitas ---------- */
  async function loadStats() {
    try {
      const res = await fetch("/api/stats", { cache: "no-store" });
      if (!res.ok) throw new Error(res.status);
      const s = await res.json();
      renderStats(s);
    } catch (e) {
      renderStats(JSON.parse(localStorage.getItem("monarch_local_stats") || "null") || { totalVisits: 0, totalWhatsappClicks: 0, totalCartAdds: 0, totalOrderSends: 0, byDate: {}, byProduct: {}, recentEvents: [] });
    }
  }

  function renderStats(s) {
    $("kpiVisits").textContent = s.totalVisits || 0;
    $("kpiWa").textContent = s.totalWhatsappClicks || 0;
    $("kpiCart").textContent = s.totalCartAdds || 0;
    $("kpiOrders").textContent = s.totalOrderSends || 0;

    // Últimos 7 días
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("es-CO", { weekday: "short", day: "numeric" });
      const v = s.byDate && s.byDate[key] ? s.byDate[key].visits || 0 : 0;
      days.push({ label, v });
    }
    const maxV = Math.max(1, ...days.map((d) => d.v));
    $("chart7Days").innerHTML = days.map((d) => {
      const pct = Math.max(6, Math.round((d.v / maxV) * 100));
      return `
        <div class="day-col">
          <span class="day-num">${d.v}</span>
          <div class="day-bar" style="height:${pct}%"></div>
          <span class="day-lbl">${escapeHTML(d.label)}</span>
        </div>`;
    }).join("");

    // Top gorras
    const entries = Object.entries(s.byProduct || {}).map(([name, m]) => ({
      name,
      views: m.views || 0,
      wa: m.wa || 0,
      cart: m.cart || 0,
      score: (m.views || 0) + (m.wa || 0) * 2 + (m.cart || 0) * 2
    })).sort((a, b) => b.score - a.score).slice(0, 6);

    const topBox = $("topProducts");
    if (!entries.length) {
      topBox.innerHTML = `<p class="text-secondary small mb-0">Aún no hay interacciones con gorras individuales. Se registrarán a medida que los visitantes abran gorras o consulten por WhatsApp.</p>`;
    } else {
      const maxScore = Math.max(1, entries[0].score);
      topBox.innerHTML = entries.map((e) => `
        <div class="mb-3">
          <div class="d-flex justify-content-between small mb-1">
            <strong>${escapeHTML(e.name)}</strong>
            <span class="text-secondary">${e.views} vistas · ${e.wa} WhatsApp · ${e.cart} pedidos</span>
          </div>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.round((e.score / maxScore) * 100)}%"></div></div>
        </div>`).join("");
    }

    // Tabla de eventos recientes
    const labels = {
      visit: '<span class="badge bg-primary bg-opacity-25 text-info">Visita al catálogo</span>',
      view: '<span class="badge bg-secondary bg-opacity-25 text-light">Vio detalle de gorra</span>',
      wa: '<span class="badge bg-success bg-opacity-25 text-success">Clic en WhatsApp</span>',
      cart: '<span class="badge bg-info bg-opacity-25 text-info">Agregó al pedido</span>',
      order: '<span class="badge bg-warning bg-opacity-25 text-warning">Envió pedido por WhatsApp</span>'
    };
    const recent = s.recentEvents || [];
    $("recentTable").innerHTML = recent.length
      ? recent.map((ev) => `
          <tr>
            <td class="small text-secondary">${new Date(ev.ts).toLocaleString("es-CO")}</td>
            <td>${labels[ev.type] || escapeHTML(ev.type)}</td>
            <td>${ev.product ? escapeHTML(ev.product) : '<span class="text-secondary">—</span>'}</td>
          </tr>`).join("")
      : `<tr><td colspan="3" class="text-center text-secondary py-3">Sin actividad registrada todavía.</td></tr>`;
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
    });

    list.addEventListener("change", async (e) => {
      const fileInput = e.target.closest("[data-file]");
      if (!fileInput || !fileInput.files[0]) return;
      const idx = Number(fileInput.dataset.file);
      try {
        const compressed = await compressImage(fileInput.files[0]);
        pendingImages[idx] = compressed;
        products[idx].image = `/assets/img/${compressed.fileName}`;
        const prev = list.querySelector(`[data-preview="${idx}"]`);
        if (prev) prev.src = compressed.dataUrl;
        const pathEl = list.querySelector(`[data-path="${idx}"]`);
        if (pathEl) pathEl.textContent = `${products[idx].image} (pendiente por guardar)`;
        showAlert(`Foto lista para <strong>${escapeHTML(products[idx].name)}</strong>. Pulsa <strong>Guardar y publicar cambios</strong> arriba a la derecha.`, "info");
      } catch (err) {
        showAlert("No se pudo procesar la imagen: " + err.message, "danger");
      }
    });

    list.addEventListener("click", (e) => {
      const del = e.target.closest("[data-del]");
      if (del) {
        const idx = Number(del.dataset.del);
        if (confirm(`¿Eliminar la gorra «${products[idx].name}»?`)) {
          products.splice(idx, 1);
          renderCaps();
        }
        return;
      }
      const move = e.target.closest("[data-move]");
      if (move) {
        const idx = Number(move.dataset.idx);
        const dir = Number(move.dataset.move);
        const target = idx + dir;
        if (target >= 0 && target < products.length) {
          const tmp = products[idx];
          products[idx] = products[target];
          products[target] = tmp;
          renderCaps();
        }
      }
    });

    
    if ($("btnAddCategory")) {
      $("btnAddCategory").addEventListener("click", () => {
        const inp = $("newCategoryInput");
        const val = (inp.value || "").trim();
        if (!val) return;
        if (!categories.some((c) => c.toLowerCase() === val.toLowerCase())) {
          categories.push(val);
          siteSettings.categories = categories;
          localStorage.setItem("monarch_custom_settings", JSON.stringify(siteSettings));
          renderCaps();
          showAlert(`Categoría / catálogo <strong>«${escapeHTML(val)}»</strong> agregado. Pulsa <strong>Guardar y publicar cambios</strong> para publicarlo.`, "info");
        }
        inp.value = "";
      });
    }

    if ($("categoriesPills")) {
      $("categoriesPills").addEventListener("click", (e) => {
        const btn = e.target.closest("[data-del-cat]");
        if (!btn) return;
        const idx = Number(btn.dataset.delCat);
        const catName = categories[idx];
        if (!catName) return;
        const inUse = products.filter((p) => p.category === catName).length;
        const msg = inUse > 0
          ? `La categoría «${catName}» tiene ${inUse} gorra(s).

¿Quieres eliminar también las ${inUse} gorra(s) de esta categoría? (Aceptar = eliminar categoría y sus gorras / Cancelar = no hacer nada)`
          : `¿Eliminar la categoría / catálogo «${catName}»?`;
        if (!confirm(msg)) return;
        if (inUse > 0) {
          products = products.filter((p) => p.category !== catName);
        }
        categories.splice(idx, 1);
        if (!categories.length) categories.push("General");
        siteSettings.categories = categories;
        localStorage.setItem("monarch_custom_settings", JSON.stringify(siteSettings));
        renderCaps();
        showAlert(`Categoría <strong>«${escapeHTML(catName)}»</strong> eliminada. Pulsa <strong>Guardar y publicar cambios</strong> para confirmar en la web.`, "warning");
      });
    }

    if ($("btnClearCatalog")) {
      $("btnClearCatalog").addEventListener("click", () => {
        if (!products.length) return;
        if (!confirm("¿Estás seguro de eliminar TODAS las gorras del catálogo para empezar desde cero?")) return;
        products = [];
        renderCaps();
        showAlert("Se vació el catálogo. Pulsa <strong>Guardar y publicar cambios</strong> para aplicar o agrega nuevas gorras.", "warning");
      });
    }

    $("btnAddCap").addEventListener("click", () => {
      products.unshift({
        name: "Nueva Gorra Monarch",
        price: 85000,
        category: categories[0] || "Snapback",
        description: "Describe los materiales, visera y estilo de esta gorra.",
        image: "/assets/img/placeholder.svg"
      });
      renderCaps();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    $("btnSaveAll").addEventListener("click", saveAllToGitHub);
    if ($("socialForm")) $("socialForm").addEventListener("submit", saveSiteSettings);

    if ($("btnSaveToken")) $("btnSaveToken").addEventListener("click", () => {
      const v = $("ghToken").value.trim();
      if (v) localStorage.setItem(TOKEN_KEY, v);
      else localStorage.removeItem(TOKEN_KEY);
      updateAuthBadge();
      showAlert("Llave de administrador actualizada en este navegador.", "success");
    });

    if ($("btnToggleToken")) $("btnToggleToken").addEventListener("click", () => {
      const inp = $("ghToken");
      inp.type = inp.type === "password" ? "text" : "password";
    });

    $("btnRefreshStats").addEventListener("click", loadStats);
    $("btnTabVisitas").addEventListener("shown.bs.tab", loadStats);

    $("btnResetStats").addEventListener("click", async () => {
      if (!confirm("¿Reiniciar todos los contadores de visitas a cero?")) return;
      const sessionToken = localStorage.getItem(SESSION_KEY) || "";
      const res = await fetch("/api/stats", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ type: "reset" })
      });
      if (!res.ok) {
        showAlert("No autorizado para reiniciar estadísticas. Inicia sesión nuevamente.", "danger");
        return;
      }
      loadStats();
    });
  }

  /* ---------- Autenticación con Usuario y Contraseña (PBKDF2-SHA256 + Web Crypto) ---------- */
  const LOCAL_CREDS_KEY = "monarch_custom_creds";

  
  async function decryptVaultToken(password, cfg) {
    if (!cfg.encryptedGithubToken || !cfg.vaultSalt || !cfg.vaultIv) return "";
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
    const aesKey = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: enc.encode(cfg.vaultSalt), iterations: cfg.iterations || 60000, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
    const iv = Uint8Array.from(atob(cfg.vaultIv), (c) => c.charCodeAt(0));
    const cipherBytes = Uint8Array.from(atob(cfg.encryptedGithubToken), (c) => c.charCodeAt(0));
    const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, cipherBytes);
    return new TextDecoder().decode(plainBuf).trim();
  }

  async function encryptVaultToken(token, password, salt, iterations = 60000) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
    const aesKey = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: enc.encode(salt), iterations, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"]
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, enc.encode(token));
    const b64 = (u8) => btoa(String.fromCharCode(...u8));
    return {
      vaultSalt: salt,
      vaultIv: b64(iv),
      encryptedGithubToken: b64(new Uint8Array(cipherBuf))
    };
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

  async function loadAuthConfig() {
    try {
      const custom = JSON.parse(localStorage.getItem(LOCAL_CREDS_KEY) || "null");
      if (custom && custom.username && custom.passwordHash) return custom;
    } catch (e) {}
    const res = await fetch("../content/auth.json", { cache: "no-store" });
    return res.json();
  }

  function unlockAdminPanel(username) {
    $("loginScreen").classList.add("d-none");
    $("adminApp").classList.remove("d-none");
    $("userBadge").innerHTML = `<i class="bi bi-person-check-fill me-1"></i>${escapeHTML(username)}`;
    $("newAdminUser").value = username;
    updateAuthBadge();
    loadCatalog();
    loadSiteSettings();
    loadStats();
  }

  function lockAdminPanel() {
    localStorage.removeItem(SESSION_KEY);
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
        const cfg = await loadAuthConfig();
        const userIn = $("loginUser").value.trim();
        const passIn = $("loginPass").value;
        const hash = await pbkdf2Hex(passIn, cfg.salt, cfg.iterations || 60000);

        if (userIn.toLowerCase() !== String(cfg.username).toLowerCase() || hash !== cfg.passwordHash) {
          throw new Error("Usuario o contraseña incorrectos.");
        }

        const sessionObj = {
          u: cfg.username,
          h: cfg.passwordHash,
          exp: Date.now() + 1000 * 60 * 60 * 24 * 7
        };
        try {
          const unlockedToken = await decryptVaultToken(passIn, cfg);
          if (unlockedToken) localStorage.setItem(TOKEN_KEY, unlockedToken);
        } catch (e) {}
        localStorage.setItem(SESSION_KEY, JSON.stringify(sessionObj));
        unlockAdminPanel(cfg.username);
      } catch (err) {
        errBox.textContent = err.message;
        errBox.classList.remove("d-none");
      } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="bi bi-box-arrow-in-right me-1"></i> Iniciar sesión`;
      }
    });

    $("btnLogout").addEventListener("click", () => {
      lockAdminPanel();
    });

    $("changeCredsForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = $("btnChangeCreds");
      btn.disabled = true;
      try {
        const cfg = await loadAuthConfig();
        const currentHash = await pbkdf2Hex($("currentAdminPass").value, cfg.salt, cfg.iterations || 60000);
        if (currentHash !== cfg.passwordHash) {
          throw new Error("La contraseña actual no es correcta.");
        }

        const newUsername = $("newAdminUser").value.trim();
        const newPassword = $("newAdminPass").value;
        if (newUsername.length < 3) throw new Error("El usuario debe tener al menos 3 caracteres.");
        if (newPassword.length < 6) throw new Error("La nueva contraseña debe tener al menos 6 caracteres.");

        const newSalt = "monarch_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
        const newHash = await pbkdf2Hex(newPassword, newSalt, 60000);
        let activeToken = getToken();
        if (!activeToken) {
          try { activeToken = await decryptVaultToken($("currentAdminPass").value, cfg); } catch (e) {}
        }
        const vaultData = activeToken ? await encryptVaultToken(activeToken, newPassword, "vault_" + newSalt, 60000) : {};
        const updatedCfg = {
          username: newUsername,
          salt: newSalt,
          iterations: 60000,
          passwordHash: newHash,
          ...vaultData
        };

        localStorage.setItem(LOCAL_CREDS_KEY, JSON.stringify(updatedCfg));
        localStorage.setItem(SESSION_KEY, JSON.stringify({
          u: newUsername,
          h: newHash,
          exp: Date.now() + 1000 * 60 * 60 * 24 * 7
        }));

        const ghToken = getToken();
        if (ghToken) {
          await ghPutFile(
            "content/auth.json",
            utf8ToBase64(JSON.stringify(updatedCfg, null, 2) + "\n"),
            "Actualizar credenciales cifradas de administrador",
            ghToken
          );
        }

        $("userBadge").innerHTML = `<i class="bi bi-person-check-fill me-1"></i>${escapeHTML(newUsername)}`;
        $("currentAdminPass").value = "";
        $("newAdminPass").value = "";
        showAlert('<i class="bi bi-shield-check me-1"></i> <strong>¡Usuario y contraseña actualizados!</strong> Tu nueva clave cifrada ya está activa.', "success");
      } catch (err) {
        showAlert(`<i class="bi bi-exclamation-triangle-fill me-1"></i> ${escapeHTML(err.message)}`, "danger");
      } finally {
        btn.disabled = false;
      }
    });
  }

  bindEvents();
  bindAuthEvents();
  checkExistingSession();
})();
