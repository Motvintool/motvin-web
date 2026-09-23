import type { App, Flow, Pattern, Screen } from './types';

/** Every Inspirations URL in one place so links never drift. */
export const INSPIRATIONS_ROUTES = {
  explore: '/inspirations',
  apps: '/inspirations/apps',
  screens: '/inspirations/screens',
  uiElements: '/inspirations/ui-elements',
  flows: '/inspirations/flows',
  patterns: '/inspirations/patterns',
  search: '/inspirations/search',
  /**
   * The visitor's boards — bare, the boards grid; `?collection=<id>` opens
   * one. `/inspirations/saved` used to be a second, overlapping entry point
   * into this same feature (a flat, separately-tabbed item list); it's now a
   * redirect here (next.config.ts) rather than a route of its own, so
   * there's exactly one place this ever points to.
   */
  collections: '/inspirations/collections',
  admin: '/inspirations/admin',
  app: (app: Pick<App, 'slug'>) => `/inspirations/app/${app.slug}`,
  screen: (screen: Pick<Screen, 'id'>) => `/inspirations/screen/${screen.id}`,
  flow: (flow: Pick<Flow, 'id'>) => `/inspirations/flow/${flow.id}`,
  pattern: (pattern: Pick<Pattern, 'slug'>) => `/inspirations/pattern/${pattern.slug}`,
  searchFor: (query: string, mode?: 'text') => `/inspirations/search?q=${encodeURIComponent(query)}${mode === 'text' ? '&mode=text' : ''}`,
  /** Hand-off into the existing Motvin icon library. */
  iconLibrary: (query: string) => `/icons?q=${encodeURIComponent(query)}`,
} as const;
