(function () {
  "use strict";

  const PLACEHOLDER = "assets/img/placeholder.svg";

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

  // Animación de aparición al hacer scroll
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

  // Marca, WhatsApp general y redes
  function applyConfig() {
    document.querySelectorAll("[data-brand]").forEach((el) => (el.textContent = CONFIG.brandName));
    document.querySelectorAll("[data-tagline]").forEach((el) => (el.textContent = CONFIG.tagline));
    document.title = CONFIG.brandName + " | Catálogo de gorras streetwear";
    document.querySelectorAll("[data-wa-general]").forEach((el) => (el.href = waLink(CONFIG.generalMessage)));
    document.querySelectorAll("[data-social]").forEach((el) => {
      const url = CONFIG.social[el.dataset.social];
      url ? (el.href = url) : (el.style.display = "none");
    });
    document.getElementById("year").textContent = new Date().getFullYear();
  }

  // Catálogo
  const grid = document.getElementById("grid");
  const filters = document.getElementById("filters");
  const empty = document.getElementById("empty");

  function cardHTML(p) {
    const msg = CONFIG.productMessage.replace("{producto}", p.name);
    return `
      <div class="col-12 col-sm-6 col-lg-4 col-xl-3 product-col">
        <article class="product-card reveal">
          <div class="product-img">
            <img src="${escapeHTML(p.image)}" alt="${escapeHTML(p.name)}" loading="lazy">
            <span class="badge-cat">${escapeHTML(p.category)}</span>
          </div>
          <div class="product-body">
            <h3>${escapeHTML(p.name)}</h3>
            <span class="product-price">${formatPrice(p.price)}</span>
            <p class="product-desc">${escapeHTML(p.description)}</p>
            <a class="btn btn-wa w-100" href="${waLink(msg)}" target="_blank" rel="noopener">
              <i class="bi bi-whatsapp"></i> Consultar por WhatsApp
            </a>
          </div>
        </article>
      </div>`;
  }

  function renderProducts(category) {
    const list = category === "Todas" ? PRODUCTS : PRODUCTS.filter((p) => p.category === category);
    grid.innerHTML = list.map(cardHTML).join("");
    grid.querySelectorAll("img").forEach((img) =>
      img.addEventListener("error", () => { img.src = PLACEHOLDER; }, { once: true })
    );
    empty.classList.toggle("d-none", list.length > 0);
    observeReveals(grid);
  }

  let PRODUCTS = [];

  function renderFilters() {
    const cats = ["Todas", ...new Set(PRODUCTS.map((p) => p.category))];
    filters.innerHTML = cats
      .map((c, i) => `<button type="button" class="filter-btn${i === 0 ? " active" : ""}" data-cat="${escapeHTML(c)}">${escapeHTML(c)}</button>`)
      .join("");
    filters.addEventListener("click", (e) => {
      const btn = e.target.closest(".filter-btn");
      if (!btn) return;
      filters.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderProducts(btn.dataset.cat);
    });
  }

  // Los productos se editan desde /admin y se guardan en content/products.json
  async function loadProducts() {
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
    applyConfig();
    await loadProducts();
    renderFilters();
    renderProducts("Todas");
    observeReveals(document);
  }
  init();

  // Cerrar menú móvil al navegar
  document.querySelectorAll(".navbar-nav a").forEach((a) =>
    a.addEventListener("click", () => {
      const menu = document.getElementById("menu");
      if (menu.classList.contains("show")) bootstrap.Collapse.getInstance(menu)?.hide();
    })
  );
})();
