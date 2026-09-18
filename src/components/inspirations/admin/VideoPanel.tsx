'use client';

import { useRef, useState, type DragEvent } from 'react';
import { adminApi } from '@/lib/inspirations/admin';
import { getIdToken } from '@/lib/firebase/auth';
import { CheckIcon, UploadIcon } from '../Icons';

/**
 * Turn a screen recording into screens. One action, no form.
 *
 * Walking an app with the recorder on captures everything, including the
 * screens nobody would think to screenshot — but most frames are worthless,
 * caught mid-animation or mid-scroll. The server keeps a frame only where the
 * UI held still, so a three-minute video becomes twenty-odd real screens.
 *
 * Which app it is, what each screen is called, its type, tags and the flows
 * they form are all worked out from the screens themselves. The only thing
 * that cannot be: the app's logo, which never appears in its own UI. So that is
 * the one manual step, offered after the screens land.
 */

type Screen = {
  screenId: string;
  file: string;
  flow: string | null;
  position: number | null;
  screenType: string;
  publishedType: string;
};

type Flow = { id: string; name: string; category: string; screenIds: string[] };

type Result = {
  ingested: number;
  duplicates: number;
  /** True only when a model analysed the screens; false for the on-device path. */
  classified: boolean;
  backend: string;
  grouped: boolean;
  app: { id: string; name: string; industry: string };
  identified: { confident: boolean; detected: boolean } | null;
  flows: Flow[];
  screens: Screen[];
};

function extensionOf(file: File): string {
  const dot = file.name.lastIndexOf('.');
  return dot > 0 ? file.name.slice(dot + 1).toLowerCase() : 'mov';
}

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

