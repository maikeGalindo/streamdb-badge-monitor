/**
 * Plantillas de texto para los posts.
 * Horarios en hora de Ciudad de México (CDMX).
 */

/** Convierte "YYYY-MM-DD HH:MM" (UTC) a texto en hora CDMX */
export function toCdmx(utcStr) {
  const raw = (utcStr || "").trim();
  if (!raw) return "?";
  try {
    const parts = raw.split(/\s+/).filter(Boolean);
    const date = parts[0];
    const time = (parts[1] || "00:00").slice(0, 5);
    const d = new Date(`${date}T${time}:00Z`);
    if (Number.isNaN(d.getTime())) return raw;

    const fmt = new Intl.DateTimeFormat("es-MX", {
      timeZone: "America/Mexico_City",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    // es-MX suele dar dd/mm/aaaa, hh:mm
    return `${fmt.format(d)} CDMX`;
  } catch {
    return raw;
  }
}

function formatObjectives(badge) {
  const cost = badge.cost;
  if (cost === "paid") return "Sub o gift sub (pago)";
  if (cost === "free" || badge.watch) return "Tiempo de visualización (gratis)";
  return "Ver detalles en el juego / canal";
}

/**
 * @param {object} badge
 * @param {"es"|"en"} lang
 * @param {"new_active"|"new_upcoming"|"became_active"|"updated"} reason
 */
export function formatPost(badge, lang = "es", reason = "new_active") {
  const end = toCdmx(badge.end);
  const start = toCdmx(badge.start);

  if (lang === "en") {
    const headers = {
      new_active: "🆕 New Twitch badge is now ACTIVE",
      new_upcoming: "📅 New upcoming Twitch badge",
      became_active: "🟢 Badge is now ACTIVE",
      updated: "🔄 Twitch badge updated",
    };
    return [
      headers[reason] || headers.new_active,
      ``,
      `📛 ${badge.title}`,
      `🎮 ${badge.event_title}`,
      ``,
      reason === "new_upcoming" || (reason === "updated" && badge.status === "upcoming") ? `⏳ Starts: ${start}` : `⏳ Ends: ${end}`,
      `📌 ${formatObjectives(badge)}`,
      ``,
      `👉 Open twitch.tv/alertadropsmx and leave it running`,
    ].join("\n");
  }

  const headers = {
    new_active: "🆕 Nueva insignia de Twitch YA ACTIVA",
    new_upcoming: "📅 Nueva insignia PRÓXIMA",
    became_active: "🟢 Insignia ahora ACTIVA",
    updated: "🔄 Insignia de Twitch actualizada",
  };

  return [
    headers[reason] || headers.new_active,
    ``,
    `📛 ${badge.title}`,
    `🎮 ${badge.event_title}`,
    ``,
    reason === "new_upcoming" || (reason === "updated" && badge.status === "upcoming") ? `⏳ Empieza: ${start}` : `⏳ Hasta: ${end}`,
    `📌 Objetivo: ${formatObjectives(badge)}`,
    ``,
    `👉 Entra a twitch.tv/alertadropsmx y déjalo abierto`,
  ].join("\n");
}
