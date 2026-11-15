/**
 * A UI element or pattern saved from a screen is kept as `<screenId>:<tag>`,
 * the tag being the element kind ("button") or the pattern category
 * ("Forms") it was saved under. A pattern saved from its own page keeps the
 * pattern's plain id instead, with no tag.
 */
export function screenItemId(screenId: string, tag: string): string {
  return `${screenId}:${tag}`;
}

/** The screen and tag of a `<screenId>:<tag>` id; null for a plain id. */
export function splitScreenItemId(id: string): { screenId: string; tag: string } | null {
  const at = id.lastIndexOf(':');
  if (at <= 0) return null;
  return { screenId: id.slice(0, at), tag: id.slice(at + 1) };
}
