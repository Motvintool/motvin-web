'use client';

import { useEffect, useRef, useState } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import { adminApi, type AdminAppRecord, type AdminState } from '@/lib/inspirations/admin';
import { INDUSTRY_LABEL, PLATFORM_LABEL } from '@/lib/inspirations/taxonomy';
import { PICKABLE_INDUSTRIES, PLATFORMS, type Industry, type Platform } from '@/lib/inspirations/types';
import { CheckIcon, ChevronRightIcon, CloseIcon, PencilIcon, PlusIcon, SearchIcon, TrashIcon, UploadIcon } from '../Icons';
import { AppCardScreens } from './AppCardScreens';
import { AppVersionScreens } from './AppVersionScreens';
import { FlowsPanel } from './FlowsPanel';
import { AppSourcePanel } from './AppSourcePanel';

/**
 * App records: the products screenshots belong to.
 *
 * An app's id doubles as its folder name under `screens/<platform>/`, so it is
 * fixed once created; editing an existing app keeps the id and updates the
 * rest.
 *
 * Edit opens the app's own page, CMS-style: its details, every screen by
 * version, the card's screens, its flows (the Flows tab's own editor, kept
 * to this app) and its source & licence entry, one tab each, so the whole of an app is managed in one place.
 */

type EditorSection = 'details' | 'screens' | 'card' | 'flows' | 'source';

// A new app starts with no category chosen (not SaaS): the form will not save until
// somebody picks one, so a category is never an accident of the default.
const EMPTY: AdminAppRecord = { id: '', name: '', industry: 'unsorted', website: '', tagline: '', platforms: ['ios'] };

/** The admin's platform tabs: each app is listed, counted and edited on one at a time, never mixed. */
/** The longest "<name> — <tagline>" that fits the app page title in two lines. */
const TITLE_MAX = 55;

