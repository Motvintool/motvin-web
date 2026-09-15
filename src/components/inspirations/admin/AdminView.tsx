'use client';

import { useState } from 'react';
import { adminApi } from '@/lib/inspirations/admin';
import { PageHeading } from '../PageHeading';
import { CloseIcon, LayersIcon } from '../Icons';
import { AppsPanel } from './AppsPanel';
import { FlowsPanel } from './FlowsPanel';
import { LicensingPanel } from './LicensingPanel';
import { ScreensPanel } from './ScreensPanel';
import { UploadPanel } from './UploadPanel';
import { useAdminState } from './useAdminState';

/**
 * /inspirations/admin — the library's back office.
 *
 * Writes go to data/inspirations in motvin-backend through the admin API. The
 * manifest is rebuilt after every change, and the build report is shown here,
 * so it is always clear what actually became public.
 */

type Tab = 'upload' | 'screens' | 'apps' | 'licensing' | 'flows';

const TABS: { id: Tab; label: string }[] = [
  { id: 'upload', label: 'Upload' },
  { id: 'screens', label: 'Screens' },
  { id: 'apps', label: 'Apps' },
  { id: 'licensing', label: 'Licensing' },
  { id: 'flows', label: 'Flows' },
];

export function AdminView() {
  const [tab, setTab] = useState<Tab>('upload');
  const { state, loading, busy, error, report, refresh, run, setError } = useAdminState();

  const held = state?.files.filter((f) => !f.published).length ?? 0;

  return (
    <>
      <PageHeading
        title="Library admin"
        description="Upload screenshots, record where they came from, and publish them to the gallery."
        actions={
          <button
            type="button"
            className="ins-btn"
            disabled={busy || loading}
            onClick={() => void run(async () => ({ report: await adminApi.rebuild() }))}
          >
            <LayersIcon size={15} /> Rebuild manifest
          </button>
        }
      />

      {state && (
        <div className="ins-admin-summary">
          <span>
            <strong>{state.counts.screens ?? 0}</strong> published screens
          </span>
          <span>
            <strong>{state.counts.apps ?? 0}</strong> apps
          </span>
          <span>
            <strong>{state.counts.flows ?? 0}</strong> flows
          </span>
          <span>
            <strong>{state.counts.patterns ?? 0}</strong> patterns
          </span>
          {held > 0 && (
            <button type="button" className="ins-admin-held" onClick={() => setTab('screens')}>
              {held} file{held === 1 ? '' : 's'} held back
            </button>
          )}
          {state.generatedAt && (
            <span className="ins-muted">Built {new Date(state.generatedAt).toLocaleString()}</span>
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
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`ins-tab ${tab === t.id ? 'is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'screens' && held > 0 && <span className="ins-tab-count">{held}</span>}
          </button>
        ))}
      </div>

      {loading || !state ? (
        <p className="ins-muted ins-admin-status">Loading the store…</p>
      ) : (
        <section className="ins-tabpanel" role="tabpanel">
          {tab === 'upload' && (
            <UploadPanel
              state={state}
              busy={busy}
              onUploaded={refresh}
              run={run}
              onGoToLicensing={() => setTab('licensing')}
            />
          )}
          {tab === 'screens' && <ScreensPanel state={state} busy={busy} run={run} />}
          {tab === 'apps' && <AppsPanel state={state} busy={busy} run={run} />}
          {tab === 'licensing' && <LicensingPanel state={state} busy={busy} run={run} />}
          {tab === 'flows' && <FlowsPanel state={state} busy={busy} run={run} />}
        </section>
      )}
    </>
  );
}
