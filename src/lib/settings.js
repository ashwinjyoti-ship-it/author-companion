const KEYS = ["google_docs_api_key", "google_doc_link", "exa_api_key", "anthropic_api_key"];

export async function getSetting(db, key) {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first();
  return row ? row.value : null;
}

export async function getAllSettings(db) {
  const { results } = await db.prepare("SELECT key, value FROM settings").all();
  const map = {};
  for (const row of results) map[row.key] = row.value;
  return map;
}

export async function setSetting(db, key, value) {
  if (!KEYS.includes(key)) return;
  await db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(key, value, new Date().toISOString()).run();
}

export function maskSettings(raw) {
  const masked = { google_doc_link: raw.google_doc_link || null };
  for (const key of ["google_docs_api_key", "exa_api_key", "anthropic_api_key"]) {
    masked[key] = { configured: Boolean(raw[key]) };
  }
  return masked;
}

export { KEYS as SETTINGS_KEYS };