const PLATFORM_TAB: Record<Platform, string> = { ios: 'iOS', webapp: 'Web Apps', web: 'Websites' };

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function AppsPanel({
  state,
  busy,
  run,
}: {
  state: AdminState;
  busy: boolean;
  run: (action: () => Promise<unknown>, onDone?: () => void) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<AdminAppRecord>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  // The form opens for a new app (＋ Add app) or an app being edited; the list leads otherwise.
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState<Platform>('ios');
  const [section, setSection] = useState<EditorSection>('details');
  const editorRef = useRef<HTMLDivElement>(null);
  // Opening an app's page starts at its top.
  useEffect(() => {
    if (editingId) editorRef.current?.scrollIntoView({ block: 'start' });
  }, [editingId]);
  const [idTouched, setIdTouched] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoFor, setLogoFor] = useState<string | null>(null);

  const startNew = () => {
    setDraft(EMPTY);
    setEditingId(null);
    setIdTouched(false);
    setAdding(false);
  };

  // The details form's values for an app: one with no declared platforms shows the ones its screens are on.
  const draftFor = (app: AdminAppRecord): AdminAppRecord => {
    const fromScreens = PLATFORMS.filter((p) => state.files.some((f) => f.appId === app.id && f.platform === p));
    return { ...EMPTY, ...app, platforms: app.platforms?.length ? app.platforms : fromScreens };
  };

  const edit = (app: AdminAppRecord, open: EditorSection = 'details') => {
    setDraft(draftFor(app));
    setEditingId(app.id);
    setIdTouched(true);
    setSection(open);
  };

  const save = () => {
    void run(
      () =>
        adminApi.saveApp({
          ...draft,
          id: draft.id.trim(),
          name: draft.name.trim(),
        }),
      // Saving an edit keeps the app's page open; adding one goes back to the list.
      editingId ? undefined : startNew,
    );
  };

  // An app is on a platform when it has screens there, or is declared for it (a new app before its upload).
  const platformsOf = (app: AdminAppRecord) => PLATFORMS.filter((p) => state.files.some((f) => f.appId === app.id && f.platform === p) || app.platforms?.includes(p));
  const onPlatform = (app: AdminAppRecord, p: Platform) => platformsOf(app).includes(p);

  const remove = (app: AdminAppRecord) => {
    // On an app that is on other platforms too, only this platform's part goes.
    const partOnly = platformsOf(app).filter((p) => p !== platform && state.files.some((f) => f.appId === app.id && f.platform === p)).length > 0;
    const files = state.files.filter((f) => f.appId === app.id && (!partOnly || f.platform === platform)).length;
    const flows = state.flows.filter((f) => f.appId === app.id && (!partOnly || f.platform === platform)).length;

    // Deleting an app deletes its files, so the confirmation counts them
    // rather than describing the action in the abstract.
    const parts = [
      `${files} ${files === 1 ? 'screenshot' : 'screenshots'}`,
      flows > 0 ? `${flows} ${flows === 1 ? 'flow' : 'flows'}` : null,
      partOnly ? null : 'its licence entry',
    ].filter(Boolean);

    const message =
      (partOnly ? `Delete ${app.name}'s ${PLATFORM_TAB[platform]} part? Its other platforms stay.\n\n` : `Delete "${app.name}" and everything stored for it?\n\n`) +
      `This removes ${parts.join(', ')} from motvin-backend.\n\n` +
      `This cannot be undone.`;

    if (!window.confirm(message)) return;
    void run(() => adminApi.deleteApp(app.id, partOnly ? platform : undefined), () => {
      if (editingId === app.id) startNew();
    });
  };

  const uploadLogo = (file: File) => {
    if (!logoFor) return;
    void run(() => adminApi.uploadLogo(logoFor, file.name, file), () => setLogoFor(null));
  };

  const needsCategory = draft.industry === 'unsorted';
  // A new app needs a category; an existing one flagged "Needs category" can still be edited without one.
  const valid = draft.id.trim().length > 0 && draft.name.trim().length > 0 && (Boolean(editingId) || !needsCategory);

  const logoInput = (
  <input
    ref={logoInputRef}
    type="file"
    accept="image/png,image/webp,image/jpeg,image/svg+xml"
    hidden
    onChange={(e) => {
      const file = e.target.files?.[0];
      if (file) uploadLogo(file);
      e.target.value = '';
    }}
  />
  );

  const resetDraft = () => {
    const app = state.apps.find((x) => x.id === editingId);
    if (app) setDraft(draftFor(app));
  };
  const submit = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (valid) save();
  };

  const renderFields = () => (
    <>
      <div className="ins-admin-row">
        <label className="ins-field">
          <span className="ins-field-label">Name</span>
          <input
            className="ins-input"
            value={draft.name}
            onChange={(e) => {
              const name = e.target.value;
              setDraft((d) => ({ ...d, name, id: idTouched ? d.id : slugify(name) }));
            }}
            placeholder="Acme"
            required
          />
        </label>

        <label className="ins-field">
          <span className="ins-field-label">Id / folder</span>
          <input
            className="ins-input"
            value={draft.id}
            onChange={(e) => {
              setIdTouched(true);
              setDraft((d) => ({ ...d, id: slugify(e.target.value) }));
            }}
            placeholder="acme"
            disabled={Boolean(editingId)}
            required
          />
          <span className="ins-field-hint">
            {editingId ? 'Fixed once created.' : 'Used as the folder name under screens/<platform>/.'}
          </span>
        </label>

        <label className="ins-field">
          <span className="ins-field-label">Industry</span>
          <select
            className="ins-input"
            value={draft.industry}
            onChange={(e) => setDraft((d) => ({ ...d, industry: e.target.value as Industry }))}
          >
            {needsCategory && (
              <option value="unsorted" disabled={!editingId}>
                Choose a category…
              </option>
            )}
            {PICKABLE_INDUSTRIES.map((i) => (
              <option key={i} value={i}>
                {INDUSTRY_LABEL[i]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="ins-admin-row">
        <label className="ins-field">
          <span className="ins-field-label">Website</span>
          <input
            className="ins-input"
            value={draft.website ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, website: e.target.value }))}
            placeholder="https://acme.example"
            type="url"
          />
        </label>
        <label className="ins-field ins-field--wide">
          <span className="ins-field-label">Tagline</span>
          <input
            className="ins-input"
            value={draft.tagline ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, tagline: e.target.value }))}
            placeholder="One line about the product."
          />
          {/* The app page title, "<name> — <tagline>", fits two lines up to 55 characters (the review checks the same). */}
          {(() => {
            const used = `${draft.name.trim()} — ${(draft.tagline ?? '').trim()}`.length;
            return (
              <span className={`ins-field-hint ${used > TITLE_MAX ? 'ins-field-hint--warn' : ''}`}>
                {used > TITLE_MAX ? `Too long for two lines on the app page: ${used} of ${TITLE_MAX} characters with the name.` : `${used} of ${TITLE_MAX} characters with the name, so the app page title stays within two lines.`}
              </span>
            );
          })()}
        </label>
      </div>

      <div className="ins-field">
        <span className="ins-field-label" id="ins-app-platforms">
          Platform
        </span>
        <div className="ins-admin-chips" role="group" aria-labelledby="ins-app-platforms">
          {PLATFORMS.map((p) => {
            const on = draft.platforms?.includes(p) ?? false;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={on}
                className={`ins-chip ins-chip--sm ${on ? 'is-active' : ''}`}
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    platforms: on ? (d.platforms ?? []).filter((x) => x !== p) : PLATFORMS.filter((x) => x === p || d.platforms?.includes(x)),
                  }))
                }
              >
                {PLATFORM_LABEL[p as Platform]}
              </button>
            );
          })}
        </div>
        <span className="ins-field-hint">Where the app is listed. Its screens follow this choice, whichever platform they were uploaded as. Leave all off to follow the uploads.</span>
      </div>
    </>
  );

  // Adding an app: the compact form above the list.
  const renderForm = () => (
  <form className="ins-admin-form" onSubmit={submit}>
    <div className="ins-admin-form-head">
      <p className="ins-admin-form-title">Add an app</p>
      <button type="button" className="ins-iconbtn ins-iconbtn--plain" aria-label="Close" onClick={startNew} disabled={busy}>
        <CloseIcon size={14} />
      </button>
    </div>
    {renderFields()}
    <div className="ins-admin-actions">
      <button type="submit" className="ins-btn ins-btn--primary" disabled={!valid || busy}>
        <PlusIcon size={15} /> Add app
      </button>
      <button type="button" className="ins-btn ins-btn--ghost" onClick={startNew} disabled={busy}>
        Cancel
      </button>
    </div>
  </form>
  );

  // Editing an app: the upload wizard's card — a titled head, the fields, and a footer bar with Save on the right.
  const renderDetails = (saved: AdminAppRecord) => {
    const changed = JSON.stringify(draft) !== JSON.stringify(draftFor(saved));
    return (
      <form className="ins-wizard-card ins-app-details" onSubmit={submit} aria-labelledby="ins-app-details-title">
        <header className="ins-wizard-head">
          <h3 id="ins-app-details-title" className="ins-wizard-title">App details</h3>
          <p className="ins-wizard-desc">Its name, category and where it is listed in the library.</p>
        </header>
        <div className="ins-wizard-body ins-app-details-body">{renderFields()}</div>
        <footer className="ins-wizard-foot">
          <button type="button" className="ins-btn ins-btn--ghost" onClick={resetDraft} disabled={!changed || busy}>
            Undo changes
          </button>
          <span className="ins-wizard-note">{changed ? 'Unsaved changes' : 'All changes saved'}</span>
          <button type="submit" className="ins-btn ins-btn--primary" disabled={!valid || !changed || busy}>
            {busy ? <span className="ins-spinner" aria-hidden /> : <CheckIcon size={15} />} Save changes
          </button>
        </footer>
      </form>
    );
  };

  // An app's own page: everything about it in one place.
  const editing = editingId ? state.apps.find((app) => app.id === editingId) : undefined;
  if (editing) {
    const logo = state.logos.find((f) => f.startsWith(`${editing.id}.`));
    const logoUrl = logo ? inspirationsApi.mediaUrl(`/api/inspirations/logos/${logo}`) : null;
    // The app's page is of one platform — its screens, card, flows and counts there only.
    const screens = state.files.filter((f) => f.appId === editing.id && f.platform === platform);
    const published = screens.filter((f) => f.published).length;
    const flows = state.flows.filter((f) => f.appId === editing.id && f.platform === platform);
    const cardCount = (editing.cardScreens ?? []).filter((id) => id.startsWith(`${editing.id}-${platform}-`)).length;
    const otherPlatforms = platformsOf(editing).filter((p) => p !== platform);
    const partOnly = otherPlatforms.some((p) => state.files.some((f) => f.appId === editing.id && f.platform === p));
    const SECTIONS: Array<{ id: EditorSection; label: string; count?: string }> = [
      { id: 'details', label: 'Details' },
      { id: 'screens', label: 'Screens', count: String(screens.length) },
      { id: 'card', label: 'Card screens', count: cardCount > 0 ? `${cardCount}/4` : 'Auto' },
      { id: 'flows', label: 'Flows', count: String(flows.length) },
      { id: 'source', label: 'Source & licence', count: state.sources[editing.id]?.status === 'approved' ? 'Approved' : state.sources[editing.id]?.status ?? 'Not set' },
    ];
    return (
      <div ref={editorRef} className="ins-admin-panel ins-app-editor">
        {/* Breadcrumbs in the section title's place: Apps › this app. */}
        <nav className="ins-breadcrumbs" aria-label="Breadcrumb">
          <ol>
            <li>
              <button type="button" onClick={startNew} disabled={busy}>
                Apps
              </button>
            </li>
            <li aria-hidden className="ins-breadcrumbs-sep">
              <ChevronRightIcon size={18} />
            </li>
            <li>
              <button type="button" onClick={startNew} disabled={busy}>
                {PLATFORM_TAB[platform]}
              </button>
            </li>
            <li aria-hidden className="ins-breadcrumbs-sep">
              <ChevronRightIcon size={18} />
            </li>
            <li aria-current="page">{editing.name}</li>
          </ol>
        </nav>

        <header className="ins-app-editor-head">
          <button
            type="button"
            className="ins-app-editor-logo"
            title="Change logo"
            aria-label={`Change ${editing.name}'s logo`}
            disabled={busy}
            onClick={() => {
              setLogoFor(editing.id);
              logoInputRef.current?.click();
            }}
          >
            {logoUrl ? <img src={logoUrl} alt="" /> : <span>{editing.name.slice(0, 2).toUpperCase()}</span>}
            <span className="ins-app-editor-logo-edit" aria-hidden>
              <UploadIcon size={12} />
            </span>
          </button>
          <div className="ins-app-editor-text">
            <h2 className="ins-app-editor-name">
              {editing.name}
              <span className="ins-admin-item-id">{editing.id}</span>
            </h2>
            <p className="ins-app-editor-meta">
              {PLATFORM_TAB[platform]} · {editing.industry === 'unsorted' ? 'Needs category' : INDUSTRY_LABEL[editing.industry] ?? editing.industry} · {published} of {screens.length} screens published · {flows.length} {flows.length === 1 ? 'flow' : 'flows'}
            </p>
            {otherPlatforms.length > 0 && (
              <p className="ins-app-editor-meta">
                Also on{' '}
                {otherPlatforms.map((p, i) => (
                  <span key={p}>
                    {i > 0 && ', '}
                    <button type="button" className="ins-linkbtn" onClick={() => setPlatform(p)} disabled={busy}>
                      {PLATFORM_TAB[p]}
                    </button>
                  </span>
                ))}
              </p>
            )}
          </div>
          <button type="button" className="ins-btn ins-btn--sm ins-btn--danger-ghost" onClick={() => remove(editing)} disabled={busy}>
            <TrashIcon size={13} /> {partOnly ? `Delete ${PLATFORM_TAB[platform]} part` : 'Delete app'}
          </button>
        </header>

        <div className="ins-segmented ins-app-editor-tabs" role="tablist" aria-label={`${editing.name} sections`}>
          {SECTIONS.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={section === item.id} className={`ins-segmented-item ${section === item.id ? 'is-active' : ''}`} onClick={() => setSection(item.id)}>
              {item.label}
              {item.count && <span className="ins-app-editor-count">{item.count}</span>}
            </button>
          ))}
        </div>

        {section === 'details' && renderDetails(editing)}
        {section === 'screens' && (
          <AppVersionScreens app={editing} files={screens} flows={flows} screenTypes={state.vocabulary.screenTypes} busy={busy} run={run} state={state} />
        )}
        {section === 'card' && <AppCardScreens key={`${editing.id}:${platform}:${(editing.cardScreens ?? []).join(',')}`} app={editing} files={screens} busy={busy} run={run} />}
        {section === 'source' && <AppSourcePanel key={`${editing.id}:${JSON.stringify(state.sources[editing.id] ?? {})}`} app={editing} state={state} busy={busy} run={run} />}
        {section === 'flows' && <FlowsPanel key={`${editing.id}:${platform}`} state={state} busy={busy} run={run} appOnly={editing.id} platformOnly={platform} />}

        {logoInput}
      </div>
    );
  }

  return (
    <div className="ins-admin-panel">
      <div className="ins-segmented ins-app-platform-tabs" role="tablist" aria-label="Platform">
        {PLATFORMS.map((p) => (
          <button key={p} type="button" role="tab" aria-selected={platform === p} className={`ins-segmented-item ${platform === p ? 'is-active' : ''}`} onClick={() => setPlatform(p)}>
            {PLATFORM_TAB[p]}
            <span className="ins-app-editor-count">{state.apps.filter((app) => onPlatform(app, p)).length}</span>
          </button>
        ))}
      </div>
      <div className="ins-admin-toolbar">
        <label className="ins-toolbar-search">
          <SearchIcon size={14} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${state.apps.filter((app) => onPlatform(app, platform)).length} ${PLATFORM_TAB[platform]} apps`} aria-label="Search apps" />
        </label>
        <span className="ins-toolbar-note">Edit an app to manage its details, screens, card and flows.</span>
        {!adding && (
          <button type="button" className="ins-btn ins-btn--primary ins-btn--sm" onClick={() => {
            // A new app starts on the platform being looked at.
            setDraft({ ...EMPTY, platforms: [platform] });
            setAdding(true);
          }}>
            <PlusIcon size={14} /> Add app
          </button>
        )}
      </div>

      {adding && !editingId && renderForm()}

      <div className="ins-admin-list">
        {!state.apps.some((app) => onPlatform(app, platform)) && <p className="ins-muted">No {PLATFORM_TAB[platform]} apps yet.</p>}
        {state.apps.filter((app) => onPlatform(app, platform)).filter((app) => !query.trim() || app.name.toLowerCase().includes(query.trim().toLowerCase()) || app.id.includes(query.trim().toLowerCase())).map((app) => {
          const logo = state.logos.find((f) => f.startsWith(`${app.id}.`));
          const logoUrl = logo ? inspirationsApi.mediaUrl(`/api/inspirations/logos/${logo}`) : null;
          const screens = state.files.filter((f) => f.appId === app.id && f.platform === platform);
          const published = screens.filter((f) => f.published).length;
          const elsewhere = platformsOf(app).filter((p) => p !== platform);

          return (
            <div key={app.id} className="ins-admin-item">
              <div className="ins-admin-item-head">
                {logoUrl ? (
                  <img src={logoUrl} alt="" className="ins-admin-logo" />
                ) : (
                  <span className="ins-admin-logo ins-admin-logo--none" aria-hidden>
                    {app.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <div className="ins-admin-item-text">
                  <p className="ins-admin-item-title">
                    {app.name}
                    <span className="ins-admin-item-id">{app.id}</span>
                  </p>
                  <p className="ins-admin-item-sub">
                    {app.industry === 'unsorted' ? (
                      <span className="ins-admin-needs" title="The category could not be worked out — pick one with Edit">
                        Needs category
                      </span>
                    ) : (
                      <>
                        {INDUSTRY_LABEL[app.industry] ?? app.industry}
                        {app.industrySource === 'ai' && <span className="ins-admin-source" title="Chosen by the model, not confirmed by the store"> · AI-suggested</span>}
                      </>
                    )}{' '}
                    · {published} of {screens.length} screens published
                    {elsewhere.length > 0 && <span className="ins-admin-also"> · also on {elsewhere.map((p) => PLATFORM_TAB[p]).join(', ')}</span>}
                  </p>
                  {app.tagline && <p className="ins-admin-item-sub">{app.tagline}</p>}
                </div>
                <div className="ins-admin-item-actions">
                  <button type="button" className="ins-btn ins-btn--sm" onClick={() => edit(app)} disabled={busy}>
                    <PencilIcon size={13} /> Edit
                  </button>
                  <button
                    type="button"
                    className="ins-iconbtn ins-iconbtn--plain"
                    aria-label={`Remove ${app.name}`}
                    onClick={() => remove(app)}
                    disabled={busy}
                  >
                    <TrashIcon size={14} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {logoInput}
    </div>
  );
}
