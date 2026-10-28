/**
 * Plantillas de texto para los posts en X.
 */

function formatObjectives(badge) {
  // availability puede tener objectives anidados; hacemos un resumen simple
  const cost = badge.cost;
  if (cost === "paid") return "Sub o gift sub (pago)";
  if (cost === "free" || badge.watch) return "Tiempo de visualización (gratis)";
  return "Ver detalles en Stream Database";
}

export function formatPost(badge, lang = "es") {
  const link = "https://www.streamdatabase.com/events";
  const end = badge.end?.trim() || "?";

  if (lang === "en") {
    return [
      `🆕 New Twitch global badge available`,
      ``,
      `📛 ${badge.title}`,
      `🎮 ${badge.event_title}`,
      ``,
      `📌 ${formatObjectives(badge)}`,
      `⏳ Ends: ${end} UTC`,
      ``,
      `🔗 ${link}`,
    ].join("\n");
  }

  // Español (default)
  return [
    `🆕 Nueva insignia de Twitch disponible`,
    ``,
    `📛 ${badge.title}`,
    `🎮 ${badge.event_title}`,
    ``,
    `📌 Objetivo: ${formatObjectives(badge)}`,
    `⏳ Hasta: ${end} UTC`,
    ``,
    `🔗 ${link}`,
  ].join("\n");
}
