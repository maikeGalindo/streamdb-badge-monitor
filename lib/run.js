/**
 * Lógica compartida del monitor (Node / Vercel).
 * Estado: se lee y escribe en GitHub data/known-badges.json vía API.
 */

const API_URL = "https://api.streamdatabase.com/events";
const OWNER = process.env.GITHUB_OWNER || "maikeGalindo";
const REPO = process.env.GITHUB_REPO || "streamdb-badge-monitor";
const STATE_PATH = "data/known-badges.json";
const LANG = process.env.POST_LANGUAGE || "es";

function badgeKey(b) {
  return `${b.set_id}:${b.version}`;
}

function computeStatus(startStr, endStr) {
  const now = Date.now();
  try {
    const startParts = (startStr || "").trim().split(/\s+/).filter(Boolean);
    const endParts = (endStr || "").trim().split(/\s+/).filter(Boolean);
    const sd = startParts[0];
    const st = (startParts[1] || "00:00").slice(0, 5);
    const ed = endParts[0];
    const et = (endParts[1] || "23:59").slice(0, 5);
    if (!sd) return "unknown";
    const start = Date.parse(`${sd}T${st}:00Z`);
    const end = ed ? Date.parse(`${ed}T${et}:00Z`) : Infinity;
    if (Number.isNaN(start)) return "unknown";
    if (now < start) return "upcoming";
    if (now <= end) return "active";
    return "ended";
  } catch {
    return "unknown";
  }
}

function formatObjectives(badge) {
  if (badge.cost === "paid") return "Sub o gift sub (pago)";
  if (badge.cost === "free" || badge.watch) return "Tiempo de visualización (gratis)";
  return "Ver detalles en Stream Database";
}

function formatPost(badge, reason = "new_active") {
  const link = "https://www.streamdatabase.com/events";
  const headers = {
    new_active: "🆕 Nueva insignia de Twitch YA ACTIVA",
    new_upcoming: "📅 Nueva insignia PRÓXIMA",
    became_active: "🟢 Insignia ahora ACTIVA",
  };
  return [
    headers[reason] || headers.new_active,
    ``,
    `📛 ${badge.title}`,
    `🎮 ${badge.event_title}`,
    ``,
    reason === "new_upcoming"
      ? `⏳ Empieza: ${badge.start || "?"} UTC`
      : `⏳ Hasta: ${badge.end || "?"} UTC`,
    `📌 Objetivo: ${formatObjectives(badge)}`,
    ``,
    `🔗 ${link}`,
    ``,
    `👉 Entra a twitch.tv/alertadropsmx y déjalo abierto`,
  ].join("\n");
}

async function postDiscord(badge, text, reason) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("[discord] DISCORD_WEBHOOK_URL no configurada");
    return { ok: false };
  }

  const colors = { new_active: 0x00c853, new_upcoming: 0xffab00, became_active: 0x00e676 };
  const titles = {
    new_active: `🆕 ${badge.title} · YA ACTIVA`,
    new_upcoming: `📅 ${badge.title} · PRÓXIMA`,
    became_active: `🟢 ${badge.title} · AHORA ACTIVA`,
  };

  const embed = {
    title: titles[reason] || titles.new_active,
    description: text,
    color: colors[reason] || colors.new_active,
    url: "https://www.streamdatabase.com/events",
    timestamp: new Date().toISOString(),
    footer: { text: "AlertaDropsMX · Stream Database" },
    fields: [
      { name: "Evento / Juego", value: badge.event_title || "—", inline: true },
      {
        name: reason === "new_upcoming" ? "Empieza" : "Hasta",
        value: (reason === "new_upcoming" ? badge.start : badge.end) || "?",
        inline: true,
      },
    ],
  };
  if (badge.image) embed.thumbnail = { url: badge.image };

  const body = {
    username: "Badge Alert · AlertaDropsMX",
    content:
      reason === "became_active" || reason === "new_active"
        ? "🚨 **Insignia activa** → entra al stream: https://twitch.tv/alertadropsmx"
        : undefined,
    embeds: [embed],
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Discord HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  return { ok: true };
}

