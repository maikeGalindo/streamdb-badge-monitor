/**
 * Envía un mensaje a Discord usando un Webhook.
 */

export async function postDiscord(badge, text, reason = "new_active") {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    console.log("[discord] No hay DISCORD_WEBHOOK_URL configurada — se omite.");
    return { ok: false, skipped: true };
  }

  const colors = {
    new_active: 0x00c853,
    new_upcoming: 0xffab00,
    became_active: 0x00e676,
  };

  const titles = {
    new_active: `🆕 ${badge.title} · YA ACTIVA`,
    new_upcoming: `📅 ${badge.title} · PRÓXIMA`,
    became_active: `🟢 ${badge.title} · AHORA ACTIVA`,
  };

  const embed = {
    title: titles[reason] || titles.new_active,
    description: text,
    color: colors[reason] || colors.new_active,
    timestamp: new Date().toISOString(),
    footer: { text: "AlertaDropsMX" },
  };

  if (badge.image) {
    embed.thumbnail = { url: badge.image };
  }

  embed.fields = [
    { name: "Evento / Juego", value: badge.event_title || "—", inline: true },
    {
      name: reason === "new_upcoming" ? "Empieza" : "Hasta",
      value: (reason === "new_upcoming" ? badge.start : badge.end) || "?",
      inline: true,
    },
  ];

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
    throw new Error(`Discord webhook HTTP ${res.status}: ${t.slice(0, 200)}`);
  }

  console.log("[discord] Mensaje enviado.");
  return { ok: true };
}
