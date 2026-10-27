'use client';

import { useEffect, useState } from 'react';
import { CloseIcon } from '../Icons';
import { AddScreensPanel } from './AddScreensPanel';
import { AnalyticsPanel } from './AnalyticsPanel';
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

type Tab = 'analytics' | 'add' | 'batch' | 'screens' | 'apps' | 'flows' | 'requests' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'analytics', label: 'Analytics' },
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
  const [tab, setTab] = useState<Tab>(() => (hasRecordings() ? 'batch' : 'analytics'));
  useEffect(() => onRecordings(() => setTab('batch')), []);
  const { state, loading, busy, error, report, refresh, run, setError } = useAdminState();

  const held = state?.files.filter((f) => !f.published).length ?? 0;

  // Still loading: the header and the four dots only — no menu or section title yet.
  if (loading || !state) {
    return (
      <>
        <div className="ins-admin-topbar">
          <span className="ins-admin-topbar-title">Library admin</span>
        </div>
        <div className="ins-admin-loading" role="status" aria-label="Loading the store">
          <span className="ins-admin-loading-dots" aria-hidden><i /><i /><i /><i /></span>
        </div>
      </>
    );
  }

  return (
    <>
      {/* The popup's header: which page this is. */}
      <div className="ins-admin-topbar">
        <span className="ins-admin-topbar-title">Library admin</span>
      </div>
      <div className="ins-admin-shell">
      {/* Settings-style: the sections as a side tree; on a narrow screen, a pill switch above the content. */}
      <aside className="ins-admin-side">
        <nav className="ins-admin-tree" aria-label="Admin sections">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={`ins-admin-tree-item ${tab === t.id ? 'is-active' : ''}`} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
              {t.label}
              {t.id === 'screens' && held > 0 && <span className="ins-admin-tree-count">{held}</span>}
            </button>
          ))}
        </nav>
      </aside>

      <div className="ins-admin-content">
      <h1 className="ins-admin-content-title">{TABS.find((t) => t.id === tab)?.label}</h1>
      <div className="ins-admin-pills" role="tablist" aria-label="Admin sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'is-active' : ''} onClick={(e) => { setTab(t.id); e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); }}>
            {t.label}
          </button>
        ))}
      </div>

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

      {state && (
        <section className="ins-tabpanel" role="tabpanel">
          {tab === 'analytics' && <AnalyticsPanel state={state} busy={busy} run={run} onHeld={() => setTab('screens')} />}
          {tab === 'add' && <AddScreensPanel state={state} busy={busy} run={run} onUploaded={refresh} />}
          {tab === 'batch' && <BatchPanel state={state} onChanged={refresh} />}
          {tab === 'screens' && <ScreensPanel state={state} busy={busy} run={run} />}
          {tab === 'apps' && <AppsPanel state={state} busy={busy} run={run} />}
          {tab === 'flows' && <FlowsPanel state={state} busy={busy} run={run} />}
          {tab === 'requests' && <RequestsPanel />}
          {tab === 'settings' && <SettingsPanel state={state} busy={busy} run={run} />}
        </section>
      )}
      </div>
      </div>
    </>
  );
}
