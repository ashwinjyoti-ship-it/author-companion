export async function searchExa(claim, apiKey) {
  if (!apiKey) {
    const err = new Error("EXA_KEY_MISSING");
    err.code = "EXA_KEY_MISSING";
    throw err;
  }

  const response = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey
    },
    body: JSON.stringify({
      query: claim,
      numResults: 5,
      type: "auto",
      contents: { text: { maxCharacters: 300 } }
    })
  });

  if (!response.ok) {
    throw new Error(`EXA API error: ${response.status}`);
  }

  const data = await response.json();
  return (data.results || []).slice(0, 5).map(r => ({
    title: r.title || r.url,
    url: r.url,
    snippet: (r.text || r.summary || "").trim()
  }));
}
