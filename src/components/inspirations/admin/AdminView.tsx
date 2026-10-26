'use client';

import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/inspirations/admin';
import { PageHeading } from '../PageHeading';
import { CloseIcon, LayersIcon } from '../Icons';
import { AddScreensPanel } from './AddScreensPanel';
import { AppsPanel } from './AppsPanel';
import { BatchPanel } from './BatchPanel';
import { hasRecordings, onRecordings } from './recordingHandoff';
import { FlowsPanel } from './FlowsPanel';
import { RequestsPanel } from './RequestsPanel';
import { ScreensPanel } from './ScreensPanel';
import { SettingsPanel } from './SettingsPanel';
import { useAdminState } from './useAdminState';

/**
 * /inspirations/admin — the library's back office.
 *
 * Writes go to data/inspirations in motvin-backend through the admin API. The
 * manifest is rebuilt after every change, and the build report is shown here,
 * so it is always clear what actually became public.
 *
 * Four sections, each answering one question: Add screens (how do new ones
 * get in), Screens (what is stored, published or not), Apps (the products
 * they belong to, including their version history), Flows (the journeys
 * built from them). Manual Upload takes screenshots (AddScreensPanel);
 * recordings go through Agent Upload.
 */

type Tab = 'add' | 'batch' | 'screens' | 'apps' | 'flows' | 'requests' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'add', label: 'Manual Upload' },
  { id: 'batch', label: 'Agent Upload' },
  { id: 'screens', label: 'Screens' },
  { id: 'apps', label: 'Apps' },
  { id: 'flows', label: 'Flows' },
  { id: 'requests', label: 'Requests' },
  { id: 'settings', label: 'Settings' },
];

export function AdminView() {
  // Opened for a recording dropped on the Motvin agent: straight to Agent Upload, where it waits.
  const [tab, setTab] = useState<Tab>(() => (hasRecordings() ? 'batch' : 'add'));
  useEffect(() => onRecordings(() => setTab('batch')), []);
  const { state, loading, busy, error, report, refresh, run, setError } = useAdminState();

  const held = state?.files.filter((f) => !f.published).length ?? 0;

  return (
    <>
      <PageHeading
        title="Library admin"
        actions={
          <button
            type="button"
            className="ins-btn"
            disabled={busy || loading}
            title="Every change above already rebuilds automatically. Use this only after editing files or running the crawler CLI directly on disk, outside this page."
            onClick={() => void run(async () => ({ report: await adminApi.rebuild() }))}
          >
            <LayersIcon size={15} /> Rebuild manifest
          </button>
        }
      />

      {state && (
        <div className="ins-admin-summary">
          {(
            [
              ['screens', 'Published screens'],
              ['apps', 'Apps'],
              ['flows', 'Flows'],
              ['patterns', 'Patterns'],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="ins-admin-stat">
              <span className="ins-admin-stat-num">{state.counts[key] ?? 0}</span>
              <span className="ins-admin-stat-label">{label}</span>
            </div>
          ))}
          {held > 0 && (
            <button type="button" className="ins-admin-stat ins-admin-stat--held" onClick={() => setTab('screens')}>
              <span className="ins-admin-stat-num">{held}</span>
              <span className="ins-admin-stat-label">Held back</span>
            </button>
          )}
          {state.generatedAt && (
            <span className="ins-admin-built">Built {new Date(state.generatedAt).toLocaleString()}</span>
          )}
        </div>
      )}

      {error && (
        <div className="ins-admin-banner is-error" role="alert">
          <span>{error}</span>
          <button type="button" className="ins-iconbtn ins-iconbtn--plain" aria-label="Dismiss" onClick={() => setError(null)}>
            <CloseIcon size={14} />
          </button>
        </div>
      )}

      {report && (report.problems.length > 0 || report.skipped.length > 0 || report.warnings.length > 0) && (
        <div className="ins-admin-banner" role="status">
          <div>
            {report.problems.map((p) => (
              <p key={p} className="ins-admin-err">{p}</p>
            ))}
            {report.skipped.map((s) => (
              <p key={`${s.platform}/${s.appId}`} className="ins-admin-warn">
                {s.count} file{s.count === 1 ? '' : 's'} in {s.platform}/{s.appId} not published: {s.reason}
              </p>
            ))}
            {report.warnings.map((w) => (
              <p key={w} className="ins-admin-warn">{w}</p>
            ))}
          </div>
        </div>
      )}

      <div className="ins-tabbar" role="tablist" aria-label="Admin sections">
        {TABS.map((t) => {
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`ins-tab ${tab === t.id ? 'is-active' : ''}`}
              onClick={(e) => {
                setTab(t.id);
                // On a phone the tab row scrolls sideways; keep the picked tab in view.
                e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
              }}
            >
              {t.label}
              {t.id === 'screens' && held > 0 && <span className="ins-tab-count">{held}</span>}
            </button>
          );
        })}
      </div>

      {loading || !state ? (
        <p className="ins-muted ins-admin-status">Loading the store…</p>
      ) : (
        <section className="ins-tabpanel" role="tabpanel">
          {tab === 'add' && <AddScreensPanel state={state} busy={busy} run={run} onUploaded={refresh} />}
          {tab === 'batch' && <BatchPanel state={state} onChanged={refresh} />}
          {tab === 'screens' && <ScreensPanel state={state} busy={busy} run={run} />}
          {tab === 'apps' && <AppsPanel state={state} busy={busy} run={run} />}
          {tab === 'flows' && <FlowsPanel state={state} busy={busy} run={run} />}
          {tab === 'requests' && <RequestsPanel />}
          {tab === 'settings' && <SettingsPanel state={state} busy={busy} run={run} />}
        </section>
      )}
    </>
  );
}