async function fetchEvents() {
  const res = await fetch(API_URL, {
    headers: {
      "User-Agent": "streamdb-badge-monitor/1.1",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const body = await res.json();
  return body.data || body;
}

function extractBadges(events) {
  const out = [];
  for (const event of events) {
    if (event.hidden) continue;
    for (const b of event.twitch_global_badges || []) {
      const current = b.current || {};
      const version = current.version || {};
      const avail = (b.availability || [])[0] || {};
      const setId = current.set_id;
      if (!setId) continue;
      const start = `${event.start_at_date || ""} ${event.start_at_time || ""}`.trim();
      const end = `${event.end_at_date || ""} ${event.end_at_time || ""}`.trim();
      const status = computeStatus(start, end);
      if (status === "ended") continue;
      out.push({
        set_id: setId,
        version: String(version.id || "1"),
        title: version.title || setId,
        image: version.image_url_4x || version.image_url_2x || null,
        event_title: event.title,
        start,
        end,
        status,
        cost: avail.cost || null,
        watch: !!avail.watch,
      });
    }
  }
  return out;
}

async function githubRequest(method, path, body) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("Falta GITHUB_TOKEN (para guardar el estado)");

  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "streamdb-badge-monitor",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`GitHub ${res.status}: ${t.slice(0, 300)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function loadState() {
  try {
    const data = await githubRequest(
      "GET",
      `/repos/${OWNER}/${REPO}/contents/${STATE_PATH}?ref=main`
    );
    const content = Buffer.from(data.content, "base64").toString("utf8");
    const parsed = JSON.parse(content);
    return { known: parsed.known || {}, sha: data.sha, updatedAt: parsed.updatedAt };
  } catch (err) {
    console.warn("[state] No se pudo leer estado:", err.message);
    return { known: {}, sha: null, updatedAt: null };
  }
}

async function saveState(known, sha) {
  const payload = {
    message: "chore: update known-badges state [skip ci]",
    content: Buffer.from(JSON.stringify({ known, updatedAt: new Date().toISOString() }, null, 2) + "\n").toString("base64"),
    branch: "main",
  };
  if (sha) payload.sha = sha;
  await githubRequest("PUT", `/repos/${OWNER}/${REPO}/contents/${STATE_PATH}`, payload);
}

export async function runMonitor({ seed = false, dryRun = false } = {}) {
  console.log(`[monitor] Inicio ${new Date().toISOString()} seed=${seed} dryRun=${dryRun}`);
  console.log(`[monitor] Discord: ${process.env.DISCORD_WEBHOOK_URL ? "SÍ" : "NO"}`);

  const events = await fetchEvents();
  const badges = extractBadges(events);
  console.log(`[monitor] Insignias: ${badges.length}`);

  const { known, sha } = await loadState();
  console.log(`[monitor] Known: ${Object.keys(known).length}`);

  if (seed || Object.keys(known).length === 0) {
    const next = {};
    for (const b of badges) {
      next[badgeKey(b)] = {
        title: b.title,
        event_title: b.event_title,
        image: b.image,
        status: b.status,
        first_seen: new Date().toISOString(),
      };
    }
    if (!dryRun) await saveState(next, sha);
    return { seeded: true, count: Object.keys(next).length, notified: 0 };
  }

  const toNotify = [];
  for (const b of badges) {
    const k = badgeKey(b);
    const prev = known[k];
    if (!prev) {
      toNotify.push({
        badge: b,
        reason: b.status === "upcoming" ? "new_upcoming" : "new_active",
      });
    } else if (
      (prev.status === "upcoming" || prev.status === "unknown") &&
      b.status === "active"
    ) {
      toNotify.push({ badge: b, reason: "became_active" });
    }
  }

  console.log(`[monitor] Avisos: ${toNotify.length}`);
  let notified = 0;

  for (const { badge, reason } of toNotify) {
    console.log(`[monitor] → ${badge.title} (${reason})`);
    if (dryRun) continue;
    try {
      const text = formatPost(badge, reason);
      await postDiscord(badge, text, reason);
      notified++;
      await new Promise((r) => setTimeout(r, 800));
    } catch (err) {
      console.error(`[monitor] Error ${badge.title}:`, err.message);
    }
    known[badgeKey(badge)] = {
      title: badge.title,
      event_title: badge.event_title,
      image: badge.image,
      status: badge.status,
      first_seen: known[badgeKey(badge)]?.first_seen || new Date().toISOString(),
      last_notified: new Date().toISOString(),
      last_reason: reason,
    };
  }

  for (const b of badges) {
    const k = badgeKey(b);
    if (known[k]) {
      known[k].title = b.title;
      known[k].event_title = b.event_title;
      known[k].image = b.image;
      known[k].status = b.status;
    } else if (!dryRun) {
      known[k] = {
        title: b.title,
        event_title: b.event_title,
        image: b.image,
        status: b.status,
        first_seen: new Date().toISOString(),
      };
    }
  }

  if (!dryRun) {
    // Re-leer sha por si cambió
    const fresh = await loadState();
    await saveState(known, fresh.sha);
  }

  return { seeded: false, notified, total: badges.length };
}
