/**
 * What the panel (src/ui) and the main code (src/code.ts) say to each other,
 * and the shapes the Motvin API answers with (motvin-backend
 * src/modules/figma/figma.controller.ts).
 */

/** iOS, Web Apps and Webs: separate libraries that never mix. */
export type Platform = 'ios' | 'webapp' | 'site';

export const PLATFORM_LABEL: Record<Platform, string> = { ios: 'iOS', webapp: 'Web Apps', site: 'Webs' };

export interface Rendition {
  width: number;
  height: number;
  parts: number;
  full: boolean;
  frame: { width: number; height: number };
}

export interface AppRef {
  id: string;
  name: string;
  slug: string;
  /** The app's logo: a public image path on the Motvin API. */
  logo: string | null;
}

export interface Screen {
  id: string;
  name: string;
  app: AppRef;
  platform: Platform;
  screen_type: string;
  states: string[];
  description: string | null;
  page_url: string;
  attribution: string | null;
  image: Rendition;
}

export interface Step extends Screen {
  position: number;
  action: { kind: string; label: string | null } | null;
}

export interface Flow {
  id: string;
  name: string;
  app: AppRef;
  platform: Platform;
  category: string;
  summary: string | null;
  steps: number;
  cover_id: string | null;
  page_url: string;
}

/** A screen with its image parts downloaded, top to bottom, ready for the canvas. */
export interface PlacedScreen {
  screen: Screen;
  parts: Uint8Array[];
}

export interface Session {
  access_token: string;
  refresh_token: string;
  /** When the access token runs out, ms since the epoch. */
  expires_at: number;
  email: string;
  client_id: string;
}

/** The person's panel settings, kept on their computer with the sign-in. */
export interface Prefs {
  /** "auto" follows Figma's own theme. */
  theme: 'auto' | 'light' | 'dark';
  /** Put the app name, screen type and a Motvin link under each screen. */
  captions: boolean;
  /** How big the results grid draws each screen. */
  size: 's' | 'm' | 'l';
  /** What the person searched for lately, newest first. */
  recent: string[];
  /** Where added screens land: centred in view, or beside what is selected on the canvas. */
  placement: Placement;
  /** The first-run tour has been seen (finished or skipped). */
  welcomed: boolean;
}

export type Placement = 'view' | 'selection';

/** The panel's size limits, and where it opens the first time. */
export const PANEL = { width: 480, height: 720, minWidth: 480, minHeight: 480, maxWidth: 1200, maxHeight: 1400 };

export const DEFAULT_PREFS: Prefs = { theme: 'auto', captions: true, size: 'm', recent: [], placement: 'view', welcomed: false };

// ───────────────────────────────────────────── panel → main

export type ToMain =
  | { type: 'load-session' }
  | { type: 'save-session'; session: Session | null }
  | { type: 'save-prefs'; prefs: Prefs }
  | { type: 'open-url'; url: string }
  | { type: 'place-screens'; screens: PlacedScreen[]; captions: boolean; placement: Placement }
  | { type: 'place-flow'; flow: Flow; steps: { step: Step; parts: Uint8Array[] }[]; captions: boolean; placement: Placement }
  | { type: 'notify'; message: string; error?: boolean }
  | { type: 'read-selection' }
  /**
   * Dragging a resize edge or corner: `dx`/`dy` is how far the pointer has moved since `resize-start`. Left and top
   * edges move the window too, so its far side stays put. `save` on release keeps the size for next time.
   */
  | { type: 'resize-start' }
  | { type: 'resize'; edge: ResizeEdge; dx: number; dy: number; save?: boolean };

/** Which side or corner of the panel is dragged: n, s, e, w, or a corner like se. */
export type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

// ───────────────────────────────────────────── main → panel

export type ToUi =
  | { type: 'session'; session: Session | null; prefs: Prefs }
  | { type: 'placed'; count: number }
  | { type: 'place-failed'; message: string }
  | { type: 'selection'; selection: CanvasSelection | null };

/** What is selected on the canvas, for "Match selection": its layer names, some of its text and its width. */
export interface CanvasSelection {
  names: string[];
  texts: string[];
  width: number;
}
