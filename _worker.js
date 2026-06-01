const DATA_KEY = "hours-tracker-records";
const APP_TITLE = "Hours Tracker";
const APP_EYEBROW = "Hours log";
const ACCENT = "#ff5a00";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (isPublicAsset(url.pathname)) {
      return env.ASSETS.fetch(request);
    }

    const currentUser = await getAccessUser(request, env);

    if (url.pathname === "/api/logout") {
      return redirect(accessLogoutUrl(request, env));
    }

    if (!currentUser) {
      return url.pathname.startsWith("/api/")
        ? json({ error: "Cloudflare Access login required." }, 401)
        : accessRequiredPage();
    }

    if (url.pathname === "/api/me") {
      return json({ user: currentUser });
    }

    if (url.pathname === "/api/records") {
      return handleRecords(request, env, currentUser);
    }

    if (url.pathname === "/api/health") {
      return json({ ok: true, storage: Boolean(env.TRACKER_KV), user: currentUser.email });
    }

    return env.ASSETS.fetch(request);
  },
};

function isPublicAsset(pathname) {
  return pathname === "/tt-access-logo.svg";
}

async function handleRecords(request, env, currentUser) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { Allow: "GET, PUT, POST, DELETE, OPTIONS" },
    });
  }

  if (!env.TRACKER_KV) {
    return json({ error: "Missing Cloudflare KV binding: TRACKER_KV" }, 500);
  }

  if (request.method === "GET") {
    const stored = await readStoredRecords(env);
    return json({
      records: Array.isArray(stored.records) ? stored.records : [],
      updatedAt: stored.updatedAt || null,
    });
  }

  if (request.method === "POST") {
    const payload = await request.json().catch(() => ({}));
    if (!Array.isArray(payload.records)) {
      return json({ error: "Expected a records array." }, 400);
    }

    const stored = await readStoredRecords(env);
    const records = mergeRecords(stored.records, payload.records, currentUser);
    const updatedAt = await writeRecords(env, records);

    return json({ ok: true, count: records.length, records, updatedAt });
  }

  if (request.method === "PUT") {
    const payload = await request.json().catch(() => ({}));
    if (!Array.isArray(payload.records)) {
      return json({ error: "Expected a records array." }, 400);
    }

    const stored = await readStoredRecords(env);
    const records = replaceRecords(stored.records, payload.records, currentUser);
    const updatedAt = await writeRecords(env, records);

    return json({ ok: true, count: records.length, records, updatedAt });
  }

  if (request.method === "DELETE") {
    const payload = await request.json().catch(() => ({}));
    const ids = new Set(Array.isArray(payload.ids) ? payload.ids.map(String) : []);
    const stored = await readStoredRecords(env);
    const records = cleanRecords(stored.records).filter((record) => !ids.has(String(record.id)));
    const updatedAt = await writeRecords(env, records);

    return json({ ok: true, count: records.length, records, updatedAt });
  }

  return json({ error: "Method not allowed." }, 405, { Allow: "GET, PUT, POST, DELETE, OPTIONS" });
}

async function getAccessUser(request, env) {
  const assertion = request.headers.get("Cf-Access-Jwt-Assertion") || getCookie(request.headers.get("Cookie") || "", "CF_Authorization");
  if (assertion) {
    const payload = decodeJwtPayload(assertion);
    if (payload && (await accessJwtIsTrusted(assertion, payload, env))) {
      const email = normaliseEmail(payload.email || payload.sub);
      if (email) {
        return {
          email,
          username: email,
          name: String(payload.name || payload.email || email),
          role: "access",
        };
      }
    }
  }

  const email = normaliseEmail(request.headers.get("Cf-Access-Authenticated-User-Email"));
  if (!email) return null;

  return {
    email,
    username: email,
    name: email,
    role: "access",
  };
}

function decodeJwtPayload(token) {
  const [, payload] = token.split(".");
  if (!payload) return null;

  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload)));
  } catch {
    return null;
  }
}

