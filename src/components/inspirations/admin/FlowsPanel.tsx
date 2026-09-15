'use client';

import { useState } from 'react';
import { adminApi, type AdminFlowRecord, type AdminState } from '@/lib/inspirations/admin';
import { FLOW_CATEGORY_LABEL, PLATFORM_LABEL, SCREEN_TYPE_LABEL } from '@/lib/inspirations/taxonomy';
import type { FlowCategory, Platform, ScreenType } from '@/lib/inspirations/types';
import { ChevronDownIcon, PlusIcon, TrashIcon } from '../Icons';

/**
 * Flows: an ordered list of stored screens from one app.
 *
 * Steps are chosen from screens that are actually published, because a flow
 * referencing an unpublished screen would silently lose that step when the
 * manifest is built.
 */

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
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
  const [platform, setPlatform] = useState<Platform>('web');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<FlowCategory>('onboarding');
  const [steps, setSteps] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const candidates = state.files.filter(
    (f) => f.appId === appId && f.platform === platform && f.published,
  );

  const reset = () => {
    setName('');
    setSteps([]);
    setEditingId(null);
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
    setPlatform(flow.platform);
    setName(flow.name);
    setCategory(flow.category as FlowCategory);
    setSteps(flow.screenIds);
  };

  const save = () => {
    const id = editingId ?? slugify(`${appId}-${platform}-${name}`);
    const record: AdminFlowRecord = { id, appId, name: name.trim(), category, platform, screenIds: steps };
    void run(() => adminApi.saveFlow(record), reset);
  };

  const remove = (flow: AdminFlowRecord) => {
    if (!window.confirm(`Delete the flow "${flow.name}"? The screens themselves are untouched.`)) return;
    void run(() => adminApi.deleteFlow(flow.id));
  };

  const valid = appId && name.trim().length > 0 && steps.length >= 2;

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
            <select
              className="ins-input"
              value={appId}
              onChange={(e) => {
                setAppId(e.target.value);
                setSteps([]);
              }}
              disabled={Boolean(editingId)}
            >
              {state.apps.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.name}
                </option>
              ))}
            </select>
          </label>

          <label className="ins-field">
            <span className="ins-field-label">Platform</span>
            <select
              className="ins-input"
              value={platform}
              onChange={(e) => {
                setPlatform(e.target.value as Platform);
                setSteps([]);
              }}
              disabled={Boolean(editingId)}
            >
              {(['web', 'ios', 'android'] as Platform[]).map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_LABEL[p]}
                </option>
              ))}
            </select>
          </label>

          <label className="ins-field">
            <span className="ins-field-label">Flow name</span>
            <input className="ins-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="First run" required />
          </label>

          <label className="ins-field">
            <span className="ins-field-label">Category</span>
            <select className="ins-input" value={category} onChange={(e) => setCategory(e.target.value as FlowCategory)}>
              {state.vocabulary.flowCategories.map((c) => (
                <option key={c} value={c}>
                  {FLOW_CATEGORY_LABEL[c as FlowCategory] ?? c}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="ins-field">
          <span className="ins-field-label">Steps, in order</span>
          {candidates.length === 0 ? (
            <p className="ins-muted">
              No published screens for this app on {PLATFORM_LABEL[platform]}. Upload and approve some first.
            </p>
          ) : (
            <div className="ins-admin-steps">
              <div className="ins-admin-step-pool">
                {candidates.map((file) => {
                  const on = steps.includes(file.id);
                  const order = steps.indexOf(file.id) + 1;
                  return (
                    <button
                      key={file.id}
                      type="button"
                      className={`ins-chip ins-chip--sm ${on ? 'is-active' : ''}`}
                      aria-pressed={on}
                      onClick={() => toggleStep(file.id)}
                    >
                      {on && <span className="ins-admin-step-num">{order}</span>}
                      {file.sidecar?.name ||
                        SCREEN_TYPE_LABEL[(file.sidecar?.screenType as ScreenType) ?? 'other'] ||
                        file.file}
                    </button>
                  );
                })}
              </div>

              {steps.length > 0 && (
                <ol className="ins-admin-step-list">
                  {steps.map((id, i) => {
                    const file = state.files.find((f) => f.id === id);
                    return (
                      <li key={id} className="ins-admin-step-row">
                        <span className="ins-admin-step-num">{String(i + 1).padStart(2, '0')}</span>
                        <span className="ins-admin-step-name">{file?.sidecar?.name || file?.file || id}</span>
                        <button
                          type="button"
                          className="ins-iconbtn ins-iconbtn--plain"
                          aria-label="Move earlier"
                          disabled={i === 0}
                          onClick={() => move(i, -1)}
                        >
                          <ChevronDownIcon size={13} style={{ transform: 'rotate(180deg)' }} />
                        </button>
                        <button
                          type="button"
                          className="ins-iconbtn ins-iconbtn--plain"
                          aria-label="Move later"
                          disabled={i === steps.length - 1}
                          onClick={() => move(i, 1)}
                        >
                          <ChevronDownIcon size={13} />
                        </button>
                        <button
                          type="button"
                          className="ins-iconbtn ins-iconbtn--plain"
                          aria-label="Remove step"
                          onClick={() => toggleStep(id)}
                        >
                          <TrashIcon size={13} />
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          )}
          <span className="ins-field-hint">A flow needs at least two screens.</span>
        </div>

        <div className="ins-admin-actions">
          <button type="submit" className="ins-btn ins-btn--primary" disabled={!valid || busy}>
            <PlusIcon size={15} /> {editingId ? 'Save flow' : 'Create flow'}
          </button>
          {editingId && (
            <button type="button" className="ins-btn ins-btn--ghost" onClick={reset} disabled={busy}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="ins-admin-list">
        {state.flows.length === 0 && <p className="ins-muted">No flows yet.</p>}
        {state.flows.map((flow) => (
          <div key={flow.id} className="ins-admin-item">
            <div className="ins-admin-item-head">
              <div className="ins-admin-item-text">
                <p className="ins-admin-item-title">
                  {flow.name}
                  <span className="ins-admin-item-id">{flow.id}</span>
                </p>
                <p className="ins-admin-item-sub">
                  {state.apps.find((a) => a.id === flow.appId)?.name ?? flow.appId} ·{' '}
                  {PLATFORM_LABEL[flow.platform] ?? flow.platform} ·{' '}
                  {FLOW_CATEGORY_LABEL[flow.category as FlowCategory] ?? flow.category} · {flow.screenIds.length} steps
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
