'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * A library page's first answers, fetched by the server (lib/inspirations/seeds.ts) and handed to the page's data
 * hooks as their starting value — so the page's HTML already holds its screens, apps and flows for search engines
 * and for the first paint, instead of an empty grid that fills in after load. Keyed like useAsync. A hook still
 * asks the API after the page loads, and the fresh answer replaces the seed.
 */
const SeedContext = createContext<Readonly<Record<string, unknown>>>({});

export function SeedProvider({ seeds, children }: { seeds: Readonly<Record<string, unknown>>; children: ReactNode }) {
  return <SeedContext value={seeds}>{children}</SeedContext>;
}

/** This key's seed, or undefined when the page has none for it. */
export function useSeed<T>(key: string): T | undefined {
  const seeds = useContext(SeedContext);
  return Object.hasOwn(seeds, key) ? (seeds[key] as T) : undefined;
}
