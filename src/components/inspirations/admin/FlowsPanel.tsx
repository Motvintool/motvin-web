'use client';

import { useId, useState } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import { adminApi, type AdminFlowRecord, type AdminScreenFile, type AdminState } from '@/lib/inspirations/admin';
import { PLATFORM_LABEL, SCREEN_TYPE_LABEL } from '@/lib/inspirations/taxonomy';
import type { Platform, ScreenType } from '@/lib/inspirations/types';
import { CloseIcon, PlusIcon, TrashIcon } from '../Icons';

/**
 * Flow builder.
 *
 * A flow is an ordered walk through one app on one platform, so the picker is
 * scoped that way. Two things follow from that and both used to bite:
 *
 *   - The platform starts on whichever one this app actually has screens for,
 *     instead of defaulting to web and showing an empty picker.
 *   - Screens the builder could not publish are still listed, greyed out
 *     with the reason, rather than silently missing. "Where did my screens go"
 *     is a worse failure than "here they are, and here is why you cannot use
 *     them yet".
 *
 * Steps are picked from thumbnails and reordered in place, so the strip you
 * build reads like the flow a visitor will step through.
 */

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}

function screenLabel(file: AdminScreenFile): string {
  const sidecar = file.sidecar ?? {};
  if (sidecar.name) return sidecar.name;
  if (sidecar.screenType) return SCREEN_TYPE_LABEL[sidecar.screenType as ScreenType] ?? sidecar.screenType;
  return file.file.replace(/\.[^.]+$/, '');
}

function thumbUrl(file: AdminScreenFile): string | null {
  if (!file.published) return null;
  return inspirationsApi.mediaUrl(
    `/api/inspirations/screens/${file.platform}/${file.appId}/${file.file}`,
  );
}

