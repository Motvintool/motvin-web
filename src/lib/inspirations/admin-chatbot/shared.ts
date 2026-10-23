/**
 * Pure helpers shared by the dock (a client module) and the assistant on the
 * server. They live outside the 'use client' file: a function exported from a
 * client module cannot be called on the server.
 */

/** Stages in the order a run goes through them. */
export const INGEST_STAGES: { id: string; label: string }[] = [
  { id: 'upload', label: 'Uploading' },
  { id: 'extract', label: 'Reading frames' },
  { id: 'segment', label: 'Finding screens' },
  { id: 'review', label: 'Waiting for your choice' },
  { id: 'classify', label: 'Naming and typing' },
  { id: 'identify', label: 'Identifying the app' },
  { id: 'flows', label: 'Grouping journeys' },
  { id: 'publish', label: 'Publishing' },
  { id: 'published', label: 'In the library' },
  { id: 'research', label: 'AI writing content' },
  { id: 'manifest', label: 'Rebuilding index' },
];

export function stageIndex(stage: string): number {
  return INGEST_STAGES.findIndex((entry) => entry.id === stage);
}


/** The platform a message names, if it names one: "iOS", "Web Apps" or "Webs". */
export function platformIn(text: string): 'ios' | 'webapp' | 'web' | null {
  const t = text.toLowerCase();
  if (/\b(ios|iphone|ipad|apple)\b/.test(t)) return 'ios';
  // "Web Apps" (online applications) before "Webs" (websites), since both start with "web".
  if (/\b(web ?apps?|web applications?|online apps?|saas)\b/.test(t)) return 'webapp';
  if (/\b(webs|web|websites?|browser|desktop|chrome|safari)\b/.test(t)) return 'web';
  return null;
}
