import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

const CORS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(String(password), String(salt), 100000, 64, "sha512").toString("hex");
}

function makeToken(username, secret) {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 días
  const payload = Buffer.from(JSON.stringify({ u: username, exp })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyToken(token, secret) {
  if (!token || !secret || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  if (sig !== expected) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.exp || Date.now() > data.exp) return null;
    return data.u;
  } catch {
    return null;
  }
}

async function getOrInitAuth(store) {
  let auth = await store.get("credentials", { type: "json" });
  if (!auth) {
    const salt = crypto.randomBytes(16).toString("hex");
    const secret = crypto.randomBytes(32).toString("hex");
    const defaultUser = process.env.ADMIN_USER || "admin";
    const defaultPass = process.env.ADMIN_PASS || "Monarch2026*";
    auth = {
      username: defaultUser,
      salt,
      passwordHash: hashPassword(defaultPass, salt),
      secret,
      updatedAt: new Date().toISOString()
    };
    await store.setJSON("credentials", auth);
  }
  return auth;
}

export default async (req) => {
  try {
    const store = getStore("monarch-auth");
    const auth = await getOrInitAuth(store);

    if (req.method === "GET") {
      const authHeader = req.headers.get("authorization") || "";
      const token = authHeader.replace(/^Bearer\s+/i, "").trim();
      const user = verifyToken(token, auth.secret);
      if (!user) {
        return new Response(JSON.stringify({ authenticated: false }), { status: 401, headers: CORS });
      }
      return new Response(JSON.stringify({ authenticated: true, username: auth.username }), { status: 200, headers: CORS });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const action = body.action || "login";

      if (action === "login") {
        const userIn = String(body.username || "").trim();
        const passIn = String(body.password || "");
        const candidateHash = hashPassword(passIn, auth.salt);

        const userMatch = userIn.toLowerCase() === String(auth.username).toLowerCase();
        const passMatch = crypto.timingSafeEqual(
          Buffer.from(candidateHash, "hex"),
          Buffer.from(auth.passwordHash, "hex")
        );

        if (!userMatch || !passMatch) {
          return new Response(
            JSON.stringify({ ok: false, error: "Usuario o contraseña incorrectos." }),
            { status: 401, headers: CORS }
          );
        }

        const token = makeToken(auth.username, auth.secret);
        return new Response(
          JSON.stringify({ ok: true, token, username: auth.username }),
          { status: 200, headers: CORS }
        );
      }

      if (action === "change_credentials") {
        const authHeader = req.headers.get("authorization") || "";
        const token = authHeader.replace(/^Bearer\s+/i, "").trim();
        const user = verifyToken(token, auth.secret);
        if (!user) {
          return new Response(JSON.stringify({ ok: false, error: "Sesión no válida o expirada." }), { status: 401, headers: CORS });
        }

        const currentPass = String(body.currentPassword || "");
        const currentHash = hashPassword(currentPass, auth.salt);
        const currentOk = crypto.timingSafeEqual(
          Buffer.from(currentHash, "hex"),
          Buffer.from(auth.passwordHash, "hex")
        );
        if (!currentOk) {
          return new Response(JSON.stringify({ ok: false, error: "La contraseña actual no es correcta." }), { status: 403, headers: CORS });
        }

        const newUsername = String(body.newUsername || auth.username).trim();
        const newPassword = String(body.newPassword || "");
        if (newUsername.length < 3) {
          return new Response(JSON.stringify({ ok: false, error: "El usuario debe tener al menos 3 caracteres." }), { status: 400, headers: CORS });
        }
        if (newPassword.length < 6) {
          return new Response(JSON.stringify({ ok: false, error: "La nueva contraseña debe tener al menos 6 caracteres." }), { status: 400, headers: CORS });
        }

        const newSalt = crypto.randomBytes(16).toString("hex");
        const newSecret = crypto.randomBytes(32).toString("hex");
        const updated = {
          username: newUsername,
          salt: newSalt,
          passwordHash: hashPassword(newPassword, newSalt),
          secret: newSecret,
          updatedAt: new Date().toISOString()
        };
        await store.setJSON("credentials", updated);

        const newToken = makeToken(updated.username, updated.secret);
        return new Response(
          JSON.stringify({ ok: true, token: newToken, username: updated.username }),
          { status: 200, headers: CORS }
        );
      }
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err.message || err) }), { status: 500, headers: CORS });
  }
};

export const config = {
  path: "/api/auth"
};
