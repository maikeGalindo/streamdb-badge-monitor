import { TwitterApi } from "twitter-api-v2";
import { readFile } from "node:fs/promises";

/**
 * Cliente mínimo de X (Twitter) usando OAuth 1.0a User Context.
 * Si faltan las variables de entorno, postTweet se comporta como no-op (solo log).
 */

function getClient() {
  const {
    X_API_KEY,
    X_API_SECRET,
    X_ACCESS_TOKEN,
    X_ACCESS_SECRET,
  } = process.env;

  if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_SECRET) {
    return null;
  }

  return new TwitterApi({
    appKey: X_API_KEY,
    appSecret: X_API_SECRET,
    accessToken: X_ACCESS_TOKEN,
    accessSecret: X_ACCESS_SECRET,
  });
}

/**
 * Descarga una imagen por URL y la sube a X como media.
 * @returns {Promise<string|null>} media_id o null
 */
async function uploadImageFromUrl(client, imageUrl) {
  if (!imageUrl) return null;
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "image/png";
    const mediaId = await client.v1.uploadMedia(buf, {
      mimeType: contentType,
    });
    return mediaId;
  } catch (err) {
    console.warn("[x] No se pudo subir imagen:", err.message);
    return null;
  }
}

/**
 * Publica un tweet. Si no hay credenciales, solo imprime.
 * @param {string} text
 * @param {string|null} imageUrl
 * @returns {Promise<{ok: boolean, id?: string}>}
 */
export async function postTweet(text, imageUrl = null) {
  const client = getClient();

  if (!client) {
    console.log("[x] Sin credenciales de X — modo consola:");
    console.log("---");
    console.log(text);
    if (imageUrl) console.log("(imagen)", imageUrl);
    console.log("---");
    return { ok: true, dry: true };
  }

  const rw = client.readWrite;
  let mediaIds = undefined;

  if (imageUrl) {
    const mediaId = await uploadImageFromUrl(client, imageUrl);
    if (mediaId) mediaIds = [mediaId];
  }

  const tweet = await rw.v2.tweet({
    text,
    ...(mediaIds ? { media: { media_ids: mediaIds } } : {}),
  });

  console.log("[x] Publicado:", tweet.data?.id);
  return { ok: true, id: tweet.data?.id };
}
