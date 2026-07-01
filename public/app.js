const API_BASE = "/api";
let currentEditId = null;

function $(id) {
  return document.getElementById(id);
}

async function init() {
  await loadStatus();
  await loadSettingsStatus();

  $("factCheckBtn").onclick = () => {
    $("factCheckModal").classList.remove("hidden");
    $("claimInput").focus();
  };
  $("closeFactCheck").onclick = () => $("factCheckModal").classList.add("hidden");
  $("searchBtn").onclick = performFactCheck;

  $("driftCheckBtn").onclick = () => $("driftModal").classList.remove("hidden");
  $("closeDrift").onclick = () => $("driftModal").classList.add("hidden");
  $("closeDriftResult").onclick = () => {
    $("driftModal").classList.add("hidden");
    resetDriftForm();
  };
  $("analyzeBtn").onclick = performDriftCheck;
  $("checkAnotherBtn").onclick = resetDriftForm;
  $("keepBtn").onclick = () => decideEdit("keep");
  $("revertBtn").onclick = () => decideEdit("revert");

  $("refreshBtn").onclick = loadStatus;

  $("settingsBtn").onclick = () => $("settingsModal").classList.remove("hidden");
  $("closeSettings").onclick = () => $("settingsModal").classList.add("hidden");
  $("saveSettingsBtn").onclick = saveSettings;
}

// ============================================
// STATUS RECALL
// ============================================

async function loadStatus() {
  try {
    const response = await fetch(`${API_BASE}/status`);
    const data = await response.json();

    $("chapter").textContent = data.chapter;
    $("state").textContent = data.state;
    $("wordCount").textContent = `${data.word_count} words`;
    $("docSource").textContent = data.doc_source === "google_doc" ? "Synced from Google Doc" : "Reading seed story";
    $("lastSync").textContent = `Last sync: ${new Date(data.last_sync).toLocaleTimeString()}`;

    $("chapterList").innerHTML = data.chapters.map(c => `
      <li class="flex justify-between ${c.title === data.chapter ? "font-bold" : ""}">
        <span>${escapeHtml(c.title)}</span>
        <span class="text-sage-600">${c.wordCount}w</span>
      </li>
    `).join("");
  } catch (error) {
    console.error("Failed to load status:", error);
    $("chapter").textContent = "Error loading";
  }
}

// ============================================
// EDIT TRACKING (DRIFT CHECK)
// ============================================

async function performDriftCheck() {
  const old_text = $("beforeInput").value.trim();
  const new_text = $("afterInput").value.trim();

  if (!old_text || !new_text) {
    alert("Paste both a before and after version.");
    return;
  }

  $("driftForm").classList.add("hidden");
  $("driftLoading").classList.remove("hidden");

  try {
    const response = await fetch(`${API_BASE}/edits/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "manual_check", old_text, new_text })
    });
    const data = await response.json();

    $("driftLoading").classList.add("hidden");
    $("driftResult").classList.remove("hidden");

    if (data.detected) {
      currentEditId = data.id;
      $("editReason").textContent = capitalize(data.reason) + ".";
      $("beforeText").textContent = data.old;
      $("afterText").textContent = data.new;
      $("driftFlag").classList.remove("hidden");
      $("driftClean").classList.add("hidden");
    } else {
      $("driftClean").classList.remove("hidden");
      $("driftFlag").classList.add("hidden");
    }
  } catch (error) {
    console.error("Drift check failed:", error);
    $("driftLoading").classList.add("hidden");
    $("driftForm").classList.remove("hidden");
    alert("Error checking for drift. Try again.");
  }
}

function resetDriftForm() {
  currentEditId = null;
  $("beforeInput").value = "";
  $("afterInput").value = "";
  $("driftResult").classList.add("hidden");
  $("driftFlag").classList.add("hidden");
  $("driftClean").classList.add("hidden");
  $("driftForm").classList.remove("hidden");
}

async function decideEdit(decision) {
  if (!currentEditId) return;
  try {
    await fetch(`${API_BASE}/edits/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ edit_id: currentEditId, decision })
    });
  } catch (error) {
    console.error("Failed to save decision:", error);
  }
  $("driftModal").classList.add("hidden");
  resetDriftForm();
}

// ============================================
// FACT CHECK
// ============================================

async function performFactCheck() {
  const claim = $("claimInput").value.trim();
  if (!claim) {
    alert("Enter a claim to fact-check");
    return;
  }

  $("searchLoading").classList.remove("hidden");
  $("searchResults").classList.add("hidden");
  $("searchMessage").classList.add("hidden");

  try {
    const response = await fetch(`${API_BASE}/fact-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim })
    });
    const data = await response.json();

    if (data.message) {
      $("searchMessage").textContent = data.message;
      $("searchMessage").classList.remove("hidden");
    } else if (!data.sources || data.sources.length === 0) {
      $("searchMessage").textContent = "No sources found. Try a different claim.";
      $("searchMessage").classList.remove("hidden");
    } else {
      const html = data.sources.map(s => `
        <div class="border-l-2 border-ink pl-3 py-2">
          <p class="text-xs font-bold">${escapeHtml(s.title)}</p>
          <p class="text-xs text-sage-600 mt-1">${escapeHtml(s.snippet)}</p>
          <a href="${escapeAttr(s.url)}" target="_blank" rel="noopener" class="text-xs underline mt-1 inline-block">Read more →</a>
        </div>
      `).join("");
      $("searchResults").innerHTML = `<p class="text-xs font-bold mb-2">SOURCES</p>${html}`;
      $("searchResults").classList.remove("hidden");
    }
  } catch (error) {
    console.error("Fact check failed:", error);
    $("searchMessage").textContent = "Error searching. Try again.";
    $("searchMessage").classList.remove("hidden");
  } finally {
    $("searchLoading").classList.add("hidden");
  }
}

// ============================================
// SETTINGS
// ============================================

async function loadSettingsStatus() {
  try {
    const response = await fetch(`${API_BASE}/settings`);
    const data = await response.json();
    $("googleDocLink").value = data.google_doc_link || "";
    $("googleKeyStatus").textContent = data.google_docs_api_key.configured ? "(configured)" : "(not set)";
    $("anthropicKeyStatus").textContent = data.anthropic_api_key.configured ? "(configured)" : "(not set)";
    $("exaKeyStatus").textContent = data.exa_api_key.configured ? "(configured)" : "(not set)";
  } catch (error) {
    console.error("Failed to load settings:", error);
  }
}

async function saveSettings() {
  const body = {
    google_doc_link: $("googleDocLink").value,
    google_docs_api_key: $("googleDocsApiKey").value,
    anthropic_api_key: $("anthropicApiKey").value,
    exa_api_key: $("exaApiKey").value
  };

  try {
    await fetch(`${API_BASE}/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    $("googleDocsApiKey").value = "";
    $("anthropicApiKey").value = "";
    $("exaApiKey").value = "";
    await loadSettingsStatus();
    $("settingsSaved").classList.remove("hidden");
    setTimeout(() => $("settingsSaved").classList.add("hidden"), 2000);
    await loadStatus();
  } catch (error) {
    console.error("Failed to save settings:", error);
    alert("Error saving settings.");
  }
}

// ============================================
// UTIL
// ============================================

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

function escapeAttr(url) {
  return encodeURI(url || "");
}

function capitalize(text) {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

init();
