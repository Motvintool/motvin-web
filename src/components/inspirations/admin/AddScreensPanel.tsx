'use client';

import { useState } from 'react';
import { useAuth } from '@/components/shared/AuthProvider';
import type { AdminState } from '@/lib/inspirations/admin';
import { AiPicker } from './AiPicker';
import { UploadPanel } from './UploadPanel';
import { VideoPanel } from './VideoPanel';

/**
 * Both ways to add screens, in one place.
 *
 * These used to be separate top-level tabs, which read as two unrelated
 * features rather than two ways to do the same thing — admins routinely
 * looked for "upload" inside "Automatic" and vice versa. A toggle inside one
 * "Add screens" tab keeps the choice one click away instead of a whole tab
 * switch, while leaving both panels' own features exactly as they were.
 *
 * The one-line hint here is the only explanation of each mode: the panels
 * used to repeat it in their own paragraphs directly underneath, so every
 * mode opened on two near-identical descriptions before any control. The AI
 * picker lives on this row too, since it only concerns Automatic.
 */

type Mode = 'automatic' | 'manual';

export function AddScreensPanel({
  state,
  busy,
  run,
  onIngested,
  onUploaded,
}: {
  state: AdminState;
  busy: boolean;
  run: (action: () => Promise<unknown>, onDone?: () => void) => Promise<boolean>;
  onIngested: () => Promise<void> | void;
  onUploaded: () => Promise<void> | void;
}) {
  const [mode, setMode] = useState<Mode>('automatic');
  const { user } = useAuth();
  const admin = Boolean(user && !user.isAnonymous);

  return (
    <div className="ins-admin-panel">
      <div className="ins-admin-modeswitch">
        <div className="ins-segmented" role="radiogroup" aria-label="How to add screens">
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'automatic'}
            className={`ins-segmented-item ${mode === 'automatic' ? 'is-active' : ''}`}
            onClick={() => setMode('automatic')}
          >
            Automatic
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'manual'}
            className={`ins-segmented-item ${mode === 'manual' ? 'is-active' : ''}`}
            onClick={() => setMode('manual')}
          >
            Manual
          </button>
        </div>
        <p className="ins-field-hint">
          {mode === 'automatic'
            ? 'Drop a screen recording — screens, names, types and flows are worked out for you.'
            : 'Already have screenshots? Pick the app, set each one’s type, and upload.'}
        </p>
        {mode === 'automatic' && <AiPicker admin={admin} align="right" />}
      </div>

      {mode === 'automatic' ? (
        <VideoPanel state={state} busy={busy} onIngested={onIngested} />
      ) : (
        <UploadPanel state={state} busy={busy} onUploaded={onUploaded} run={run} />
      )}
    </div>
  );
}
