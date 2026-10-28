/**
 * Envía un mensaje a Discord usando un Webhook.
 * Solo necesitas la URL del webhook (se crea en Discord en 30 segundos).
 */

export async function postDiscord(badge, text) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    console.log("[discord] No hay DISCORD_WEBHOOK_URL configurada — se omite.");
    return { ok: false, skipped: true };
  }

  const embed = {
    title: `🆕 ${badge.title}`,
    description: text,
    color: 0x9146ff, // morado Twitch
    url: "https://www.streamdatabase.com/events",
    timestamp: new Date().toISOString(),
    footer: { text: "Stream Database · AlertaDropsMX" },
  };

  if (badge.image) {
    embed.thumbnail = { url: badge.image };
  }

  if (badge.event_title) {
    embed.fields = [
      { name: "Evento / Juego", value: badge.event_title, inline: true },
      { name: "Hasta", value: badge.end || "?", inline: true },
    ];
  }

  const body = {
    username: "Badge Alert",
    embeds: [embed],
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Discord webhook HTTP ${res.status}: ${t.slice(0, 200)}`);
  }

  console.log("[discord] Mensaje enviado.");
  return { ok: true };
}
