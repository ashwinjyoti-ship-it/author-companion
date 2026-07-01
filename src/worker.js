import { SEED_STORY_TEXT } from "./seedStory.js";
import { parseChapters, inferStateHeuristic, detectDriftHeuristic } from "./lib/docParser.js";
import { classifyChapterState, analyzeDrift } from "./lib/anthropic.js";
import { searchExa } from "./lib/exa.js";
import { getSetting, getAllSettings, setSetting, maskSettings, SETTINGS_KEYS } from "./lib/settings.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: JSON_HEADERS });
    }

    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    try {
      if (url.pathname === "/api/status" && request.method === "GET") {
        return await handleStatus(env);
      }
      if (url.pathname === "/api/edits/check" && request.method === "POST") {
        return await handleEditCheck(request, env);
      }
      if (url.pathname === "/api/edits/decide" && request.method === "POST") {
        return await handleEditDecide(request, env);
      }
      if (url.pathname === "/api/fact-check" && request.method === "POST") {
        return await handleFactCheck(request, env);
      }
      if (url.pathname === "/api/settings" && request.method === "GET") {
        return await handleGetSettings(env);
      }
      if (url.pathname === "/api/settings" && request.method === "POST") {
        return await handlePostSettings(request, env);
      }

      return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: JSON_HEADERS });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: JSON_HEADERS });
    }
  },

  async scheduled(event, env) {
    await env.DB.prepare(
      "DELETE FROM edits_flagged WHERE created_at < datetime('now', '-30 days')"
    ).run();
  }
};

async function loadDocText(env) {
  const docLink = await getSetting(env.DB, "google_doc_link");
  const apiKey = await getSetting(env.DB, "google_docs_api_key");

  if (docLink && apiKey) {
    try {
      const docId = extractDocId(docLink);
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${docId}?alt=media`, {
        headers: { Authorization: `Bearer ${apiKey}` }
      });
      if (response.ok) {
        return { text: await response.text(), source: "google_doc" };
      }
    } catch (_error) {
      // fall through to seed story
    }
  }

  return { text: SEED_STORY_TEXT, source: "seed" };
}

function extractDocId(docLink) {
  const match = docLink.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error("Invalid Google Doc link");
  return match[1];
}

async function handleStatus(env) {
  const { text, source } = await loadDocText(env);
  const chapters = parseChapters(text);
  const current = chapters[chapters.length - 1];

  const anthropicKey = await getSetting(env.DB, "anthropic_api_key");
  let state = null;
  try {
    state = await classifyChapterState(current.content, anthropicKey);
  } catch (_error) {
    state = null;
  }
  if (!state) state = inferStateHeuristic(current);

  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO sessions (id, doc_source, current_chapter, chapter_state, last_sync, created_at)
    VALUES ('default', ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      doc_source = excluded.doc_source,
      current_chapter = excluded.current_chapter,
      chapter_state = excluded.chapter_state,
      last_sync = excluded.last_sync
  `).bind(source, current.title, state, now, now).run();

  return new Response(JSON.stringify({
    session_id: "default",
    doc_source: source,
    chapter: current.title,
    state,
    word_count: current.wordCount,
    last_sync: now,
    chapters: chapters.map(c => ({ title: c.title, wordCount: c.wordCount }))
  }), { headers: JSON_HEADERS });
}

async function handleEditCheck(request, env) {
  const { section, old_text, new_text } = await request.json();

  if (!old_text || !new_text) {
    return new Response(JSON.stringify({ error: "old_text and new_text are required" }), {
      status: 400,
      headers: JSON_HEADERS
    });
  }

  const anthropicKey = await getSetting(env.DB, "anthropic_api_key");
  let drift = null;
  try {
    drift = await analyzeDrift(old_text, new_text, anthropicKey);
  } catch (_error) {
    drift = null;
  }
  if (!drift) drift = detectDriftHeuristic(old_text, new_text);

  if (!drift.detected) {
    return new Response(JSON.stringify({ detected: false }), { headers: JSON_HEADERS });
  }

  const editId = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO edits_flagged (id, session_id, section, old_text, new_text, reason, created_at)
    VALUES (?, 'default', ?, ?, ?, ?, ?)
  `).bind(editId, section || "manual_check", old_text, new_text, drift.reason, new Date().toISOString()).run();

  return new Response(JSON.stringify({
    detected: true,
    id: editId,
    old: old_text,
    new: new_text,
    reason: drift.reason
  }), { headers: JSON_HEADERS });
}

async function handleEditDecide(request, env) {
  const { edit_id, decision } = await request.json();
  if (!edit_id || !["keep", "revert"].includes(decision)) {
    return new Response(JSON.stringify({ error: "Invalid edit_id or decision" }), {
      status: 400,
      headers: JSON_HEADERS
    });
  }

  await env.DB.prepare("UPDATE edits_flagged SET user_decision = ? WHERE id = ?").bind(decision, edit_id).run();
  return new Response(JSON.stringify({ success: true, decision }), { headers: JSON_HEADERS });
}

async function handleFactCheck(request, env) {
  const { claim } = await request.json();
  if (!claim || !claim.trim()) {
    return new Response(JSON.stringify({ error: "Empty claim" }), { status: 400, headers: JSON_HEADERS });
  }

  const exaKey = await getSetting(env.DB, "exa_api_key");

  try {
    const sources = await searchExa(claim.trim(), exaKey);
    await env.DB.prepare(`
      INSERT INTO fact_checks (id, session_id, claim, search_results, created_at)
      VALUES (?, 'default', ?, ?, ?)
    `).bind(crypto.randomUUID(), claim, JSON.stringify(sources), new Date().toISOString()).run();

    return new Response(JSON.stringify({ claim, sources }), { headers: JSON_HEADERS });
  } catch (error) {
    if (error.code === "EXA_KEY_MISSING") {
      return new Response(JSON.stringify({
        claim,
        sources: [],
        message: "Add your EXA API key in Settings to enable fact-checking."
      }), { headers: JSON_HEADERS });
    }
    return new Response(JSON.stringify({
      claim,
      sources: [],
      message: "Search failed — check your EXA API key in Settings."
    }), { headers: JSON_HEADERS });
  }
}

async function handleGetSettings(env) {
  const raw = await getAllSettings(env.DB);
  return new Response(JSON.stringify(maskSettings(raw)), { headers: JSON_HEADERS });
}

async function handlePostSettings(request, env) {
  const body = await request.json();
  for (const key of SETTINGS_KEYS) {
    if (typeof body[key] === "string" && body[key].trim()) {
      await setSetting(env.DB, key, body[key].trim());
    }
  }
  const raw = await getAllSettings(env.DB);
  return new Response(JSON.stringify(maskSettings(raw)), { headers: JSON_HEADERS });
}
