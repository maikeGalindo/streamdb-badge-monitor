#!/usr/bin/env node
/**
 * Stream Database → Badge monitor
 *
 * 1. Lee https://api.streamdatabase.com/events
 * 2. Extrae insignias (set_id + version)
 * 3. Compara con data/known-badges.json
 * 4. Publica en X las nuevas y actualiza el estado
 *
 * Flags:
 *   --dry-run   Solo muestra, no publica ni escribe estado
 *   --seed      Guarda el estado actual sin publicar (primera ejecución)
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatPost } from "./format.js";
import { postTweet } from "./x-client.js";

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

      out.push({
        badge_id: b._id,
        set_id: setId,
        version: String(verId),
        title: version.title || setId,
        description: version.description || "",
        image: version.image_url_4x || version.image_url_2x || null,
        event_title: event.title,
        event_id: event._id,
        start: `${event.start_at_date || ""} ${event.start_at_time || ""}`.trim(),
        end: `${event.end_at_date || ""} ${event.end_at_time || ""}`.trim(),
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

async function main() {
  console.log(`[monitor] Inicio ${new Date().toISOString()}`);
  console.log(`[monitor] dry-run=${DRY_RUN} seed=${SEED}`);

  const events = await fetchEvents();
  const badges = extractBadges(events);
  console.log(`[monitor] Eventos: ${events.length} | Insignias: ${badges.length}`);

  const state = await loadState();
  const known = state.known || {};

  // Primera ejecución o --seed: solo registrar todo lo actual
  if (SEED || Object.keys(known).length === 0) {
    const next = {};
    for (const b of badges) {
      next[badgeKey(b)] = {
        title: b.title,
        event_title: b.event_title,
        image: b.image,
        first_seen: new Date().toISOString(),
      };
    }
    if (!DRY_RUN) {
      await saveState({ known: next, updatedAt: new Date().toISOString() });
      console.log(`[monitor] Estado sembrado con ${Object.keys(next).length} insignias.`);
    } else {
      console.log(`[monitor] (dry-run) Sembraría ${Object.keys(next).length} insignias.`);
    }
    if (SEED || Object.keys(known).length === 0) {
      console.log("[monitor] Listo. Las próximas ejecuciones solo publicarán las NUEVAS.");
      return;
    }
  }

  const news = badges.filter((b) => !known[badgeKey(b)]);
  console.log(`[monitor] Nuevas detectadas: ${news.length}`);

  for (const b of news) {
    const text = formatPost(b, LANG);
    console.log(`[monitor] → ${b.title} (${badgeKey(b)})`);

    if (DRY_RUN) {
      console.log("--- DRY RUN ---");
      console.log(text);
      console.log("---------------");
      continue;
    }

    try {
      await postTweet(text, b.image);
      // Pequeña pausa entre posts para no saturar rate limits
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      console.error(`[monitor] Error publicando ${b.title}:`, err.message);
      // No marcamos como conocida si falló el post
      continue;
    }

    known[badgeKey(b)] = {
      title: b.title,
      event_title: b.event_title,
      image: b.image,
      first_seen: new Date().toISOString(),
    };
  }

  // Actualizar también insignias que ya conocíamos (por si cambió título/imagen)
  for (const b of badges) {
    const k = badgeKey(b);
    if (known[k]) {
      known[k].title = b.title;
      known[k].event_title = b.event_title;
      known[k].image = b.image;
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
