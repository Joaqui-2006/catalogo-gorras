(function () {
  "use strict";

  const PLACEHOLDER = "assets/img/placeholder.svg";
  const CART_KEY = "monarch_pedido";

  let PRODUCTS = [];
  const state = { cat: "Todas", q: "", sort: "default" };
  let cart = loadCart(); // { "Nombre de la gorra": cantidad }

  /* ---------- Utilidades ---------- */
  const $ = (id) => document.getElementById(id);

  const waLink = (text) =>
    "https://wa.me/" + CONFIG.whatsappNumber + "?text=" + encodeURIComponent(text);

  const formatPrice = (n) =>
    new Intl.NumberFormat(CONFIG.locale, {
      style: "currency",
      currency: CONFIG.currency,
      maximumFractionDigits: 0,
    }).format(n);

  const escapeHTML = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Normaliza rutas de imagen para que funcionen igual en Netlify (/) y en GitHub Pages (/catalogo-gorras/)
  const resolveImg = (src) => String(src || PLACEHOLDER).replace(/^\/+/, "");

  // Minúsculas y sin tildes, para que "edicion" encuentre "Edición"
  const normalize = (s) =>
    String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Registro de analíticas: intenta /api/stats y también guarda en localStorage para que funcione siempre
  function trackEvent(type, product = null) {
    try {
      const KEY = "monarch_local_stats";
      const stats = JSON.parse(localStorage.getItem(KEY) || "null") || {
        totalVisits: 0, totalWhatsappClicks: 0, totalCartAdds: 0, totalOrderSends: 0,
        byDate: {}, byProduct: {}, recentEvents: []
      };
      const today = new Date().toISOString().slice(0, 10);
      if (!stats.byDate[today]) stats.byDate[today] = { visits: 0, wa: 0, cart: 0 };
      if (type === "visit") { stats.totalVisits++; stats.byDate[today].visits++; }
      else if (type === "wa") { stats.totalWhatsappClicks++; stats.byDate[today].wa++; }
      else if (type === "cart") { stats.totalCartAdds++; stats.byDate[today].cart++; }
      else if (type === "order") { stats.totalOrderSends++; stats.totalWhatsappClicks++; stats.byDate[today].wa++; }
      if (product) {
        if (!stats.byProduct[product]) stats.byProduct[product] = { views: 0, wa: 0, cart: 0 };
        if (type === "view") stats.byProduct[product].views++;
        if (type === "wa") stats.byProduct[product].wa++;
        if (type === "cart") stats.byProduct[product].cart++;
      }
      stats.recentEvents = [{ ts: new Date().toISOString(), type, product }, ...(stats.recentEvents || [])].slice(0, 25);
      localStorage.setItem(KEY, JSON.stringify(stats));
    } catch (e) {}
    try {
      fetch("/api/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, product }),
        keepalive: true,
      }).catch(() => {});
    } catch (e) {}
  }

  const imgFallback = (root) =>
    root.querySelectorAll("img[data-fallback]").forEach((img) =>
      img.addEventListener("error", () => { img.src = PLACEHOLDER; }, { once: true })
    );

  /* ---------- Animación de aparición ---------- */
  const observer = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
            observer.unobserve(e.target);
          }
        });
      }, { threshold: 0.12 })
    : null;

  function observeReveals(root) {
    root.querySelectorAll(".reveal:not(.visible)").forEach((el) => {
      observer ? observer.observe(el) : el.classList.add("visible");
    });
  }

  /* ---------- Marca, WhatsApp general y redes ---------- */
  async function loadSettings() {
    let custom = null;
    try {
      custom = JSON.parse(localStorage.getItem("monarch_custom_settings") || "null");
    } catch (e) {}
    if (!custom) {
      try {
        const res = await fetch("content/settings.json", { cache: "no-cache" });
        if (res.ok) custom = await res.json();
      } catch (e) {}
    }
    if (custom) {
      if (custom.brandName) CONFIG.brandName = custom.brandName;
      if (custom.tagline) CONFIG.tagline = custom.tagline;
      if (custom.whatsappNumber) CONFIG.whatsappNumber = String(custom.whatsappNumber).replace(/\D/g, "");
      if (custom.social) CONFIG.social = { ...CONFIG.social, ...custom.social };
    }
  }

  function applyConfig() {
    document.querySelectorAll("[data-brand]").forEach((el) => (el.textContent = CONFIG.brandName));
    document.querySelectorAll("[data-tagline]").forEach((el) => (el.textContent = CONFIG.tagline));
    document.title = CONFIG.brandName + " | Catálogo de gorras streetwear";
    document.querySelectorAll("[data-wa-general]").forEach((el) => (el.href = waLink(CONFIG.generalMessage)));
    document.querySelectorAll("[data-social]").forEach((el) => {
      const url = CONFIG.social[el.dataset.social];
      if (url && url.trim()) {
        el.href = url.trim();
        el.style.display = "";
      } else {
        el.style.display = "none";
      }
    });
    $("year").textContent = new Date().getFullYear();
  }

  /* ---------- Catálogo ---------- */
  const grid = $("grid");
  const empty = $("empty");

  function visibleProducts() {
    const q = normalize(state.q.trim());
    let list = PRODUCTS.map((p, i) => ({ p, i })).filter(({ p }) => {
      const okCat = state.cat === "Todas" || p.category === state.cat;
      const okQ = !q || normalize(p.name + " " + p.description + " " + p.category).includes(q);
      return okCat && okQ;
    });
    if (state.sort === "price-asc") list.sort((a, b) => a.p.price - b.p.price);
    if (state.sort === "price-desc") list.sort((a, b) => b.p.price - a.p.price);
    if (state.sort === "name") list.sort((a, b) => a.p.name.localeCompare(b.p.name, "es"));
    return list;
  }

  function cardHTML({ p, i }) {
    const msg = CONFIG.productMessage.replace("{producto}", p.name);
    return `
      <div class="col-12 col-sm-6 col-lg-4 col-xl-3">
        <article class="product-card reveal">
          <button type="button" class="product-img" data-detail="${i}" aria-label="Ver detalle de ${escapeHTML(p.name)}">
            <img src="${escapeHTML(resolveImg(p.image))}" alt="${escapeHTML(p.name)}" loading="lazy" data-fallback>
            <span class="badge-cat">${escapeHTML(p.category)}</span>
          </button>
          <div class="product-body">
            <h3><button type="button" class="title-link" data-detail="${i}">${escapeHTML(p.name)}</button></h3>
            <span class="product-price">${formatPrice(p.price)}</span>
            <p class="product-desc">${escapeHTML(p.description)}</p>
            <div class="card-actions">
              <a class="btn btn-wa flex-grow-1" href="${waLink(msg)}" data-wa-product="${escapeHTML(p.name)}" target="_blank" rel="noopener">
                <i class="bi bi-whatsapp"></i> Consultar
              </a>
              <button type="button" class="btn btn-outline-light btn-add" data-add="${i}" aria-label="Agregar ${escapeHTML(p.name)} a mi pedido" title="Agregar a mi pedido">
                <i class="bi bi-bag-plus"></i>
              </button>
            </div>
          </div>
        </article>
      </div>`;
  }

  function renderProducts() {
    const list = visibleProducts();
    grid.innerHTML = list.map(cardHTML).join("");
    imgFallback(grid);
    empty.classList.toggle("d-none", list.length > 0);
    $("resultCount").textContent = list.length + (list.length === 1 ? " gorra" : " gorras");
    observeReveals(grid);
  }

  function renderFilters() {
    const filters = $("filters");
    const cats = ["Todas", ...new Set(PRODUCTS.map((p) => p.category))];
    filters.innerHTML = cats
      .map((c) => `<button type="button" class="filter-btn${c === state.cat ? " active" : ""}" data-cat="${escapeHTML(c)}">${escapeHTML(c)}</button>`)
      .join("");
  }

  /* ---------- Detalle de producto ---------- */
  let modal, currentIndex = null;

  function openDetail(i) {
    const p = PRODUCTS[i];
    if (!p) return;
    currentIndex = i;
    const img = $("pmImg");
    img.src = resolveImg(p.image);
    img.alt = p.name;
    img.onerror = () => { img.onerror = null; img.src = PLACEHOLDER; };
    $("pmCat").textContent = p.category;
    $("pmName").textContent = p.name;
    $("pmPrice").textContent = formatPrice(p.price);
    $("pmDesc").textContent = p.description;
    $("pmWa").href = waLink(CONFIG.productMessage.replace("{producto}", p.name));
    $("pmWa").dataset.waProduct = p.name;
    trackEvent("view", p.name);
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
    trackEvent("cart", p.name);
    const badge = $("cartCount");
    badge.classList.remove("bump");
    void badge.offsetWidth;
    badge.classList.add("bump");
    showToast("Agregada: " + p.name);
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

    box.innerHTML = lines.map(({ p, qty }) => `
      <div class="cart-item">
        <img src="${escapeHTML(resolveImg(p.image))}" alt="" data-fallback>
        <div class="cart-item-info">
          <div class="cart-item-name">${escapeHTML(p.name)}</div>
          <div class="cart-item-price">${formatPrice(p.price)}</div>
          <div class="qty">
            <button type="button" data-qty="-1" data-name="${escapeHTML(p.name)}" aria-label="Quitar una">−</button>
            <span>${qty}</span>
            <button type="button" data-qty="1" data-name="${escapeHTML(p.name)}" aria-label="Agregar una">+</button>
          </div>
        </div>
        <button type="button" class="cart-remove" data-remove="${escapeHTML(p.name)}" aria-label="Eliminar ${escapeHTML(p.name)}"><i class="bi bi-trash"></i></button>
      </div>`).join("");
    imgFallback(box);

    $("cartTotal").textContent = formatPrice(total);
    $("cartFooter").classList.remove("d-none");

    const items = lines.map(({ p, qty }) => `• ${qty} x ${p.name} (${formatPrice(p.price * qty)})`).join("\n");
    const msg = `${CONFIG.orderIntro}\n\n${items}\n\nTotal: ${formatPrice(total)}\n\n${CONFIG.orderOutro}`;
    $("cartSend").href = waLink(msg);
  }

  function changeQty(name, delta) {
    cart[name] = (cart[name] || 0) + delta;
    if (cart[name] <= 0) delete cart[name];
    saveCart();
    renderCart();
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

    grid.addEventListener("click", (e) => {
      const add = e.target.closest("[data-add]");
      if (add) return addToCart(+add.dataset.add);
      const det = e.target.closest("[data-detail]");
      if (det) openDetail(+det.dataset.detail);
    });

    $("pmAdd").addEventListener("click", () => {
      if (currentIndex !== null) addToCart(currentIndex);
    });

    $("cartItems").addEventListener("click", (e) => {
      const q = e.target.closest("[data-qty]");
      if (q) return changeQty(q.dataset.name, +q.dataset.qty);
      const r = e.target.closest("[data-remove]");
      if (r) changeQty(r.dataset.remove, -Infinity);
    });

    $("cartClear").addEventListener("click", () => { cart = {}; saveCart(); renderCart(); });

    $("cartSend").addEventListener("click", () => trackEvent("order"));
    $("pmWa").addEventListener("click", (e) => trackEvent("wa", e.currentTarget.dataset.waProduct || null));
    document.querySelectorAll("[data-wa-general]").forEach((el) =>
      el.addEventListener("click", () => trackEvent("wa", null))
    );
    grid.addEventListener("click", (e) => {
      const wa = e.target.closest("[data-wa-product]");
      if (wa) trackEvent("wa", wa.dataset.waProduct);
    });

    // Cerrar menú móvil al navegar
    document.querySelectorAll(".navbar-nav a").forEach((a) =>
      a.addEventListener("click", () => {
        const menu = $("menu");
        if (menu.classList.contains("show")) bootstrap.Collapse.getInstance(menu)?.hide();
      })
    );
  }

  /* ---------- Inicio ---------- */
  // Los productos se editan desde /admin y se guardan en content/products.json (o en localStorage al instante)
  async function loadProducts() {
    try {
      const localOverride = JSON.parse(localStorage.getItem("monarch_custom_products") || "null");
      if (Array.isArray(localOverride) && localOverride.length > 0) {
        PRODUCTS = localOverride;
        return;
      }
    } catch (e) {}
    try {
      const res = await fetch("content/products.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(res.status);
      PRODUCTS = (await res.json()).products || [];
    } catch (err) {
      console.error("No se pudo cargar el catálogo:", err);
      PRODUCTS = [];
    }
  }

  async function init() {
    await loadSettings();
    applyConfig();
    bindEvents();
    if (!sessionStorage.getItem("monarch_visited")) {
      sessionStorage.setItem("monarch_visited", "1");
      trackEvent("visit");
    }
    await loadProducts();
    renderFilters();
    renderProducts();
    renderCart();
    observeReveals(document);
  }
  init();
})();
