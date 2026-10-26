'use client';

import type { AdminState } from '@/lib/inspirations/admin';
import { UploadPanel } from './UploadPanel';

/**
 * Adding screenshots you already have to an app's version.
 *
 * Recordings go through "Agent Upload" only: an upload there replaces a version
 * of the same day, where an upload here would add into it and mix the old
 * screens with the new ones.
 */
export function AddScreensPanel({
  state,
  busy,
  run,
  onUploaded,
}: {
  state: AdminState;
  busy: boolean;
  run: (action: () => Promise<unknown>, onDone?: () => void) => Promise<boolean>;
  onUploaded: () => Promise<void> | void;
}) {
  return (
    <div className="ins-admin-panel">
      <p className="ins-field-hint">From screenshots you already have. Pick the app, set each one’s type, and upload. For a recording, use Agent Upload.</p>
      <UploadPanel state={state} busy={busy} onUploaded={onUploaded} run={run} />
    </div>
  );
}
