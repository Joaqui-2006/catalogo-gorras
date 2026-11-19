import { getStore } from "@netlify/blobs";
import { verifyToken } from "./auth.mjs";

const DEFAULT_STATS = {
  totalVisits: 0,
  totalWhatsappClicks: 0,
  totalCartAdds: 0,
  totalOrderSends: 0,
  byDate: {},      // { "YYYY-MM-DD": { visits: 0, wa: 0, cart: 0 } }
  byProduct: {},   // { "Nombre gorra": { views: 0, wa: 0, cart: 0 } }
  recentEvents: [] // últimos 25 eventos
};

const CORS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

export default async (req) => {
  try {
    const store = getStore("monarch-stats");
    let stats = (await store.get("summary", { type: "json" })) || structuredClone(DEFAULT_STATS);

    if (req.method === "GET") {
      return new Response(JSON.stringify(stats), { status: 200, headers: CORS });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const type = String(body.type || "visit");
      const product = body.product ? String(body.product).slice(0, 120) : null;
      const today = new Date().toISOString().slice(0, 10);

      if (!stats.byDate[today]) {
        stats.byDate[today] = { visits: 0, wa: 0, cart: 0 };
      }

      if (type === "visit") {
        stats.totalVisits = (stats.totalVisits || 0) + 1;
        stats.byDate[today].visits += 1;
      } else if (type === "wa") {
        stats.totalWhatsappClicks = (stats.totalWhatsappClicks || 0) + 1;
        stats.byDate[today].wa += 1;
      } else if (type === "cart") {
        stats.totalCartAdds = (stats.totalCartAdds || 0) + 1;
        stats.byDate[today].cart += 1;
      } else if (type === "order") {
        stats.totalOrderSends = (stats.totalOrderSends || 0) + 1;
        stats.totalWhatsappClicks = (stats.totalWhatsappClicks || 0) + 1;
        stats.byDate[today].wa += 1;
      } else if (type === "reset") {
        const authStore = getStore("monarch-auth");
        const auth = await authStore.get("credentials", { type: "json" });
        const authHeader = req.headers.get("authorization") || "";
        const token = authHeader.replace(/^Bearer\s+/i, "").trim();
        if (!auth || !verifyToken(token, auth.secret)) {
          return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: CORS });
        }
        stats = structuredClone(DEFAULT_STATS);
        await store.setJSON("summary", stats);
        return new Response(JSON.stringify(stats), { status: 200, headers: CORS });
      }

      if (product) {
        if (!stats.byProduct[product]) {
          stats.byProduct[product] = { views: 0, wa: 0, cart: 0 };
        }
        if (type === "view") stats.byProduct[product].views += 1;
        if (type === "wa") stats.byProduct[product].wa += 1;
        if (type === "cart") stats.byProduct[product].cart += 1;
      }

      stats.recentEvents = [
        { ts: new Date().toISOString(), type, product },
        ...(stats.recentEvents || [])
      ].slice(0, 25);

      // Conservar solo los últimos 30 días en byDate
      const dates = Object.keys(stats.byDate).sort();
      if (dates.length > 30) {
        dates.slice(0, dates.length - 30).forEach((d) => delete stats.byDate[d]);
      }

      await store.setJSON("summary", stats);
      return new Response(JSON.stringify({ ok: true, stats }), { status: 200, headers: CORS });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err.message || err) }), { status: 500, headers: CORS });
  }
};

export const config = {
  path: "/api/stats"
};
