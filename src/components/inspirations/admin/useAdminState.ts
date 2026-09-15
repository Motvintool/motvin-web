'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi, type AdminState, type BuildReport } from '@/lib/inspirations/admin';

/**
 * The admin view's data, plus the build report from the last write.
 *
 * Every mutation rebuilds the manifest server-side, so `run` refreshes the
 * whole state afterwards: what the admin sees is always what the public API
 * would now serve, never an optimistic guess.
 */
export function useAdminState() {
  const [state, setState] = useState<AdminState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<BuildReport | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await adminApi.getState();
      setState(next);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // First load. State is set from the promise callbacks so nothing is written
  // synchronously while the effect runs.
  useEffect(() => {
    let cancelled = false;
    adminApi
      .getState()
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Runs one write, then reloads. Returns true when it succeeded, so callers
   * can clear their form only on success.
   */
  const run = useCallback(
    async (action: () => Promise<unknown>, onDone?: () => void) => {
      setBusy(true);
      setError(null);
      try {
        const result = (await action()) as { report?: BuildReport } | undefined;
        if (result?.report) setReport(result.report);
        await refresh();
        onDone?.();
        return true;
      } catch (err) {
        setError((err as Error).message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  return { state, loading, busy, error, report, refresh, run, setError, setReport };
}
