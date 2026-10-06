/**
 * The little bubble that calls out from the guide's button. It says something
 * different each time, but only a few times per visit, and it stops for good
 * once the visitor dismisses it or opens the guide.
 */

export const NUDGE_MAX = 4;
export const NUDGE_KEY = 'motvin-guide-nudge';

export type NudgeState = { shown: number; dismissed: boolean };

export function nudgeMessages(appName?: string | null): string[] {
  return [
    'Need help finding something?',
    'Looking for an app or a screen? Ask me 👋',
    appName ? `Curious how many screens ${appName} has?` : 'Not sure where to start? Just ask.',
    'I can take you anywhere in Motvin. Just say where.',
  ];
}

/** The message to show next, or null when this visit has had enough. */
export function nextNudge(state: NudgeState, messages: string[]): string | null {
  if (state.dismissed || state.shown >= NUDGE_MAX || messages.length === 0) return null;
  return messages[state.shown % messages.length];
}

export function readNudgeState(): NudgeState {
  try {
    const raw = sessionStorage.getItem(NUDGE_KEY);
    if (!raw) return { shown: 0, dismissed: false };
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object') return { shown: 0, dismissed: false };
    const { shown, dismissed } = data as Partial<NudgeState>;
    return { shown: typeof shown === 'number' && shown >= 0 ? Math.floor(shown) : 0, dismissed: dismissed === true };
  } catch {
    // Storage blocked: stay quiet rather than start over on every page.
    return { shown: NUDGE_MAX, dismissed: true };
  }
}

export function writeNudgeState(state: NudgeState) {
  try {
    sessionStorage.setItem(NUDGE_KEY, JSON.stringify(state));
  } catch {
    // Nothing to remember it in.
  }
}
