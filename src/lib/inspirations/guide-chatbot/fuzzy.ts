/**
 * Forgiving word matching for the guide: "swigy" is Swiggy, "flwos" is flows.
 * It is deliberately cautious — a wrong guess is worse than no guess — so it
 * only corrects longer words, only when exactly one known word is close, and
 * only when the first letter agrees.
 */

/** Edit distance where swapping two neighbouring letters counts as one slip. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) d[i][0] = i;
  for (let j = 0; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** How many slips a word of this length may have: none when short, more when long. */
export function maxTypos(length: number): number {
  if (length < 5) return 0;
  return length <= 7 ? 1 : 2;
}

/** The one known word a misspelling most likely means, or null when none fits or two fit equally. */
export function closestWord(token: string, vocabulary: string[]): string | null {
  const limit = maxTypos(token.length);
  // A known word, or the singular/plural of one, is already right.
  if (limit === 0 || vocabulary.includes(token) || vocabulary.includes(`${token}s`) || (token.endsWith('s') && vocabulary.includes(token.slice(0, -1)))) return null;
  let best: string | null = null;
  let bestDistance = Infinity;
  let tied = false;
  for (const word of vocabulary) {
    if (word.length < 5 || word[0] !== token[0] || Math.abs(word.length - token.length) > limit) continue;
    const distance = editDistance(token, word);
    if (distance > limit) continue;
    if (distance < bestDistance) {
      best = word;
      bestDistance = distance;
      tied = false;
    } else if (distance === bestDistance && word !== best) {
      tied = true;
    }
  }
  return tied ? null : best;
}

export type Correction = { from: string; to: string };

/** The text with every confident misspelling fixed, and a list of what was changed. */
export function correctText(text: string, vocabulary: string[]): { text: string; corrections: Correction[] } {
  const corrections: Correction[] = [];
  const fixed = text.replace(/[\p{L}\p{N}]+/gu, (token) => {
    const to = closestWord(token.toLowerCase(), vocabulary);
    if (!to) return token;
    corrections.push({ from: token, to });
    return to;
  });
  return { text: fixed, corrections };
}
