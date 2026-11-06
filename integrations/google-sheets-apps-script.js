/**
 * Pega este archivo en Extensiones > Apps Script del Google Sheet.
 * Despliega como aplicación web: ejecutar como tú y acceso "Cualquiera".
 * Configura SHEETS_WEBHOOK_SECRET en Propiedades del script.
 */

const HEADERS = [
  "badge_name", "badge_image", "slug", "status", "type", "startsAt", "endsAt",
  "claimMethod", "category", "isNew", "notes", "set_id", "version", "event_id", "updatedAt",
];

function doPost(e) {
  try {
    const expected = PropertiesService.getScriptProperties().getProperty("SHEETS_WEBHOOK_SECRET");
    const body = JSON.parse(e.postData.contents || "{}");
    const received = body.secret || e?.parameter?.secret || e?.headers?.["X-Sheets-Secret"] || "";
    if (expected && received !== expected) return json({ ok: false, error: "Unauthorized" });
    if (body.action !== "upsert_badges" || !Array.isArray(body.rows)) {
      return json({ ok: false, error: "Invalid payload" });
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    ensureHeaders(sheet);
    const values = sheet.getDataRange().getValues();
    const header = values[0].map(String);
    const slugIndex = header.indexOf("slug");
    const existing = new Map();
    for (let i = 1; i < values.length; i++) {
      const slug = String(values[i][slugIndex] || "");
      if (slug) existing.set(slug, i + 1);
    }

    let updated = 0;
    let inserted = 0;
    body.rows.forEach((row) => {
      const line = HEADERS.map((key) => row[key] ?? "");
      const target = existing.get(String(row.slug || ""));
      if (target) {
        sheet.getRange(target, 1, 1, line.length).setValues([line]);
        updated++;
      } else {
        sheet.appendRow(line);
        inserted++;
      }
    });

    return json({ ok: true, updated, inserted, total: body.rows.length });
  } catch (error) {
    return json({ ok: false, error: String(error) });
  }
}

function ensureHeaders(sheet) {
  const current = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (current.every((value, index) => String(value || "") === HEADERS[index])) return;
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
}

function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
