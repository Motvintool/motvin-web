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
  collections: '/inspirations/collections',
  saved: '/inspirations/saved',
  app: (app: Pick<App, 'slug'>) => `/inspirations/app/${app.slug}`,
  screen: (screen: Pick<Screen, 'id'>) => `/inspirations/screen/${screen.id}`,
  flow: (flow: Pick<Flow, 'id'>) => `/inspirations/flow/${flow.id}`,
  pattern: (pattern: Pick<Pattern, 'slug'>) => `/inspirations/pattern/${pattern.slug}`,
  searchFor: (query: string) => `/inspirations/search?q=${encodeURIComponent(query)}`,
  /** Hand-off into the existing Motvin icon library. */
  iconLibrary: (query: string) => `/icons?q=${encodeURIComponent(query)}`,
} as const;
