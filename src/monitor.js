#!/usr/bin/env node
/**
 * Stream Database → Badge monitor
 * Avisa cuando aparece una insignia, cambia a activa o cambia su información.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatPost } from "./format.js";
import { postTweet } from "./x-client.js";
import { postDiscord } from "./discord.js";
import { syncBadgesToSheet } from "./google-sheets.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const STATE_PATH = path.join(ROOT, "data", "known-badges.json");
const API_URL = "https://api.streamdatabase.com/events";
const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run") || process.env.DRY_RUN === "true";
const SEED = args.has("--seed");
const LANG = process.env.POST_LANGUAGE || "es";

function badgeKey(badge) { return `${badge.set_id}:${badge.version}`; }

function computeStatus(startStr, endStr) {
  const now = Date.now();
  try {
    const startParts = (startStr || "").trim().split(/\s+/).filter(Boolean);
    const endParts = (endStr || "").trim().split(/\s+/).filter(Boolean);
    const startDate = startParts[0];
    const startTime = (startParts[1] || "00:00").slice(0, 5);
    const endDate = endParts[0];
    const endTime = (endParts[1] || "23:59").slice(0, 5);
    // Sin fecha de inicio → se trata como upcoming (no unknown)
    if (!startDate) return "upcoming";
    const start = Date.parse(`${startDate}T${startTime}:00Z`);
    const end = endDate ? Date.parse(`${endDate}T${endTime}:00Z`) : Infinity;
    if (Number.isNaN(start)) return "upcoming";
    if (now < start) return "upcoming";
    if (now <= end) return "active";
    return "ended";
  } catch { return "upcoming"; }
}

function notifyReasonForNew(status) { return status === "active" ? "new_active" : "new_upcoming"; }

function badgeFingerprint(badge) {
  return JSON.stringify({
    title: badge.title,
    description: badge.description,
    image: badge.image,
    event_title: badge.event_title,
    event_id: badge.event_id,
    start: badge.start,
    end: badge.end,
    status: badge.status,
    cost: badge.cost,
    scope: badge.scope,
    watch: badge.watch,
    subscription: badge.subscription,
  });
}

async function fetchEvents() {
  const response = await fetch(API_URL, {
    headers: {
      "User-Agent": "streamdb-badge-monitor/1.3 (+https://github.com/maikeGalindo/streamdb-badge-monitor)",
      Accept: "application/json",
    },
  });
  if (!response.ok) throw new Error(`API ${response.status} ${response.statusText}`);
  const body = await response.json();
  return body.data || body;
}

function extractBadges(events) {
  const badges = [];
  for (const event of events) {
    if (event.hidden) continue;
    for (const badge of event.twitch_global_badges || []) {
      const current = badge.current || {};
      const version = current.version || {};
      const availability = (badge.availability || [])[0] || {};
      const setId = current.set_id;
      const versionId = version.id || "1";
      if (!setId) continue;
      const start = `${event.start_at_date || ""} ${event.start_at_time || ""}`.trim();
      const end = `${event.end_at_date || ""} ${event.end_at_time || ""}`.trim();
      badges.push({
        badge_id: badge._id,
        set_id: setId,
        version: String(versionId),
        title: version.title || setId,
        description: version.description || "",
        image: version.image_url_4x || version.image_url_2x || null,
        event_title: event.title || "",
        event_id: event._id || "",
        start,
        end,
        status: computeStatus(start, end),
        cost: availability.cost || null,
        scope: availability.scope || null,
        watch: Boolean(availability.watch),
        subscription: Boolean(availability.subscription),
      });
    }
  }
  return badges;
}

async function loadState() {
  if (!existsSync(STATE_PATH)) return { known: {}, updatedAt: null };
  try { return JSON.parse(await readFile(STATE_PATH, "utf8")); }
  catch { return { known: {}, updatedAt: null }; }
}

async function saveState(state) {
  await mkdir(path.dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function notify(badge, reason) {
  const text = formatPost(badge, LANG, reason);
  if (!process.env.DISCORD_WEBHOOK_URL) {
    console.warn("[discord] DISCORD_WEBHOOK_URL no está configurada en los secrets.");
  } else {
    try { await postDiscord(badge, text, reason); }
    catch (error) { console.error(`[discord] Error: ${error.message}`); }
  }
  try { await postTweet(text, badge.image); }
  catch (error) { console.error(`[x] Error: ${error.message}`); }
}

async function main() {
  console.log(`[monitor] Inicio ${new Date().toISOString()}`);
  console.log(`[monitor] dry-run=${DRY_RUN} seed=${SEED}`);
  console.log(`[monitor] Discord webhook: ${process.env.DISCORD_WEBHOOK_URL ? "SÍ configurada" : "NO configurada"}`);

  const events = await fetchEvents();
  const badges = extractBadges(events);
  console.log(`[monitor] Eventos: ${events.length} | Insignias: ${badges.length}`);

  const state = await loadState();
  const known = state.known || {};
  console.log(`[monitor] Known en estado: ${Object.keys(known).length}`);

  // Adjuntar first_seen para calcular isNew en el Sheet
  for (const badge of badges) {
    const key = badgeKey(badge);
    const previous = known[key];
    badge.first_seen = previous?.first_seen || new Date().toISOString();
  }

  try { await syncBadgesToSheet(badges, { dryRun: DRY_RUN }); }
  catch (error) { console.error(`[sheets] Error sincronizando: ${error.message}`); }

  if (SEED || Object.keys(known).length === 0) {
    const next = {};
    for (const badge of badges) {
      next[badgeKey(badge)] = {
        title: badge.title,
        event_title: badge.event_title,
        image: badge.image,
        status: badge.status,
        fingerprint: badgeFingerprint(badge),
        first_seen: badge.first_seen || new Date().toISOString(),
      };
    }
    if (!DRY_RUN) {
      await saveState({ known: next, updatedAt: new Date().toISOString() });
      console.log(`[monitor] Estado sembrado con ${Object.keys(next).length} insignias.`);
    } else console.log(`[monitor] (dry-run) Sembraría ${Object.keys(next).length} insignias.`);
    console.log("[monitor] Fin.");
    return;
  }

  const toNotify = [];
  for (const badge of badges) {
    const key = badgeKey(badge);
    const previous = known[key];
    const fingerprint = badgeFingerprint(badge);
    if (!previous && badge.status !== "ended") {
      toNotify.push({ badge, reason: notifyReasonForNew(badge.status) });
    } else if (previous && (previous.status === "upcoming" || previous.status === "unknown") && badge.status === "active") {
      toNotify.push({ badge, reason: "became_active" });
    } else if (previous?.fingerprint && previous.fingerprint !== fingerprint && badge.status !== "ended") {
      toNotify.push({ badge, reason: "updated" });
    }
  }

  console.log(`[monitor] Avisos a enviar: ${toNotify.length}`);
  for (const item of toNotify) {
    console.log(`  - ${item.badge.title} (${badgeKey(item.badge)}) → ${item.reason} [api status=${item.badge.status}]`);
  }

  for (const { badge, reason } of toNotify) {
    if (DRY_RUN) {
      console.log("--- DRY RUN ---");
      console.log(formatPost(badge, LANG, reason));
      console.log("---------------");
      continue;
    }
    try {
      await notify(badge, reason);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch (error) { console.error(`[monitor] Error avisando ${badge.title}:`, error.message); }
  }

  for (const badge of badges) {
    const key = badgeKey(badge);
    const previous = known[key];
    known[key] = {
      ...(previous || {}),
      title: badge.title,
      event_title: badge.event_title,
      image: badge.image,
      status: badge.status,
      fingerprint: badgeFingerprint(badge),
      first_seen: previous?.first_seen || badge.first_seen || new Date().toISOString(),
    };
  }

  if (!DRY_RUN) {
    await saveState({ known, updatedAt: new Date().toISOString() });
    console.log(`[monitor] Estado guardado (${Object.keys(known).length} insignias).`);
  }
  console.log("[monitor] Fin.");
}

main().catch((error) => {
  console.error("[monitor] FATAL:", error);
  process.exit(1);
});