async function accessJwtIsTrusted(token, payload, env) {
  if (payload.exp && Number(payload.exp) * 1000 < Date.now()) return false;

  const teamDomain = normaliseTeamDomain(env.CLOUDFLARE_ACCESS_TEAM_DOMAIN || env.ACCESS_TEAM_DOMAIN);
  const audience = String(env.CLOUDFLARE_ACCESS_AUD || env.ACCESS_AUD || "").trim();
  if (!teamDomain || !audience) return true;

  const [headerPart, payloadPart, signaturePart] = token.split(".");
  const header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(headerPart)));
  const certs = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`).then((response) => response.json());
  const jwk = certs.keys?.find((key) => key.kid === header.kid);
  if (!jwk) return false;

  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, [
    "verify",
  ]);
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlToBytes(signaturePart),
    new TextEncoder().encode(`${headerPart}.${payloadPart}`),
  );
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];

  return verified && audiences.includes(audience);
}

function base64UrlToBytes(value) {
  const padded = String(value || "")
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(String(value || "").length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function normaliseTeamDomain(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

function normaliseEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function getCookie(cookieHeader, name) {
  return cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function accessLogoutUrl(request, env) {
  if (env.CLOUDFLARE_ACCESS_LOGOUT_URL) return env.CLOUDFLARE_ACCESS_LOGOUT_URL;

  const teamDomain = normaliseTeamDomain(env.CLOUDFLARE_ACCESS_TEAM_DOMAIN || env.ACCESS_TEAM_DOMAIN);
  if (teamDomain) return `https://${teamDomain}/cdn-cgi/access/logout`;

  return new URL("/cdn-cgi/access/logout", request.url).href;
}

async function readStoredRecords(env) {
  return (await env.TRACKER_KV.get(DATA_KEY, "json")) || {};
}

async function writeRecords(env, records) {
  const updatedAt = new Date().toISOString();
  await env.TRACKER_KV.put(DATA_KEY, JSON.stringify({ records, updatedAt }));
  return updatedAt;
}

function cleanRecords(records) {
  return Array.isArray(records) ? records.filter((record) => record && typeof record === "object") : [];
}

function tagRecord(record, user, existingRecord = {}) {
  const email = user.email;
  return {
    ...record,
    createdBy: existingRecord.createdBy || email,
    updatedBy: email,
  };
}

function replaceRecords(existingRecords, incomingRecords, user) {
  const existingById = new Map(cleanRecords(existingRecords).map((record) => [String(record.id), record]));
  return cleanRecords(incomingRecords).map((record) => tagRecord(record, user, existingById.get(String(record.id))));
}

function mergeRecords(existingRecords, incomingRecords, user) {
  const merged = new Map();
  for (const record of cleanRecords(existingRecords)) {
    if (record.id) merged.set(String(record.id), record);
  }
  for (const record of cleanRecords(incomingRecords)) {
    if (record.id) {
      const key = String(record.id);
      merged.set(key, tagRecord(record, user, merged.get(key)));
    }
  }
  return [...merged.values()];
}

function accessRequiredPage() {
  return html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${APP_TITLE}</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0a0a0a;
        color: #f8f8f8;
        font-family: "Segoe UI", system-ui, sans-serif;
      }
      main {
        width: min(92vw, 520px);
        border: 1px solid #2e3438;
        border-radius: 8px;
        background: #121212;
        padding: 28px;
      }
      p:first-child {
        color: ${ACCENT};
        font-size: 0.78rem;
        font-weight: 800;
        text-transform: uppercase;
      }
    </style>
  </head>
  <body>
    <main>
      <p>${APP_EYEBROW}</p>
      <h1>Cloudflare Access Required</h1>
      <p>Protect this Pages URL with Cloudflare Access, then sign in using the Access one-time PIN flow.</p>
    </main>
  </body>
</html>`, 401);
}

function redirect(location) {
  return new Response(null, {
    status: 303,
    headers: { Location: location },
  });
}

function html(content, status = 200) {
  return new Response(content, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}