export function FlowsPanel({
  state,
  busy,
  run,
}: {
  state: AdminState;
  busy: boolean;
  run: (action: () => Promise<unknown>, onDone?: () => void) => Promise<boolean>;
}) {
  const [appId, setAppId] = useState(state.apps[0]?.id ?? '');
  const [platformChoice, setPlatformChoice] = useState<Platform | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('onboarding');
  const [steps, setSteps] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const categoryListId = useId();

  const appFiles = state.files.filter((f) => f.appId === appId);

  // Counts per platform, so the picker shows what is there and defaults to the
  // platform this app has the most screens for, rather than always to web.
  const byPlatform = state.vocabulary.platforms.map((p) => {
    const files = appFiles.filter((f) => f.platform === p);
    return { platform: p, total: files.length, usable: files.filter((f) => f.published).length };
  });
  const busiest = [...byPlatform].sort((a, b) => b.usable - a.usable || b.total - a.total)[0];
  const platform: Platform =
    platformChoice ?? (busiest && busiest.total > 0 ? busiest.platform : state.vocabulary.platforms[0] ?? 'web');

  const candidates = appFiles.filter((f) => f.platform === platform);
  const usable = candidates.filter((f) => f.published);
  const held = candidates.filter((f) => !f.published);
  const byId = new Map(state.files.map((f) => [f.id, f]));

  const reset = () => {
    setName('');
    setSteps([]);
    setEditingId(null);
  };

  const pickApp = (id: string) => {
    setAppId(id);
    setPlatformChoice(null);
    setSteps([]);
  };

  const pickPlatform = (p: Platform) => {
    setPlatformChoice(p);
    setSteps([]);
  };

  const toggleStep = (id: string) => {
    setSteps((s) => (s.includes(id) ? s.filter((v) => v !== id) : [...s, id]));
  };

  const move = (index: number, delta: number) => {
    setSteps((s) => {
      const next = [...s];
      const target = index + delta;
      if (target < 0 || target >= next.length) return s;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const edit = (flow: AdminFlowRecord) => {
    setEditingId(flow.id);
    setAppId(flow.appId);
    setPlatformChoice(flow.platform);
    setName(flow.name);
    setCategory(flow.category);
    setSteps(flow.screenIds);
  };

  const save = () => {
    const id = editingId ?? slugify(`${appId}-${platform}-${name}`);
    void run(
      () =>
        adminApi.saveFlow({
          id,
          appId,
          name: name.trim(),
          category: category.trim(),
          platform,
          screenIds: steps,
        }),
      reset,
    );
  };

  const remove = (flow: AdminFlowRecord) => {
    if (!window.confirm(`Delete the flow "${flow.name}"? The screens themselves are untouched.`)) return;
    void run(() => adminApi.deleteFlow(flow.id));
  };

  const valid = appId && name.trim().length > 0 && category.trim().length > 0 && steps.length >= 2;

  if (state.apps.length === 0) {
    return <p className="ins-muted ins-admin-status">Add an app and publish some screens first.</p>;
  }

  return (
    <div className="ins-admin-panel">
      <form
        className="ins-admin-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save();
        }}
      >
        <p className="ins-admin-form-title">{editingId ? `Edit ${editingId}` : 'Build a flow'}</p>

        <div className="ins-admin-row">
          <label className="ins-field">
            <span className="ins-field-label">App</span>
            <select className="ins-input" value={appId} onChange={(e) => pickApp(e.target.value)} disabled={Boolean(editingId)}>
              {state.apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>

          <label className="ins-field ins-field--wide">
            <span className="ins-field-label">Flow name</span>
            <input
              className="ins-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sign up and first session"
              maxLength={80}
            />
            <span className="ins-field-hint">Anything you like. This is the title visitors see.</span>
          </label>

          <label className="ins-field">
            <span className="ins-field-label">Category</span>
            <input
              className="ins-input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              list={categoryListId}
              placeholder="onboarding"
              maxLength={40}
            />
            <datalist id={categoryListId}>
              {state.vocabulary.flowCategories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <span className="ins-field-hint">Pick a suggestion or type your own.</span>
          </label>
        </div>

        <fieldset className="ins-field">
          <legend className="ins-field-label">Platform</legend>
          <div className="ins-filter-options">
            {byPlatform.map((p) => (
              <button
                key={p.platform}
                type="button"
                className={`ins-chip ins-chip--sm ${platform === p.platform ? 'is-active' : ''}`}
                aria-pressed={platform === p.platform}
                onClick={() => pickPlatform(p.platform)}
                disabled={Boolean(editingId)}
              >
                {PLATFORM_LABEL[p.platform]}
                <span className="ins-chip-count">{p.total}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="ins-field">
          <span className="ins-field-label">
            Steps, in order {steps.length > 0 && <span className="ins-field-hint">({steps.length} selected)</span>}
          </span>

          {candidates.length === 0 ? (
            <p className="ins-muted">
              No screens stored for {state.apps.find((a) => a.id === appId)?.name} on{' '}
              {PLATFORM_LABEL[platform]}. Upload some on the Upload tab.
            </p>
          ) : (
            <>
              {steps.length > 0 && (
                <ol className="ins-flowbuild-strip">
                  {steps.map((id, i) => {
                    const file = byId.get(id);
                    const url = file ? thumbUrl(file) : null;
                    return (
                      <li key={id} className="ins-flowbuild-step">
                        <span className="ins-flowbuild-num">{String(i + 1).padStart(2, '0')}</span>
                        <span className="ins-flowbuild-shot">
                          {url ? <img src={url} alt="" loading="lazy" /> : <span className="ins-flowbuild-noshot" />}
                        </span>
                        <span className="ins-flowbuild-name">{file ? screenLabel(file) : id}</span>
                        <span className="ins-flowbuild-controls">
                          <button
                            type="button"
                            className="ins-iconbtn ins-iconbtn--plain"
                            aria-label={`Move ${file ? screenLabel(file) : id} earlier`}
                            disabled={i === 0}
                            onClick={() => move(i, -1)}
                          >
                            ←
                          </button>
                          <button
                            type="button"
                            className="ins-iconbtn ins-iconbtn--plain"
                            aria-label={`Move ${file ? screenLabel(file) : id} later`}
                            disabled={i === steps.length - 1}
                            onClick={() => move(i, 1)}
                          >
                            →
                          </button>
                          <button
                            type="button"
                            className="ins-iconbtn ins-iconbtn--plain"
                            aria-label={`Remove ${file ? screenLabel(file) : id}`}
                            onClick={() => toggleStep(id)}
                          >
                            <CloseIcon size={13} />
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}

              <p className="ins-field-hint">
                {usable.length} screen{usable.length === 1 ? '' : 's'} available. Click to add or remove.
              </p>

              <div className="ins-flowbuild-pool">
                {usable.map((file) => {
                  const order = steps.indexOf(file.id) + 1;
                  const url = thumbUrl(file);
                  return (
                    <button
                      key={file.id}
                      type="button"
                      className={`ins-flowbuild-tile ${order > 0 ? 'is-selected' : ''}`}
                      aria-pressed={order > 0}
                      onClick={() => toggleStep(file.id)}
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
              </div>

              {/* Held-back screens are shown rather than hidden: the reason they
                  cannot be used is the useful part. */}
              {held.length > 0 && (
                <div className="ins-flowbuild-held">
                  <p className="ins-admin-warn">
                    {held.length} more screen{held.length === 1 ? '' : 's'} on {PLATFORM_LABEL[platform]} cannot be
                    used in a flow yet:
                  </p>
                  <ul className="ins-flowbuild-heldlist">
                    {held.map((file) => (
                      <li key={file.id}>
                        <span className="ins-flowbuild-heldname">{screenLabel(file)}</span>
                        <span className="ins-muted">{file.blockedReason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          <span className="ins-field-hint">A flow needs at least two screens.</span>
        </div>

        <div className="ins-admin-actions">
          <button type="submit" className="ins-btn ins-btn--primary" disabled={!valid || busy}>
            <PlusIcon size={15} /> {editingId ? 'Save flow' : 'Create flow'}
          </button>
          {(editingId || steps.length > 0 || name) && (
            <button type="button" className="ins-btn ins-btn--ghost" onClick={reset} disabled={busy}>
              {editingId ? 'Cancel' : 'Clear'}
            </button>
          )}
        </div>
      </form>

      <div className="ins-admin-list">
        {state.flows.length === 0 && <p className="ins-muted">No flows yet.</p>}
        {state.flows.map((flow) => (
          <div key={flow.id} className="ins-admin-item">
            <div className="ins-admin-item-head">
              <div className="ins-flowbuild-mini" aria-hidden>
                {flow.screenIds.slice(0, 5).map((id) => {
                  const file = byId.get(id);
                  const url = file ? thumbUrl(file) : null;
                  return (
                    <span className="ins-flowbuild-mini-shot" key={id}>
                      {url ? <img src={url} alt="" loading="lazy" /> : <span className="ins-flowbuild-noshot" />}
                    </span>
                  );
                })}
              </div>
              <div className="ins-admin-item-text">
                <p className="ins-admin-item-title">
                  {flow.name}
                  <span className="ins-admin-item-id">{flow.id}</span>
                </p>
                <p className="ins-admin-item-sub">
                  {state.apps.find((a) => a.id === flow.appId)?.name ?? flow.appId} ·{' '}
                  {PLATFORM_LABEL[flow.platform] ?? flow.platform} · {flow.category} · {flow.screenIds.length} steps
                </p>
              </div>
              <div className="ins-admin-item-actions">
                <button type="button" className="ins-btn ins-btn--sm" onClick={() => edit(flow)} disabled={busy}>
                  Edit
                </button>
                <button
                  type="button"
                  className="ins-iconbtn ins-iconbtn--plain"
                  aria-label={`Delete ${flow.name}`}
                  onClick={() => remove(flow)}
                  disabled={busy}
                >
                  <TrashIcon size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