export function VideoPanel({ busy, onIngested }: { busy: boolean; onIngested: () => Promise<void> | void }) {
  const [video, setVideo] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [logoState, setLogoState] = useState<'idle' | 'saving' | 'done'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  const pick = (files: FileList | File[]) => {
    const found = Array.from(files).find(
      (file) => file.type.startsWith('video/') || /\.(mov|mp4|m4v|avi|mkv)$/i.test(file.name),
    );
    if (!found) {
      setError('That is not a video. Use a screen recording — .mov or .mp4.');
      return;
    }
    setError(null);
    setResult(null);
    setVideo(found);
  };

  const submit = async () => {
    if (!video) return;
    setWorking(true);
    setError(null);
    setResult(null);
    setLogoState('idle');

    try {
      const token = await getIdToken();
      if (!token) throw new Error('You are signed out. Sign in again to continue.');

      // The file name travels too: it is what the app is named after if nothing
      // can identify it from the screens.
      const query = new URLSearchParams({ ext: extensionOf(video), name: video.name });

      const res = await fetch(`/api/crawler/ingest?${query}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': video.type || 'video/quicktime' },
        body: video,
      });

      const payload = (await res.json()) as { success: boolean; data?: Result; message?: string };
      if (!res.ok || !payload.success) throw new Error(payload.message || `Request failed (${res.status})`);

      setResult(payload.data ?? null);
      setVideo(null);
      await onIngested();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const uploadLogo = async (file: File) => {
    if (!result) return;
    setLogoState('saving');
    try {
      await adminApi.uploadLogo(result.app.id, file.name, file);
      setLogoState('done');
      await onIngested();
    } catch (err) {
      setError((err as Error).message);
      setLogoState('idle');
    }
  };

  return (
    <div className="ins-admin-panel">
      <p className="ins-field-hint">
        Record yourself using the app on a real device, then drop the video here. Pause about a
        second on each screen — that pause is what tells the tool a screen is worth keeping.
        Everything else, including which app it is, is worked out from the screens.
      </p>

      <div
        className={`ins-dropzone ${dragging ? 'is-dragging' : ''}`}
        onDragOver={(e: DragEvent) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e: DragEvent) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) pick(e.dataTransfer.files);
        }}
      >
        <UploadIcon size={22} className="ins-dropzone-icon" />
        <div className="ins-dropzone-text">
          <p className="ins-dropzone-title">{video ? video.name : 'Drop a screen recording here'}</p>
          <p className="ins-dropzone-desc">
            {video ? megabytes(video.size) : 'MOV or MP4, straight from the iPhone recorder.'}
          </p>
        </div>
        <button type="button" className="ins-btn" onClick={() => inputRef.current?.click()} disabled={working}>
          {video ? 'Choose a different video' : 'Choose a video'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="video/*,.mov,.mp4,.m4v"
          hidden
          onChange={(e) => {
            if (e.target.files?.length) pick(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      <div className="ins-admin-actions">
        <button
          type="button"
          className="ins-btn ins-btn--primary"
          disabled={!video || working || busy}
          onClick={() => void submit()}
        >
          {working ? <span className="ins-spinner" /> : <UploadIcon size={15} />}
          {working ? 'Finding screens…' : 'Find screens in this video'}
        </button>
        {working && <span className="ins-muted">This takes a few minutes. Keep the tab open.</span>}
      </div>

      {error && <p className="ins-admin-err">{error}</p>}

      {result && (
        <div className="ins-admin-inline-form">
          <p className="ins-admin-form-title">
            <CheckIcon size={14} /> {result.app.name} — {result.ingested} screen
            {result.ingested === 1 ? '' : 's'}
          </p>
          <p className="ins-field-hint">
            {result.duplicates} repeated screen{result.duplicates === 1 ? '' : 's'} dropped ·{' '}
            {result.flows.length} flow{result.flows.length === 1 ? '' : 's'} built · live in the gallery now
          </p>

          {result.identified && !result.identified.confident && (
            <p className="ins-admin-note">
              The app name is a best guess. Rename it under <strong>Apps</strong> if it is wrong —
              that also renames its folder.
            </p>
          )}

          {!result.classified && (
            <p className="ins-admin-note">
              Screen types and flow names came from on-device text recognition, not a model — so
              there are no descriptions and an image-heavy screen may read as “other”. Set{' '}
              <code>ANTHROPIC_API_KEY</code> in <code>.env.local</code> for full analysis.
            </p>
          )}

          {/* Grouped by journey, in the order they were walked — the same
              reading as a flow in the gallery. */}
          {result.flows.length > 0
            ? result.flows.map((flow) => (
                <div key={flow.id} className="ins-admin-flowgroup">
                  <p className="ins-admin-form-title">
                    {flow.name}
                    <span className="ins-muted">
                      {' '}
                      · {flow.screenIds.length} screen{flow.screenIds.length === 1 ? '' : 's'} · {flow.category}
                    </span>
                  </p>
                  <div className="ins-admin-queue">
                    {flow.screenIds.map((screenId, index) => {
                      const screen = result.screens.find((entry) => entry.screenId === screenId);
                      return (
                        <div key={screenId} className="ins-admin-queue-row is-done">
                          <div className="ins-admin-queue-fields">
                            <span>
                              {index + 1}. {screen?.screenType.replace(/_/g, ' ') ?? screenId}
                            </span>
                            <span className="ins-muted">{screen?.file ?? ''}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            : (
              <div className="ins-admin-queue">
                {result.screens.map((screen) => (
                  <div key={screen.screenId} className="ins-admin-queue-row is-done">
                    <div className="ins-admin-queue-fields">
                      <span>{screen.file}</span>
                      <span className="ins-muted">{screen.screenType.replace(/_/g, ' ')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

          {/* A logo never appears inside an app's own screens, so it is the one
              thing the pipeline cannot work out for itself. */}
          <div className="ins-admin-actions">
            {logoState === 'done' ? (
              <span className="ins-admin-ok">
                <CheckIcon size={13} /> Logo saved
              </span>
            ) : (
              <button
                type="button"
                className="ins-btn"
                disabled={logoState === 'saving'}
                onClick={() => logoRef.current?.click()}
              >
                {logoState === 'saving' ? <span className="ins-spinner" /> : <UploadIcon size={15} />}
                Add {result.app.name}&rsquo;s logo
              </button>
            )}
            <span className="ins-muted">Optional. PNG, SVG or WebP.</span>
            <input
              ref={logoRef}
              type="file"
              accept="image/*,.svg"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void uploadLogo(file);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
