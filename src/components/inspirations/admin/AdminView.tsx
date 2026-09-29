'use client';

import { useState, type ReactElement } from 'react';
import { adminApi } from '@/lib/inspirations/admin';
import { PageHeading } from '../PageHeading';
import { CloseIcon, FlowIcon, FolderIcon, ImageIcon, LayersIcon, UploadIcon } from '../Icons';
import { AddScreensPanel } from './AddScreensPanel';
import { AppsPanel } from './AppsPanel';
import { FlowsPanel } from './FlowsPanel';
import { ScreensPanel } from './ScreensPanel';
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
 * built from them). Adding screens used to be two separate tabs — Manual and
 * Automatic — which read as unrelated features rather than two ways to do
 * the same thing; they are now one tab with a switch, in AddScreensPanel.
 */

type Tab = 'add' | 'screens' | 'apps' | 'flows';

const TABS: { id: Tab; label: string; icon: (props: { size?: number }) => ReactElement }[] = [
  { id: 'add', label: 'Add screens', icon: UploadIcon },
  { id: 'screens', label: 'Screens', icon: ImageIcon },
  { id: 'apps', label: 'Apps', icon: FolderIcon },
  { id: 'flows', label: 'Flows', icon: FlowIcon },
];

export function AdminView() {
  const [tab, setTab] = useState<Tab>('add');
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
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`ins-tab ${tab === t.id ? 'is-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <Icon size={15} />
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
          {tab === 'add' && <AddScreensPanel state={state} busy={busy} run={run} onIngested={refresh} onUploaded={refresh} />}
          {tab === 'screens' && <ScreensPanel state={state} busy={busy} run={run} />}
          {tab === 'apps' && <AppsPanel state={state} busy={busy} run={run} />}
          {tab === 'flows' && <FlowsPanel state={state} busy={busy} run={run} />}
        </section>
      )}
    </>
  );
}
