/** Sincroniza las insignias del monitor con un Google Apps Script Web App. */

const TYPE_ES = {
  sub: "suscripción",
  watch: "tiempo visto",
  other: "otro",
};

function typeEs(badge) {
  if (badge.subscription) return TYPE_ES.sub;
  if (badge.watch) return TYPE_ES.watch;
  return TYPE_ES.other;
}

function claimMethodEs(badge) {
  if (badge.cost === "paid") return "Suscribirse o regalar sub en la categoría";
  if (badge.watch) return "Tiempo de visualización en la categoría";
  return "Ver detalles del evento";
}

function sheetRow(badge) {
  return {
    badge_name: badge.title || badge.set_id,
    badge_image: badge.image || "",
    slug: badge.set_id,
    // Status se mantiene en inglés porque el overlay depende de estos valores
    status: badge.status === "ended" ? "inactive" : (badge.status || "upcoming"),
    type: typeEs(badge),
    startsAt: badge.start || "sin fecha",
    endsAt: badge.end || "sin fecha",
    claimMethod: claimMethodEs(badge),
    category: badge.event_title || "",
    isNew: false,
    notes: badge.description || "",
    set_id: badge.set_id,
    version: badge.version,
    event_id: badge.event_id || "",
    updatedAt: new Date().toISOString(),
  };
}

export async function syncBadgesToSheet(badges, { dryRun = false } = {}) {
  const endpoint = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!endpoint) {
    console.log("[sheets] GOOGLE_SHEETS_WEBHOOK_URL no configurada — se omite.");
    return { ok: false, skipped: true };
  }
  if (dryRun) {
    console.log(`[sheets] (dry-run) Sincronizaría ${badges.length} insignias.`);
    return { ok: true, dryRun: true, count: badges.length };
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.GOOGLE_SHEETS_WEBHOOK_SECRET
        ? { "X-Sheets-Secret": process.env.GOOGLE_SHEETS_WEBHOOK_SECRET }
        : {}),
    },
    body: JSON.stringify({
      action: "upsert_badges",
      secret: process.env.GOOGLE_SHEETS_WEBHOOK_SECRET || "",
      rows: badges.map(sheetRow),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Sheets HTTP ${res.status}: ${text.slice(0, 240)}`);
  }
  const result = await res.json().catch(() => ({}));
  console.log(`[sheets] Sincronizadas ${badges.length} insignias.`);
  return { ok: true, count: badges.length, result };
}
