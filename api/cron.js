/**
 * Vercel Serverless Function
 * GET/POST /api/cron
 *
 * Protegido con CRON_SECRET (header Authorization: Bearer ...)
 * Estado guardado en GitHub: data/known-badges.json
 */

import { runMonitor } from "../lib/run.js";

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const querySecret = req.query?.secret || "";

  // Vercel Cron envía header especial en Pro; en Hobby usamos secret en query o Bearer
  const vercelCron = req.headers["x-vercel-cron"] === "1";
  const allowed =
    vercelCron ||
    (secret && (token === secret || querySecret === secret)) ||
    (!secret && process.env.NODE_ENV !== "production");

  if (!allowed) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  try {
    const result = await runMonitor({ seed: false, dryRun: false });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron] FATAL", err);
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}
