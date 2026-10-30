#!/usr/bin/env node
/**
 * Stream Database → Badge monitor
 *
 * Avisa cuando:
 *  1. Aparece una insignia NUEVA (activa o próxima)
 *  2. Una insignia que era "próxima" pasa a ACTIVA
 *
 * Flags:
 *   --dry-run   Solo muestra, no publica ni escribe estado
 *   --seed      Guarda el estado actual sin publicar
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatPost } from "./format.js";
import { postTweet } from "./x-client.js";
import { postDiscord } from "./discord.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const STATE_PATH = path.join(ROOT, "data", "known-badges.json");
const API_URL = "https://api.streamdatabase.com/events";

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run") || process.env.DRY_RUN === "true";
const SEED = args.has("--seed");
const LANG = process.env.POST_LANGUAGE || "es";

function badgeKey(b) {
  return `${b.set_id}:${b.version}`;
}

function computeStatus(startStr, endStr) {
  // startStr / endStr: "YYYY-MM-DD HH:MM"
  const now = Date.now();
  try {
    const [sd, st] = (startStr || "").trim().split(/\s+/);
    const [ed, et] = (endStr || "").trim().split(/\s+/);
    if (!sd) return "unknown";
    const start = Date.parse(`${sd}T${(st || "00:00").slice(0, 5)}:00Z`);
    const end = ed ? Date.parse(`${ed}T${(et || "23:59").slice(0, 5)}:00Z`) : Infinity;
    if (Number.isNaN(start)) return "unknown";
    if (now < start) return "upcoming";
    if (now <= end) return "active";
    return "ended";
  } catch {
    return "unknown";
  }
}

async function fetchEvents() {
  const res = await fetch(API_URL, {
    headers: {
      "User-Agent": "streamdb-badge-monitor/1.0 (+https://github.com/maikeGalindo/streamdb-badge-monitor)",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`API ${res.status} ${res.statusText}`);
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
      const availList = b.availability || [];
      const avail = availList[0] || {};

      const setId = current.set_id;
      const verId = version.id || "1";
      if (!setId) continue;

      const start = `${event.start_at_date || ""} ${event.start_at_time || ""}`.trim();
      const end = `${event.end_at_date || ""} ${event.end_at_time || ""}`.trim();
      const status = computeStatus(start, end);

      // No nos interesan las que ya terminaron
      if (status === "ended") continue;

      out.push({
        badge_id: b._id,
        set_id: setId,
        version: String(verId),
        title: version.title || setId,
        description: version.description || "",
        image: version.image_url_4x || version.image_url_2x || null,
        event_title: event.title,
        event_id: event._id,
        start,
        end,
        status, // "active" | "upcoming" | "unknown"
        cost: avail.cost || null,
        scope: avail.scope || null,
        watch: !!avail.watch,
        subscription: !!avail.subscription,
      });
    }
  }
  return out;
}

async function loadState() {
  if (!existsSync(STATE_PATH)) return { known: {}, updatedAt: null };
  try {
    const raw = await readFile(STATE_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return { known: {}, updatedAt: null };
  }
}

async function saveState(state) {
  await mkdir(path.dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2) + "\n", "utf8");
}

async function notify(badge, reason) {
  const text = formatPost(badge, LANG, reason);

  try {
    await postDiscord(badge, text, reason);
  } catch (err) {
    console.error(`[discord] Error: ${err.message}`);
  }

  try {
    await postTweet(text, badge.image);
  } catch (err) {
    console.error(`[x] Error: ${err.message}`);
  }
}

async function main() {
  console.log(`[monitor] Inicio ${new Date().toISOString()}`);
  console.log(`[monitor] dry-run=${DRY_RUN} seed=${SEED}`);

  const events = await fetchEvents();
  const badges = extractBadges(events);
  console.log(`[monitor] Eventos: ${events.length} | Insignias activas/próximas: ${badges.length}`);

  const state = await loadState();
  const known = state.known || {};

  // --seed o primera vez: registrar todo sin avisar
  if (SEED || Object.keys(known).length === 0) {
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
    if (!DRY_RUN) {
      await saveState({ known: next, updatedAt: new Date().toISOString() });
      console.log(`[monitor] Estado sembrado con ${Object.keys(next).length} insignias.`);
    } else {
      console.log(`[monitor] (dry-run) Sembraría ${Object.keys(next).length} insignias.`);
    }
    console.log("[monitor] Listo. A partir de ahora avisará nuevas y cambios a activa.");
    return;
  }

  // Detectar novedades y cambios de estado
  const toNotify = []; // { badge, reason }

  for (const b of badges) {
    const k = badgeKey(b);
    const prev = known[k];

    if (!prev) {
      // Insignia completamente nueva
      const reason = b.status === "upcoming" ? "new_upcoming" : "new_active";
      toNotify.push({ badge: b, reason });
    } else if (prev.status === "upcoming" && b.status === "active") {
      // Pasó de próxima → activa
      toNotify.push({ badge: b, reason: "became_active" });
    }
  }

  console.log(`[monitor] Avisos a enviar: ${toNotify.length}`);

  for (const { badge, reason } of toNotify) {
    console.log(`[monitor] → ${badge.title} (${reason})`);

    if (DRY_RUN) {
      console.log("--- DRY RUN ---");
      console.log(formatPost(badge, LANG, reason));
      console.log("---------------");
      continue;
    }

    try {
      await notify(badge, reason);
      await new Promise((r) => setTimeout(r, 1500));
    } catch (err) {
      console.error(`[monitor] Error avisando ${badge.title}:`, err.message);
      continue;
    }

    // Marcar como conocida / actualizar status
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

  // Actualizar estado de todas las actuales (incluso sin notificar)
  for (const b of badges) {
    const k = badgeKey(b);
    if (known[k]) {
      known[k].title = b.title;
      known[k].event_title = b.event_title;
      known[k].image = b.image;
      known[k].status = b.status;
    } else if (!DRY_RUN) {
      // Por si falló el notify, al menos registrarla
      known[k] = {
        title: b.title,
        event_title: b.event_title,
        image: b.image,
        status: b.status,
        first_seen: new Date().toISOString(),
      };
    }
  }

  if (!DRY_RUN) {
    await saveState({ known, updatedAt: new Date().toISOString() });
    console.log(`[monitor] Estado guardado (${Object.keys(known).length} insignias).`);
  }

  console.log("[monitor] Fin.");
}

main().catch((err) => {
  console.error("[monitor] FATAL:", err);
  process.exit(1);
});
