const CHAPTER_HEADING = /^#\s+(Chapter\s+.+)$/gim;

export function parseChapters(rawText) {
  const text = rawText.split(/\[END STORY\]/i)[0];
  const matches = [...text.matchAll(CHAPTER_HEADING)];

  if (matches.length === 0) {
    return [{ title: "Untitled", content: text.trim(), wordCount: countWords(text) }];
  }

  const chapters = matches.map((match, i) => {
    const start = match.index + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const content = text.slice(start, end).trim();
    return {
      title: match[1].trim(),
      content,
      wordCount: countWords(content)
    };
  });

  return chapters;
}

function countWords(text) {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function inferStateHeuristic(chapter) {
  if (chapter.wordCount < 200) return "Drafted";
  if (chapter.wordCount < 500) return "Drafted";
  return "Editing";
}

const HOPEFUL_WORDS = [
  "finally", "learned", "realized", "discovered", "peace",
  "overcome", "accept", "embrace", "grow", "wisdom", "enlightenment"
];

export function detectDriftHeuristic(oldText, newText) {
  const oldLower = oldText.toLowerCase();
  const newLower = newText.toLowerCase();

  const oldHopeful = HOPEFUL_WORDS.filter(w => oldLower.includes(w)).length;
  const newHopeful = HOPEFUL_WORDS.filter(w => newLower.includes(w)).length;

  if (newHopeful > oldHopeful) {
    return { detected: true, reason: "sounds more hopeful now" };
  }

  if (newText.length > oldText.length * 1.25) {
    return { detected: true, reason: "padded with explanation" };
  }

  if (oldLower.includes("can't") && newLower.includes("struggle to")) {
    return { detected: true, reason: "harsh language softened" };
  }

  return { detected: false, reason: null };
}
