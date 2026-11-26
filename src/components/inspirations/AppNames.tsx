'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useApps } from './useApps';

/**
 * App names by app id, for screenshot labels (screenLabel): one list for every screenshot under it, instead of
 * each asking for the app list itself. The library shell gives the whole list once it has loaded; an app page adds
 * its own app's name, which it already has, so its screenshots are labelled in the server's HTML too.
 */
const AppNamesContext = createContext<ReadonlyMap<string, string>>(new Map());

/** Every app's name, from the app list (empty until it loads). For the library shell. */
export function AllAppNames({ children }: { children: ReactNode }) {
  const apps = useApps();
  const names = useMemo(() => new Map([...apps.values()].map((app) => [app.id, app.name])), [apps]);
  return <AppNamesContext value={names}>{children}</AppNamesContext>;
}

/** These apps' names on top of the list above: an app page's own app, known before the list loads. */
export function KnownAppNames({ apps, children }: { apps: { id: string; name: string }[]; children: ReactNode }) {
  const parent = useContext(AppNamesContext);
  const names = useMemo(() => new Map([...parent, ...apps.map((app): [string, string] => [app.id, app.name])]), [parent, apps]);
  return <AppNamesContext value={names}>{children}</AppNamesContext>;
}

/** The name of the app this id is, or undefined while unknown. */
export function useAppName(appId: string | null | undefined): string | undefined {
  return useContext(AppNamesContext).get(appId ?? '');
}
