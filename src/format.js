/**
 * Plantillas de texto para los posts.
 */

function formatObjectives(badge) {
  const cost = badge.cost;
  if (cost === "paid") return "Sub o gift sub (pago)";
  if (cost === "free" || badge.watch) return "Tiempo de visualización (gratis)";
  return "Ver detalles en Stream Database";
}

/**
 * @param {object} badge
 * @param {"es"|"en"} lang
 * @param {"new_active"|"new_upcoming"|"became_active"} reason
 */
export function formatPost(badge, lang = "es", reason = "new_active") {
  const link = "https://www.streamdatabase.com/events";
  const end = badge.end?.trim() || "?";
  const start = badge.start?.trim() || "?";

  if (lang === "en") {
    const headers = {
      new_active: "🆕 New Twitch badge is now ACTIVE",
      new_upcoming: "📅 New upcoming Twitch badge",
      became_active: "🟢 Badge is now ACTIVE",
    };
    return [
      headers[reason] || headers.new_active,
      ``,
      `📛 ${badge.title}`,
      `🎮 ${badge.event_title}`,
      ``,
      reason === "new_upcoming"
        ? `⏳ Starts: ${start} UTC`
        : `⏳ Ends: ${end} UTC`,
      `📌 ${formatObjectives(badge)}`,
      ``,
      `🔗 ${link}`,
    ].join("\n");
  }

  // Español
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
      ? `⏳ Empieza: ${start} UTC`
      : `⏳ Hasta: ${end} UTC`,
    `📌 Objetivo: ${formatObjectives(badge)}`,
    ``,
    `🔗 ${link}`,
    ``,
    `👉 Entra a twitch.tv/alertadropsmx y déjalo abierto`,
  ].join("\n");
}
