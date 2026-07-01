const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-sonnet-5";

async function callClaude(apiKey, systemPrompt, userPrompt) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }]
    })
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Anthropic response was not JSON");
  return JSON.parse(jsonMatch[0]);
}

export async function classifyChapterState(chapterText, apiKey) {
  if (!apiKey) return null;

  const result = await callClaude(
    apiKey,
    "You are a manuscript status classifier for a memoir writer. Given a chapter's text, classify its state. Respond with ONLY JSON: {\"state\": \"Drafted\" | \"Editing\" | \"Done\"}. Drafted = raw first-pass prose, still rough. Editing = prose has been revised, reads polished but likely still changing. Done = reads finished and consistent, no rough edges.",
    chapterText.slice(0, 6000)
  );

  if (!["Drafted", "Editing", "Done"].includes(result.state)) return null;
  return result.state;
}

export async function analyzeDrift(oldText, newText, apiKey) {
  if (!apiKey) return null;

  const result = await callClaude(
    apiKey,
    "You are a truth-guard editor for a memoir about grief and depression. Compare BEFORE and AFTER versions of a passage. Flag ONLY if the AFTER version drifts toward false comfort: adds unearned hope or resolution, softens harsh honest language, or pads a raw moment with philosophical explanation. Do NOT flag typo fixes, grammar, rewording for clarity, or reordering. Respond with ONLY JSON: {\"detected\": boolean, \"reason\": \"short phrase, e.g. 'sounds more hopeful now' or 'harsh language softened'\"}.",
    `BEFORE:\n${oldText}\n\nAFTER:\n${newText}`
  );

  return { detected: Boolean(result.detected), reason: result.reason || "tone shift detected" };
}
