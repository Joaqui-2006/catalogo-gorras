(function () {
  "use strict";

  const { escapeHTML, normalize, slug, formatPrice, safeUrl, dayKey } = UTIL;

  const PLACEHOLDER = "assets/img/placeholder.svg";
  const CART_KEY = "monarch_pedido";

  const state = { cat: "Todas", q: "", sort: "default" };
  let PRODUCTS = [];
  let cart = loadCart(); // { "Nombre de la gorra": cantidad }
  let modal = null;
  let currentIndex = null;

  const $ = (id) => document.getElementById(id);

  /* ---------- Utilidades ---------- */
  const waLink = (text) => `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(text)}`;

  const imgSrc = (src) => {
    const s = String(src || "").trim();
    if (!s) return PLACEHOLDER;
    return /^https?:\/\//i.test(s) ? s : s.replace(/^\/+/, "");
  };

  const siteBase = () => location.origin + location.pathname.replace(/index\.html$/i, "");
  const capLink = (name) => `${siteBase()}?gorra=${encodeURIComponent(name)}#catalogo`;

  // Si una foto no carga, se muestra el marcador de posición.
  document.addEventListener("error", (e) => {
    const t = e.target;
    if (t && t.tagName === "IMG" && !t.dataset.failed) {
      t.dataset.failed = "1";
      t.src = PLACEHOLDER;
    }
  }, true);

  /* ---------- Contadores de visitas (anónimos + localStorage) ---------- */
  function hit(key) {
    fetch(`${CONFIG.statsBase}/hit/${CONFIG.statsNamespace}/${key}`, { mode: "no-cors", keepalive: true, cache: "no-store" }).catch(() => {});
  }

  function recordLocalEvent(event, product = null) {
    try {
      const KEY = "monarch_local_stats";
      const stats = JSON.parse(localStorage.getItem(KEY) || "null") || {
        totalVisits: 0, totalWhatsappClicks: 0, totalCartAdds: 0, totalOrderSends: 0,
        byDate: {}, byProduct: {}, recentEvents: []
      };
      const today = dayKey();
      if (!stats.byDate[today]) stats.byDate[today] = { visits: 0, wa: 0, cart: 0 };
      if (event === "visit") { stats.totalVisits++; stats.byDate[today].visits++; }
      else if (event === "wa") { stats.totalWhatsappClicks++; stats.byDate[today].wa++; }
      else if (event === "cart") { stats.totalCartAdds++; stats.byDate[today].cart++; }
      else if (event === "order") { stats.totalOrderSends++; stats.totalWhatsappClicks++; stats.byDate[today].wa++; }
      if (product) {
        if (!stats.byProduct[product]) stats.byProduct[product] = { views: 0, wa: 0, cart: 0 };
        if (event === "view") stats.byProduct[product].views++;
        if (event === "wa") stats.byProduct[product].wa++;
        if (event === "cart") stats.byProduct[product].cart++;
      }
      stats.recentEvents = [{ ts: new Date().toISOString(), type: event, product }, ...(stats.recentEvents || [])].slice(0, 25);
      localStorage.setItem(KEY, JSON.stringify(stats));
    } catch (e) {}
  }

  function track(event, product) {
    try {
      recordLocalEvent(event, product);
      if (navigator.webdriver || localStorage.getItem("monarch_admin_session")) return;
      const keys = [];
      if (event === "visit") keys.push("visits", `day-${dayKey()}`);
      if (event === "wa") keys.push("whatsapp");
      if (event === "cart") keys.push("cart-adds");
      if (event === "order") keys.push("orders", "whatsapp");
      if (product && (event === "view" || event === "wa" || event === "cart")) keys.push(`p-${slug(product)}`);
      keys.forEach(hit);
    } catch (e) { /* las estadísticas nunca deben romper la tienda */ }
  }

  /* ---------- Animación de aparición ---------- */
  const revealObserver = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("visible");
            revealObserver.unobserve(en.target);
          }
        });
      }, { threshold: 0.12 })
    : null;

  function observeReveals(root) {
    root.querySelectorAll(".reveal:not(.visible)").forEach((el) => {
      revealObserver ? revealObserver.observe(el) : el.classList.add("visible");
    });
  }

  /* ---------- Configuración (content/settings.json + localStorage instantáneo) ---------- */
  async function loadSettings() {
    let s = null;
    try {
      const res = await fetch("content/settings.json", { cache: "no-cache" });
      if (res.ok) s = await res.json();
    } catch (e) {}
    if (s && typeof s === "object") {
      if (s.tagline) CONFIG.tagline = String(s.tagline);
      const wa = String(s.whatsappNumber || "").replace(/\D/g, "");
      if (wa.length >= 10) CONFIG.whatsappNumber = wa;
      if (Array.isArray(s.categories) && s.categories.length) CONFIG.categories = s.categories.map(String);
      if (s.social && typeof s.social === "object") CONFIG.social = { ...CONFIG.social, ...s.social };
    }
  }

  function applyConfig() {
    document.querySelectorAll("[data-brand]").forEach((el) => (el.textContent = CONFIG.brandName));
    document.querySelectorAll("[data-tagline]").forEach((el) => (el.textContent = CONFIG.tagline));
    document.title = `${CONFIG.brandName} | Catálogo de gorras streetwear`;
    document.querySelectorAll("[data-wa-general]").forEach((el) => (el.href = waLink(CONFIG.generalMessage)));
    document.querySelectorAll("[data-social]").forEach((el) => {
      const url = safeUrl(CONFIG.social[el.dataset.social]);
      el.hidden = !url;
      if (url) el.href = url;
    });
    $("year").textContent = new Date().getFullYear();
  }

  /* ---------- Catálogo ---------- */
  const grid = $("grid");

  function visibleProducts() {
    const q = normalize(state.q.trim());
    const list = PRODUCTS.map((p, i) => ({ p, i })).filter(({ p }) => {
      const okCat = state.cat === "Todas" || p.category === state.cat;
      const okQ = !q || normalize(`${p.name} ${p.description} ${p.category}`).includes(q);
      return okCat && okQ;
    });
    if (state.sort === "price-asc") list.sort((a, b) => a.p.price - b.p.price);
    if (state.sort === "price-desc") list.sort((a, b) => b.p.price - a.p.price);
    if (state.sort === "name") list.sort((a, b) => a.p.name.localeCompare(b.p.name, "es"));
    return list;
  }

  function productMessage(p) {
    return `${CONFIG.productMessage.replace("{producto}", p.name)}\nLink: ${capLink(p.name)}`;
  }

  function cardHTML({ p, i }) {
    const name = escapeHTML(p.name);
    return `
      <div class="col-12 col-sm-6 col-lg-4 col-xl-3">
        <article class="product-card reveal">
          <button type="button" class="product-media" data-detail="${i}" aria-label="Ver detalle de ${name}">
            <img src="${escapeHTML(imgSrc(p.image))}" alt="${name}" width="600" height="750" loading="lazy" decoding="async">
            <span class="chip">${escapeHTML(p.category)}</span>
            <span class="media-cta"><i class="bi bi-eye"></i> Ver detalle</span>
          </button>
          <div class="product-body">
            <h3 class="product-name"><button type="button" class="title-link" data-detail="${i}">${name}</button></h3>
            <p class="product-price">${formatPrice(p.price)}</p>
            <p class="product-desc">${escapeHTML(p.description)}</p>
            <div class="card-actions">
              <a class="btn btn-wa" href="${waLink(productMessage(p))}" data-wa-product="${i}" target="_blank" rel="noopener noreferrer"><i class="bi bi-whatsapp"></i> Consultar</a>
              <button type="button" class="btn btn-add" data-add="${i}" aria-label="Agregar ${name} a mi pedido" title="Agregar a mi pedido"><i class="bi bi-bag-plus"></i></button>
            </div>
          </div>
        </article>
      </div>`;
  }

  function renderSkeleton() {
    grid.innerHTML = Array.from({ length: 4 }, () => `
      <div class="col-12 col-sm-6 col-lg-4 col-xl-3">
        <div class="skeleton-card"><div class="sk sk-img"></div><div class="sk sk-line"></div><div class="sk sk-line short"></div><div class="sk sk-line last"></div></div>
      </div>`).join("");
  }

  function renderProducts() {
    const list = visibleProducts();
    grid.innerHTML = list.map(cardHTML).join("");
    $("resultCount").textContent = `${list.length} ${list.length === 1 ? "gorra" : "gorras"}`;
    const empty = list.length === 0;
    $("empty").classList.toggle("d-none", !empty);
    if (empty) {
      $("emptyText").textContent = PRODUCTS.length ? "No encontramos gorras con ese filtro. Prueba con otra búsqueda." : "Pronto subiremos nuevas gorras. ¡Vuelve a visitarnos!";
      $("btnClearFilters").hidden = !PRODUCTS.length;
    }
    observeReveals(grid);
  }

  function renderFilters() {
    const counts = {};
    PRODUCTS.forEach((p) => (counts[p.category] = (counts[p.category] || 0) + 1));
    // Solo se muestran las categorías que tienen gorras.
    const ordered = [
      ...CONFIG.categories.filter((c) => counts[c]),
      ...Object.keys(counts).filter((c) => !CONFIG.categories.includes(c)),
    ];
    if (state.cat !== "Todas" && !counts[state.cat]) state.cat = "Todas";
    $("filters").innerHTML = ["Todas", ...ordered].map((c) => {
      const active = c === state.cat;
      const n = c === "Todas" ? PRODUCTS.length : counts[c];
      return `<button type="button" class="filter-btn${active ? " active" : ""}" data-cat="${escapeHTML(c)}" aria-pressed="${active}">${escapeHTML(c)} <small>${n}</small></button>`;
    }).join("");
    $("statModels").textContent = PRODUCTS.length;
    $("statCats").textContent = ordered.length;
  }

  async function loadProducts() {
    try {
      const res = await fetch("content/products.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      PRODUCTS = (Array.isArray(data.products) ? data.products : [])
        .filter((p) => p && p.name)
        .map((p) => ({
          name: String(p.name).trim(),
          price: Number(p.price) || 0,
          category: String(p.category || "General"),
          description: String(p.description || ""),
          image: String(p.image || ""),
        }));
    } catch (err) {
      console.error("No se pudo cargar el catálogo:", err);
      PRODUCTS = [];
    }
  }

  /* ---------- Detalle de producto ---------- */
  function openDetail(i) {
    const p = PRODUCTS[i];
    if (!p) return;
    currentIndex = i;
    const img = $("pmImg");
    img.dataset.failed = "";
    img.src = imgSrc(p.image);
    img.alt = p.name;
    $("pmCat").textContent = p.category;
    $("pmName").textContent = p.name;
    $("pmPrice").textContent = formatPrice(p.price);
    $("pmDesc").textContent = p.description;
    $("pmWa").href = waLink(productMessage(p));
    $("pmWa").dataset.waProduct = i;
    track("view", p.name);
    modal = modal || new bootstrap.Modal($("productModal"));
    modal.show();
  }

  /* ---------- Pedido (carrito) ---------- */
  function loadCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) { /* modo privado */ }
  }

  function cartLines() {
    return Object.entries(cart)
      .map(([name, qty]) => ({ p: PRODUCTS.find((x) => x.name === name), qty }))
      .filter((l) => l.p && l.qty > 0);
  }

  function showToast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(showToast.id);
    showToast.id = setTimeout(() => t.classList.remove("show"), 1800);
  }

  function addToCart(i) {
    const p = PRODUCTS[i];
    if (!p) return;
    cart[p.name] = (cart[p.name] || 0) + 1;
    saveCart();
    renderCart();
    track("cart", p.name);
    const badge = $("cartCount");
    badge.classList.remove("bump");
    void badge.offsetWidth;
    badge.classList.add("bump");
    showToast(`Agregada: ${p.name}`);
  }

  function changeQty(name, delta) {
    cart[name] = (cart[name] || 0) + delta;
    if (cart[name] <= 0) delete cart[name];
    saveCart();
    renderCart();
  }

  function renderCart() {
    const lines = cartLines();
    const count = lines.reduce((s, l) => s + l.qty, 0);
    const total = lines.reduce((s, l) => s + l.qty * l.p.price, 0);

    $("cartCount").textContent = count;
    $("cartCount").classList.toggle("d-none", count === 0);

    const box = $("cartItems");
    if (!lines.length) {
      box.innerHTML = `<div class="cart-empty"><i class="bi bi-bag"></i><p>Tu pedido está vacío.<br>Agrega gorras desde el catálogo.</p></div>`;
      $("cartFooter").classList.add("d-none");
      return;
    }

    box.innerHTML = lines.map(({ p, qty }) => {
      const n = escapeHTML(p.name);
      return `
        <div class="cart-item">
          <img src="${escapeHTML(imgSrc(p.image))}" alt="" width="64" height="64">
          <div class="cart-item-info">
            <div class="cart-item-name">${n}</div>
            <div class="cart-item-price">${formatPrice(p.price)}</div>
            <div class="qty">
              <button type="button" data-qty="-1" data-name="${n}" aria-label="Quitar una">−</button>
              <span>${qty}</span>
              <button type="button" data-qty="1" data-name="${n}" aria-label="Agregar una">+</button>
            </div>
          </div>
          <button type="button" class="cart-remove" data-remove="${n}" aria-label="Eliminar ${n}"><i class="bi bi-trash"></i></button>
        </div>`;
    }).join("");

    $("cartTotal").textContent = formatPrice(total);
    $("cartFooter").classList.remove("d-none");

    const items = lines.map(({ p, qty }) => `• ${qty} x ${p.name} (${formatPrice(p.price * qty)})\n  Link: ${capLink(p.name)}`).join("\n\n");
    $("cartSend").href = waLink(`${CONFIG.orderIntro}\n\n${items}\n\nTotal: ${formatPrice(total)}\n\n${CONFIG.orderOutro}`);
  }

  /* ---------- Eventos ---------- */
  function bindEvents() {
    $("filters").addEventListener("click", (e) => {
      const btn = e.target.closest(".filter-btn");
      if (!btn) return;
      state.cat = btn.dataset.cat;
      renderFilters();
      renderProducts();
    });

    $("search").addEventListener("input", (e) => { state.q = e.target.value; renderProducts(); });
    $("sort").addEventListener("change", (e) => { state.sort = e.target.value; renderProducts(); });

    $("btnClearFilters").addEventListener("click", () => {
      state.cat = "Todas";
      state.q = "";
      $("search").value = "";
      renderFilters();
      renderProducts();
    });

    grid.addEventListener("click", (e) => {
      const add = e.target.closest("[data-add]");
      if (add) return addToCart(+add.dataset.add);
      const wa = e.target.closest("[data-wa-product]");
      if (wa) return track("wa", PRODUCTS[+wa.dataset.waProduct]?.name);
      const det = e.target.closest("[data-detail]");
      if (det) openDetail(+det.dataset.detail);
    });

    $("pmAdd").addEventListener("click", () => { if (currentIndex !== null) addToCart(currentIndex); });
    $("pmWa").addEventListener("click", (e) => track("wa", PRODUCTS[+e.currentTarget.dataset.waProduct]?.name));
    document.querySelectorAll("[data-wa-general]").forEach((el) => el.addEventListener("click", () => track("wa")));
    $("cartSend").addEventListener("click", () => track("order"));

    $("cartItems").addEventListener("click", (e) => {
      const q = e.target.closest("[data-qty]");
      if (q) return changeQty(q.dataset.name, +q.dataset.qty);
      const r = e.target.closest("[data-remove]");
      if (r) changeQty(r.dataset.remove, -Infinity);
    });
    $("cartClear").addEventListener("click", () => { cart = {}; saveCart(); renderCart(); });

    // Cerrar el menú móvil al navegar
    document.querySelectorAll(".navbar-nav a").forEach((a) =>
      a.addEventListener("click", () => {
        const menu = $("menu");
        if (menu.classList.contains("show")) bootstrap.Collapse.getInstance(menu)?.hide();
      })
    );

    // Barra de navegación más sólida al hacer scroll
    const nav = $("siteNav");
    const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Inicio ---------- */
  async function init() {
    // Copias locales antiguas del panel: ya no se usan y podían ocultar el catálogo real.
    try { localStorage.removeItem("monarch_custom_products"); localStorage.removeItem("monarch_custom_settings"); } catch (e) {}
    renderSkeleton();
    bindEvents();
    observeReveals(document);
    await Promise.all([loadSettings(), loadProducts()]);
    applyConfig();
    renderFilters();
    renderProducts();
    renderCart();

    if (!sessionStorage.getItem("monarch_visited")) {
      try { sessionStorage.setItem("monarch_visited", "1"); } catch (e) { /* ignorar */ }
      track("visit");
    }

    // Enlace directo a una gorra: ?gorra=Nombre
    const target = new URLSearchParams(location.search).get("gorra");
    if (target) {
      const idx = PRODUCTS.findIndex((p) => normalize(p.name) === normalize(target));
      if (idx !== -1) setTimeout(() => openDetail(idx), 250);
    }
  }
  init();
})();
