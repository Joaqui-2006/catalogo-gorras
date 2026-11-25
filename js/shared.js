/* ============================================================
   Configuración y utilidades compartidas (tienda + panel admin).
   Lo editable desde el panel (WhatsApp, redes, lema, categorías)
   vive en content/settings.json; aquí solo hay valores por defecto.
   ============================================================ */
const CONFIG = {
  brandName: "MONARCH STREET",
  tagline: "More than caps",

  // Número de WhatsApp con indicativo de país, SIN "+" ni espacios (Colombia = 57).
  whatsappNumber: "573156994134",

  productMessage: "Hola, me interesa la gorra «{producto}». ¿Está disponible?",
  generalMessage: "Hola, quiero más información sobre sus gorras.",
  orderIntro: "Hola, quiero hacer este pedido:",
  orderOutro: "¿Me confirman disponibilidad y envío?",

  locale: "es-CO",
  currency: "COP",

  categories: ["Snapback", "Trucker", "Dad Hat", "Edición limitada"],
  social: { instagram: "", tiktok: "", facebook: "" },

  // Contadores anónimos de visitas (servicio externo gratuito, sin cookies ni datos personales).
  statsBase: "https://abacus.jasoncameron.dev",
  statsNamespace: "monarchstreet-4f9c2a",
  statsTimezone: "America/Bogota",
};

const UTIL = {
  escapeHTML: (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),

  // Minúsculas y sin tildes: "edicion" encuentra "Edición".
  normalize: (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),

  slug: (s) => UTIL.normalize(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "x",

  // Fecha "YYYY-MM-DD" en hora de Colombia, igual en tienda y panel.
  dayKey: (date = new Date()) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: CONFIG.statsTimezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date),

  formatPrice: (n) =>
    new Intl.NumberFormat(CONFIG.locale, { style: "currency", currency: CONFIG.currency, maximumFractionDigits: 0 }).format(Number(n) || 0),

  // Solo acepta enlaces http(s); evita "javascript:" y similares.
  safeUrl: (u) => {
    try {
      const x = new URL(String(u ?? "").trim());
      return /^https?:$/.test(x.protocol) ? x.href : "";
    } catch (e) {
      return "";
    }
  },
};
