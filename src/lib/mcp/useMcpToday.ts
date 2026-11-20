'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/shared/AuthProvider';
import { getMyMcpUsage, listMcpConnections } from './connections';

/** A signed-in person's MCP state: no tool yet, or today's calls against the daily limit. */
export type McpToday = { connected: false } | { connected: true; used: number; limit: number };

// The header and the profile menu share one fetch, kept for a minute.
const FRESH_MS = 60_000;
let cached: { uid: string; at: number; value: Promise<McpToday | null> } | null = null;

function load(uid: string): Promise<McpToday | null> {
  if (cached && cached.uid === uid && Date.now() - cached.at < FRESH_MS) return cached.value;
  const value = listMcpConnections()
    .then(async (tools): Promise<McpToday> => {
      if (!tools.length) return { connected: false };
      const { today } = await getMyMcpUsage();
      return { connected: true, used: today.used, limit: today.limit };
    })
    .catch(() => null);
  cached = { uid, at: Date.now(), value };
  return value;
}

/**
 * The signed-in person's MCP state for the header; null for guests, while it
 * loads, or when it can't be read, so nothing shows. Refreshed when the window
 * comes back into focus.
 */
export function useMcpToday(): McpToday | null {
  const { user } = useAuth();
  const uid = user && !user.isAnonymous ? user.uid : null;
  const [today, setToday] = useState<{ uid: string; value: McpToday | null } | null>(null);

  useEffect(() => {
    if (!uid) return;
    let live = true;
    const refresh = () => void load(uid).then((value) => live && setToday({ uid, value }));
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      live = false;
      window.removeEventListener('focus', refresh);
    };
  }, [uid]);

  return uid && today?.uid === uid ? today.value : null;
}

/** "8 of 2,000 calls today", or "8 calls today" when there is no daily limit. */
export function mcpTodayLabel({ used, limit }: { used: number; limit: number }): string {
  return `${used.toLocaleString()}${limit ? ` of ${limit.toLocaleString()}` : ''} call${!limit && used === 1 ? '' : 's'} today`;
}
