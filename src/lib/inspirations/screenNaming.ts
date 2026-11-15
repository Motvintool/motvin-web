import { screenTypeLabel } from './taxonomy';

/**
 * One rule for what a screen is called, wherever it is shown — the screen
 * and flow previews, cards, search, compare, the lightbox and the admin. It
 * is the flow preview's rule: a screen the pipeline typed is called by its
 * type ("Form", "Sign-in"); one it could only call "Other" by its own name
 * ("Onboarding sharing"), which says more than "Other" does.
 */

type Nameable = { name?: string | null; screenType?: string | null };

/** What the screen is called: its type, or its own name when its type is "Other" or unknown. */
export function screenTitle(screen: Nameable): string {
  const type = String(screen.screenType ?? '').trim();
  const name = String(screen.name ?? '').trim();
  if (type && type !== 'other') return screenTypeLabel(type);
  return name || (type ? screenTypeLabel(type) : 'Screen');
}

type FlowLike = { id: string; name: string; parentId?: string | null; screenIds: string[] };

/** The flow a screen is a step of — a top-level one first, over a detour inside it. */
export function flowOfScreen<F extends FlowLike>(flows: readonly F[], screenId: string): F | null {
  return flows.find((flow) => !flow.parentId && flow.screenIds.includes(screenId)) ?? flows.find((flow) => flow.screenIds.includes(screenId)) ?? null;
}

/**
 * What a screen is called inside a flow: its title, unless that only repeats
 * the flow's name ("Onboarding" in Onboarding) — then its own name, which
 * says which step it is.
 */
export function screenTitleIn(flow: { name: string } | null | undefined, screen: Nameable): string {
  const title = screenTitle(screen);
  const name = String(screen.name ?? '').trim();
  return flow && name && title.toLowerCase() === flow.name.trim().toLowerCase() ? name : title;
}

/** The path a screen is shown under: app, the flow it is a step of, then the screen. */
export function screenTrail(app: { name: string } | null | undefined, flow: { name: string } | null | undefined, screen: Nameable): string[] {
  return [app?.name, flow?.name, screenTitleIn(flow, screen)].filter((part): part is string => Boolean(part));
}
