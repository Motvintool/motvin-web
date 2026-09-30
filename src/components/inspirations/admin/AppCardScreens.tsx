'use client';

import { useState } from 'react';
import { adminApi, type AdminAppRecord, type AdminScreenFile } from '@/lib/inspirations/admin';
import { MAX_CARD_SCREENS } from '@/lib/inspirations/cover';
import { PLATFORM_LABEL } from '@/lib/inspirations/taxonomy';
import type { Platform } from '@/lib/inspirations/types';
import { CloseIcon } from '../Icons';
import { screenLabel, thumbUrl } from './screenFiles';

/**
 * Picks the screens an app's card cycles through on the Apps page — up to
 * MAX_CARD_SCREENS, in order. The first is the card's cover; the rest are
 * what hovering flips through (see AppCard / useSiblingCycle).
 *
 * Built like the flow builder on purpose: the same strip of ordered steps
 * above, the same pool of tiles below, so picking a carousel feels like
 * picking a flow. With nothing picked the card falls back to choosing for
 * itself (coverScreen: the home screen first, then whatever its siblings
 * happen to be), which is what every app does until someone comes here.
 */
export function AppCardScreens({
  app,
  files,
  busy,
  run,
}: {
  app: AdminAppRecord;
  files: AdminScreenFile[];
  busy: boolean;
  run: (action: () => Promise<unknown>, onDone?: () => void) => Promise<boolean>;
}) {
  const saved = app.cardScreens ?? [];
  const [picked, setPicked] = useState<string[]>(saved);

  const published = files.filter((f) => f.published);
  const platforms = Array.from(new Set(published.map((f) => f.platform)));
  const [platform, setPlatform] = useState<Platform>((platforms[0] as Platform) ?? 'ios');
  // Narrows the pool to one dated capture; '' is every version at once. The
  // newest is the default because that is what the card should look like.
  const versions = app.versions ?? [];
  const [version, setVersion] = useState<string>(app.currentVersion ?? versions[0]?.id ?? '');

  const byId = new Map(files.map((f) => [f.id, f]));
  // Kept in the admin state's order, which is the public app page's order —
  // the pool reads like /inspirations/app/<id> does, splash to checkout.
  const pool = published.filter((f) => f.platform === platform && (!version || f.version === version));

  const full = picked.length >= MAX_CARD_SCREENS;
  const dirty = picked.join('\n') !== saved.join('\n');

  if (published.length === 0) {
    return <p className="ins-muted ins-admin-status">No published screens for {app.name} yet — the card has nothing to show.</p>;
  }

  const toggle = (id: string) => {
    setPicked((s) => (s.includes(id) ? s.filter((v) => v !== id) : full ? s : [...s, id]));
  };

  const move = (index: number, delta: number) => {
    setPicked((s) => {
      const next = [...s];
      const target = index + delta;
      if (target < 0 || target >= next.length) return s;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const save = () => {
    void run(() => adminApi.saveApp({ ...app, cardScreens: picked }));
  };

  return (
    <div className="ins-admin-versions-manager ins-admin-cardpick">
      <p className="ins-admin-form-title">{app.name}&rsquo;s card carousel</p>
      <p className="ins-field-hint">
        Pick up to {MAX_CARD_SCREENS} screens, in order. The first is the card&rsquo;s cover on the Apps page; the
        rest are what hovering the card flips through. Leave it empty and the card picks for itself — the home
        screen first, then the app&rsquo;s other screens.
      </p>

      <div className="ins-field">
        <span className="ins-field-label">
          Carousel, in order{' '}
          <span className="ins-field-hint">
            ({picked.length} of {MAX_CARD_SCREENS} picked{picked.length === 0 ? ' — automatic' : ''})
          </span>
        </span>

        {picked.length > 0 && (
          <ol className="ins-flowbuild-strip">
            {picked.map((id, i) => {
              const file = byId.get(id);
              const url = file ? thumbUrl(file) : null;
              const label = file ? screenLabel(file) : id;
              return (
                <li key={id} className="ins-flowbuild-step">
                  <span className="ins-flowbuild-num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="ins-flowbuild-shot">
                    {url ? <img src={url} alt="" loading="lazy" /> : <span className="ins-flowbuild-noshot" />}
                  </span>
                  <span className="ins-flowbuild-name">{label}</span>
                  <span className="ins-flowbuild-controls">
                    <button
                      type="button"
                      className="ins-iconbtn ins-iconbtn--plain"
                      aria-label={`Move ${label} earlier`}
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      className="ins-iconbtn ins-iconbtn--plain"
                      aria-label={`Move ${label} later`}
                      disabled={i === picked.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      →
                    </button>
                    <button
                      type="button"
                      className="ins-iconbtn ins-iconbtn--plain"
                      aria-label={`Remove ${label} from the carousel`}
                      onClick={() => toggle(id)}
                    >
                      <CloseIcon size={13} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="ins-admin-actions ins-admin-actions--tight">
        {platforms.length > 1 && (
          <div className="ins-segmented" role="radiogroup" aria-label="Platform">
            {platforms.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={platform === p}
                className={`ins-segmented-item ${platform === p ? 'is-active' : ''}`}
                onClick={() => setPlatform(p as Platform)}
              >
                {PLATFORM_LABEL[p as Platform] ?? p}
              </button>
            ))}
          </div>
        )}
        {versions.length > 1 && (
          <div className="ins-admin-versions-tabs" role="tablist" aria-label="Version">
            {versions.map((v) => (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={version === v.id}
                className={`ins-chip ins-chip--sm ${version === v.id ? 'is-active' : ''}`}
                onClick={() => setVersion(v.id)}
              >
                {v.isLatest ? 'Latest' : v.label}
              </button>
            ))}
            <button
              type="button"
              role="tab"
              aria-selected={version === ''}
              className={`ins-chip ins-chip--sm ${version === '' ? 'is-active' : ''}`}
              onClick={() => setVersion('')}
            >
              All versions
            </button>
          </div>
        )}
      </div>

      <p className="ins-field-hint">
        {pool.length} screen{pool.length === 1 ? '' : 's'} available. Click to add or remove
        {full ? ` — the carousel is full, remove one to swap it.` : '.'}
      </p>

      <div className="ins-flowbuild-pool">
        {pool.map((file) => {
          const order = picked.indexOf(file.id) + 1;
          const url = thumbUrl(file);
          return (
            <button
              key={file.id}
              type="button"
              className={`ins-flowbuild-tile ${order > 0 ? 'is-selected' : ''}`}
              aria-pressed={order > 0}
              disabled={busy || (full && order === 0)}
              onClick={() => toggle(file.id)}
              title={file.file}
            >
              <span className="ins-flowbuild-tile-shot">
                {url ? <img src={url} alt="" loading="lazy" /> : <span className="ins-flowbuild-noshot" />}
                {order > 0 && <span className="ins-flowbuild-badge">{order}</span>}
              </span>
              <span className="ins-flowbuild-tile-name">{screenLabel(file)}</span>
            </button>
          );
        })}
        {pool.length === 0 && <p className="ins-muted">No published screens match this platform and version.</p>}
      </div>

      <div className="ins-admin-actions">
        <button type="button" className="ins-btn ins-btn--primary ins-btn--sm" disabled={!dirty || busy} onClick={save}>
          Save carousel
        </button>
        {picked.length > 0 && (
          <button type="button" className="ins-btn ins-btn--ghost ins-btn--sm" disabled={busy} onClick={() => setPicked([])}>
            Clear — back to automatic
          </button>
        )}
        {dirty && (
          <button type="button" className="ins-linkbtn" disabled={busy} onClick={() => setPicked(saved)}>
            Undo changes
          </button>
        )}
      </div>
    </div>
  );
}
