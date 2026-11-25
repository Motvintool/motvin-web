'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { deleteUser, updateProfile } from 'firebase/auth';
import { useGoToLogin } from './useGoToLogin';
import { useAuth } from '@/components/shared/AuthProvider';
import { ensureReady, getGuestUid } from '@/lib/firebase/auth';
import { deleteMyRequest, HANDOFF_NOTICE_EVENT, listMyRequests, MAX_REQUESTS_PER_USER, type MyRequest } from '@/lib/firebase/appRequests';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { cleanToolName, disconnectAllMcpConnections, disconnectMcpConnection, forgetMcpData, getMyMcpUsage, listMcpConnections, toolFor, usedAgo, type McpConnection, type McpMyUsage } from '@/lib/mcp/connections';
import { McpIcon } from '@/components/mcp/McpShared';
import { PLATFORM_LABEL } from '@/lib/inspirations/taxonomy';
import { PlusIcon, TrashIcon } from './Icons';
import { RequestAppModal } from './RequestAppModal';
import { askConfirm } from './ConfirmDialog';
import { useToast } from './Toast';

/**
 * /inspirations/settings — the signed-in person's own page: who they are, the apps they have
 * asked for, and the AI tools they have connected to Motvin MCP. Everything on it is read from and written to their own Firestore documents; the
 * rules (firestore.inspirations.rules) are what keep anyone else out.
 */

type Section = 'account' | 'requests' | 'tools';

const SECTION_ROUTE: Record<Section, string> = {
  account: INSPIRATIONS_ROUTES.settings,
  requests: INSPIRATIONS_ROUTES.settingsRequests,
  tools: INSPIRATIONS_ROUTES.settingsTools,
};

/** An invisible marker the stylesheet looks for, so the settings page gets its own side padding in every state. */
function PageScope() {
  return <span className="ins-set-scope" hidden />;
}

/**
 * Motvin's own icons, drawn from the SVG files in public/ASSET/Icons. They are black in the file, so
 * they are used as a mask over currentColor: that way they grey back and turn black with the label.
 */
function SetIcon({ name, size = 22 }: { name: 'user-account' | 'app-request' | 'ai-tools' | 'icon-search'; size?: number }) {
  const url = `url(/ASSET/Icons/${name}.svg)`;
  return (
    <span
      className="ins-set-icon"
      aria-hidden
      style={{ width: size, height: size, WebkitMaskImage: url, maskImage: url }}
    />
  );
}

/** Requests older than the five-spot rule have a different id; they are listed but do not use a spot. */
const usesSpot = (id: string) => /_[0-4]$/.test(id);

function since(ms: number): string {
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months} month${months === 1 ? '' : 's'} ago` : `${Math.floor(months / 12)}y ago`;
}

/**
 * What a visitor who isn't signed in sees on the account page: the same empty
 * state as an empty collections page (a fan of cards with the account icon on
 * top), with one way in.
 */
function SignedOutAccount({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="ins-collempty">
      <div className="ins-collempty-stack" aria-hidden>
        <span className="ins-collempty-tile ins-collempty-tile--a" />
        <span className="ins-collempty-tile ins-collempty-tile--b" />
        <span className="ins-collempty-tile ins-collempty-tile--c">
          <SetIcon name="user-account" size={26} />
        </span>
      </div>
      <h2>Sign in to your account</h2>
      <p>Your profile, your saved screens and the apps you’ve asked for, all in one place.</p>
      <div className="ins-collempty-actions">
        <button type="button" className="ins-collempty-primary" onClick={onSignIn}>
          Sign in
        </button>
      </div>
    </div>
  );
}

/**
 * The requests page for a visitor who isn't signed in: no page at all. Asking for an app needs no
 * account (a guest session holds the request, and it moves to the account on sign-in), so they
 * go to the landing page with the request form open over it (Navbar reads ?request=app).
 */
function SignedOutRequest() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/?request=app');
  }, [router]);
  return null;
}

export function SettingsView() {
  const { user, ready } = useAuth();
  const goToLogin = useGoToLogin();
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get('section');
  const section: Section = requested === 'requests' || requested === 'tools' ? requested : 'account';
  const signedIn = Boolean(user && !user.isAnonymous);
  const [requestCount, setRequestCount] = useState<number | null>(null);
  // How many AI tools are connected, for the count beside "AI tools" in the side list.
  const [toolCount, setToolCount] = useState<number | null>(null);
  // The person's own MCP usage, shown on the AI tools page (a sticky right column on wide screens).
  const [usage, setUsage] = useState<McpMyUsage | null>(null);
  // A visitor who sent a request without an account has a guest session; on the requests page
  // they see and manage those requests too. undefined = still checking.
  const [guestUid, setGuestUid] = useState<string | null | undefined>(undefined);
  const ownerUid = signedIn ? user?.uid : guestUid || undefined;

  useEffect(() => {
    if (!ready || signedIn) return;
    let cancelled = false;
    getGuestUid()
      .then((id) => !cancelled && setGuestUid(id))
      .catch(() => !cancelled && setGuestUid(null));
    return () => {
      cancelled = true;
    };
  }, [ready, signedIn]);

  // The side list shows how many of the five spots are used, whichever page you are on.
  useEffect(() => {
    if (!ownerUid) return;
    let cancelled = false;
    listMyRequests(ownerUid)
      .then((all) => !cancelled && setRequestCount(all.filter((r) => usesSpot(r.id)).length))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ownerUid]);

  useEffect(() => {
    if (!signedIn || section !== 'tools') return;
    let cancelled = false;
    getMyMcpUsage()
      .then((data) => !cancelled && setUsage(data))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [signedIn, section]);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    listMcpConnections()
      .then((all) => !cancelled && setToolCount(all.length))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const loading = <><PageScope /><p className="ins-muted ins-admin-status">Loading your account…</p></>;
  if (!ready) return loading;
  if (!signedIn) {
    // Connected AI tools belong to an account, so that page asks for a sign-in too.
    if (section === 'account' || section === 'tools') {
      return (
        <>
          <PageScope />
          <SignedOutAccount onSignIn={goToLogin} />
        </>
      );
    }
    if (guestUid === undefined) return loading;
    // No requests yet, so nothing to show: straight to the request form instead.
    if (!guestUid) return <><PageScope /><SignedOutRequest /></>;
  }
  if (!ownerUid) return loading;

  const go = (next: Section) => router.replace(SECTION_ROUTE[next], { scroll: false });
  // Shown once there is something to show: a connected tool, or any activity.
  const showUsage = section === 'tools' && signedIn && usage !== null && Boolean(toolCount || usage.today.used || usage.recent_searches.length);

  return (
    <div className={`ins-set ${showUsage ? 'has-aside' : ''}`}>
      <PageScope />
      <nav className="ins-set-tree" aria-label="Settings">
        <button type="button" className={`ins-set-tree-item ${section === 'account' ? 'is-active' : ''}`} aria-current={section === 'account'} onClick={() => go('account')}>
          <SetIcon name="user-account" /> Account
        </button>
        <button type="button" className={`ins-set-tree-item ${section === 'requests' ? 'is-active' : ''}`} aria-current={section === 'requests'} onClick={() => go('requests')}>
          <SetIcon name="app-request" /> App requests
          {requestCount !== null && <span className="ins-set-tree-count">{requestCount}/{MAX_REQUESTS_PER_USER}</span>}
        </button>
        {signedIn && (
          <button type="button" className={`ins-set-tree-item ${section === 'tools' ? 'is-active' : ''}`} aria-current={section === 'tools'} onClick={() => go('tools')}>
            <SetIcon name="ai-tools" /> AI tools
            {toolCount ? <span className="ins-set-tree-count">{toolCount}</span> : null}
          </button>
        )}
      </nav>

      {/* Narrow screens have no room for a side tree, so it becomes a pill switch. */}
      <div className="ins-set-tabs" role="tablist" aria-label="Settings">
        <button type="button" role="tab" aria-selected={section === 'account'} className={section === 'account' ? 'is-active' : ''} onClick={() => go('account')}>
          <SetIcon name="user-account" size={16} /> Account
        </button>
        <button type="button" role="tab" aria-selected={section === 'requests'} className={section === 'requests' ? 'is-active' : ''} onClick={() => go('requests')}>
          <SetIcon name="app-request" size={16} /> Requests
        </button>
        {signedIn && (
          <button type="button" role="tab" aria-selected={section === 'tools'} className={section === 'tools' ? 'is-active' : ''} onClick={() => go('tools')}>
            <SetIcon name="ai-tools" size={16} /> AI tools
          </button>
        )}
      </div>

      <div className="ins-set-main">
        {section === 'account' ? (
          <AccountSection />
        ) : section === 'tools' ? (
          <ToolsSection onCount={setToolCount} usage={showUsage ? usage : null} />
        ) : (
          <>
            {!signedIn && (
              // Guests keep their requests in this browser only; signing in carries them over.
              <div className="ins-set-guest" role="note">
                <p>
                  <b>You’re using Motvin as a guest.</b> Sign in to keep these requests with your account, on any device.
                </p>
                <button type="button" className="ins-set-guest-signin" onClick={() => goToLogin()}>
                  Sign in
                </button>
              </div>
            )}
            <RequestsSection uid={ownerUid} onCount={setRequestCount} />
          </>
        )}
      </div>

      {/* Wide screens: the person's usage in its own sticky column on the right. */}
      {showUsage && usage && (
        <aside className="ins-set-aside" aria-label="Your usage">
          <UsageCard usage={usage} vertical />
        </aside>
      )}
    </div>
  );
}

/** A settings row; `icon` sits on the left, beside both the label and the value. */
function Row({ label, value, action, icon }: { label: React.ReactNode; value: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode }) {
  const text = (
    <div>
      <p className="ins-set-label">{label}</p>
      <div className="ins-set-value">{value}</div>
    </div>
  );
  return (
    <div className="ins-set-row">
      {icon ? (
        <div className="ins-set-row-main">
          {icon}
          {text}
        </div>
      ) : (
        text
      )}
      {action && <div className="ins-set-action">{action}</div>}
    </div>
  );
}

function AccountSection() {
  const { user, signOut, sendPasswordReset } = useAuth();
  const { show } = useToast();
  const router = useRouter();
  const [name, setName] = useState<string | null>(null); // null = not editing
  const [shownName, setShownName] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [facts, setFacts] = useState<{ via: string; joined: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensureReady().then((auth) => {
      const current = auth?.currentUser;
      if (cancelled || !current) return;
      const id = current.providerData[0]?.providerId ?? 'password';
      const created = current.metadata.creationTime ? new Date(current.metadata.creationTime) : null;
      setFacts({
        via: id === 'google.com' ? 'Google' : 'Email',
        joined: created ? created.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '',
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!user) return null;

  const displayName = shownName ?? (user.displayName || user.email.split('@')[0]);

  const saveName = async () => {
    const next = (name ?? '').trim();
    if (!next) return setName(null);
    setBusy(true);
    try {
      const auth = await ensureReady();
      if (auth?.currentUser) await updateProfile(auth.currentUser, { displayName: next });
      setShownName(next);
      setName(null);
      setMessage('Name saved.');
      window.setTimeout(() => setMessage((m) => (m === 'Name saved.' ? '' : m)), 2500);
    } catch {
      setMessage('We couldn’t save your name just now — please try again.');
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    setBusy(true);
    try {
      await sendPasswordReset(user.email);
      setMessage(`We’ve sent a password link to ${user.email}.`);
    } catch {
      setMessage('We couldn’t send that email just now — please try again.');
    } finally {
      setBusy(false);
    }
  };

  const removeAccount = async () => {
    setBusy(true);
    try {
      const auth = await ensureReady();
      if (!auth?.currentUser) throw new Error('signed-out');
      // Their requests go first, while the account can still prove they are theirs.
      const mine = await listMyRequests(user.uid);
      await Promise.all(mine.map((r) => deleteMyRequest(r.id)));
      // Then their AI tools lose access and their usage history is erased, before the account itself goes.
      await forgetMcpData();
      await deleteUser(auth.currentUser);
      show('Your account was deleted');
      router.replace(INSPIRATIONS_ROUTES.explore);
    } catch (failure) {
      const code = (failure as { code?: string })?.code;
      setMessage(
        code === 'auth/requires-recent-login'
          ? 'For safety, log out and log back in, then delete your account.'
          : 'We couldn’t delete your account just now — please try again.',
      );
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="ins-set-hero">
        <div className="ins-set-avatar">
          {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : <span>{displayName[0]?.toUpperCase()}</span>}
        </div>
        <div className="ins-set-hero-text">
          <h1 className="ins-set-name">{displayName}</h1>
          <p className="ins-set-email">{user.email}</p>
          {facts && (
            <div className="ins-set-facts">
              <span>Signed in with {facts.via}</span>
              {facts.joined && <span>Member since {facts.joined}</span>}
            </div>
          )}
        </div>
      </section>

      {message && <p className="ins-set-note" role="status">{message}</p>}

      <section className="ins-set-card" id="set-profile">
        <h2 className="ins-set-heading">Profile</h2>
        <Row
          label="Name"
          value={
            name === null ? (
              displayName
            ) : (
              <input className="ins-set-input" autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void saveName(); if (e.key === 'Escape') setName(null); }} aria-label="Name" />
            )
          }
          action={
            name === null ? (
              <button type="button" onClick={() => setName(displayName)}>Edit</button>
            ) : (
              <>
                <button type="button" className="is-primary" onClick={() => void saveName()} disabled={busy}>Save</button>
                <button type="button" onClick={() => setName(null)} className="is-quiet">Cancel</button>
              </>
            )
          }
        />
        <Row label="Email" value={user.email} />
      </section>

      <section className="ins-set-card" id="set-security">
        <h2 className="ins-set-heading">Security</h2>
        <Row
          label="Password"
          value="We’ll email you a link to set or change it."
          action={<button type="button" onClick={() => void resetPassword()} disabled={busy}>Email me a link</button>}
        />
        <Row
          label="Log out"
          value="Sign out of Motvin on this device."
          action={
            <button
              type="button"
              onClick={async () => {
                try {
                  await signOut();
                  show('Logged out');
                  router.replace(INSPIRATIONS_ROUTES.explore);
                } catch {
                  show('Couldn’t log out — please try again', { tone: 'error' });
                }
              }}
            >
              Log out
            </button>
          }
        />
      </section>

      <section className="ins-set-card ins-set-card--danger" id="set-delete">
        <h2 className="ins-set-heading">Delete account</h2>
        <Row
          label="Remove everything"
          value="Permanently deletes your account and your app requests. This can’t be undone."
          action={
            confirmDelete ? (
              <>
                <button type="button" className="is-danger" onClick={() => void removeAccount()} disabled={busy}>Yes, delete</button>
                <button type="button" className="is-quiet" onClick={() => setConfirmDelete(false)}>Keep</button>
              </>
            ) : (
              <button type="button" className="is-danger" onClick={() => setConfirmDelete(true)}>Delete</button>
            )
          }
        />
      </section>
    </>
  );
}

function RequestsSection({ uid, onCount }: { uid: string; onCount: (count: number) => void }) {
  const [requests, setRequests] = useState<MyRequest[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<MyRequest | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const { show } = useToast();

  const load = useCallback(async () => {
    try {
      const all = await listMyRequests(uid);
      setRequests(all);
      onCount(all.filter((r) => usesSpot(r.id)).length);
      setError('');
    } catch {
      setError('We couldn’t load your requests just now.');
      setRequests([]);
    }
  }, [uid, onCount]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    void load();
  }, [load]);

  // Sign-in returns here before a guest's requests have finished moving in;
  // reload once they have (saveHandoffNotice raises this event).
  useEffect(() => {
    const reload = () => void load();
    window.addEventListener(HANDOFF_NOTICE_EVENT, reload);
    return () => window.removeEventListener(HANDOFF_NOTICE_EVENT, reload);
  }, [load]);

  const remove = async (id: string) => {
    try {
      await deleteMyRequest(id);
      setRequests((current) => {
        const next = current?.filter((r) => r.id !== id) ?? null;
        if (next) onCount(next.filter((r) => usesSpot(r.id)).length);
        return next;
      });
      show('Request deleted');
    } catch {
      setError('We couldn’t delete that just now — please try again.');
    } finally {
      setConfirming(null);
    }
  };

  const used = requests?.filter((r) => usesSpot(r.id)).length ?? 0;
  const empty = Math.max(0, MAX_REQUESTS_PER_USER - used);

  return (
    <>
      <section className="ins-set-hero ins-set-hero--requests">
        <span className="ins-set-badge" aria-hidden>
          <SetIcon name="app-request" size={28} />
        </span>
        <div className="ins-set-hero-text">
          <h1 className="ins-set-name">App requests</h1>
          <p className="ins-set-email">Apps you’d like us to add. You have {MAX_REQUESTS_PER_USER} spots — edit or delete one to free it up.</p>
        </div>
        <div className="ins-set-meter" aria-label={`${used} of ${MAX_REQUESTS_PER_USER} used`}>
          {Array.from({ length: MAX_REQUESTS_PER_USER }, (_, i) => (
            <i key={i} className={i < used ? 'is-on' : ''} />
          ))}
          <span>{used}/{MAX_REQUESTS_PER_USER}</span>
        </div>
      </section>

      {error && <p className="ins-set-note" role="alert">{error}</p>}

      {requests ? (
        <div className="ins-set-slots">
          {requests.map((request) => (
            <article key={request.id} className="ins-set-slot">
              <header>
                <span className="ins-set-chip">{PLATFORM_LABEL[request.platform] ?? request.platform}</span>
                {confirming === request.id ? (
                  <span className="ins-set-confirm">
                    <button type="button" className="is-danger" onClick={() => void remove(request.id)}>Delete</button>
                    <button type="button" onClick={() => setConfirming(null)}>Keep</button>
                  </span>
                ) : (
                  <span className="ins-set-tools">
                    <button type="button" aria-label={`Edit ${request.appName}`} onClick={() => setEditing(request)}>Edit</button>
                    <button type="button" aria-label={`Delete ${request.appName}`} onClick={() => setConfirming(request.id)}>
                      <TrashIcon size={15} />
                    </button>
                  </span>
                )}
              </header>
              <h3>{request.appName}</h3>
              {request.link && (
                <a href={request.link} target="_blank" rel="noreferrer noopener">
                  {request.link.replace(/^https?:\/\//, '')}
                </a>
              )}
              {request.note && <p>{request.note}</p>}
              <time className="ins-set-when">Requested {since(request.createdAtMs)}</time>
            </article>
          ))}
          {/* One way to add, not a dashed box per free spot (the meter above
              already says how many are left). */}
          {empty > 0 && (
            <button type="button" className="ins-set-slot ins-set-slot--empty" onClick={() => setAdding(true)}>
              <PlusIcon size={18} />
              <span>Request an app</span>
            </button>
          )}
        </div>
      ) : (
        <div className="ins-set-slots" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="ins-set-slot ins-set-skeleton" />
          ))}
        </div>
      )}

      {(editing || adding) && (
        <RequestAppModal
          initialName=""
          initialPlatform="ios"
          existing={editing ?? undefined}
          onRequestsPage
          onClose={() => {
            setEditing(null);
            setAdding(false);
            void load();
          }}
        />
      )}
    </>
  );
}

/** Whether an ISO time is more than a week ago. */
function idleAllWeek(iso: string): boolean {
  return Date.now() - Date.parse(iso) > 7 * 86_400_000;
}

/** "today", "yesterday", "3 days ago" from an ISO time. */
function sinceIso(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? since(ms) : 'recently';
}

/**
 * The AI tools connected to this account through Motvin MCP (Claude, Cursor,
 * ChatGPT…), each with its logo, when it connected and when it was last used.
 * Disconnecting one — or all, say after losing a laptop — cuts access at once;
 * a tool can be connected again from the tool any time.
 */
function ToolsSection({ onCount, usage }: { onCount: (count: number) => void; usage: McpMyUsage | null }) {
  const [connections, setConnections] = useState<McpConnection[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const { show } = useToast();

  const update = useCallback(
    (next: McpConnection[]) => {
      setConnections(next);
      onCount(next.length);
    },
    [onCount],
  );

  const load = useCallback(async () => {
    try {
      update(await listMcpConnections());
      setError('');
    } catch (failure) {
      setError((failure as Error).message || 'We couldn’t load your connected tools just now.');
      setConnections([]);
    }
  }, [update]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    void load();
  }, [load]);

  const disconnect = async (connection: McpConnection) => {
    const name = cleanToolName(connection.client_name);
    const ok = await askConfirm({
      title: `Disconnect “${name}”?`,
      description: `${name} loses access to Motvin right away and will ask you to sign in again next time. To remove Motvin from it completely, remove the server in ${name} too.`,
      confirmLabel: 'Disconnect',
    });
    if (!ok) return;
    setBusy(connection.id);
    try {
      await disconnectMcpConnection(connection.id);
      update((connections ?? []).filter((c) => c.id !== connection.id));
      show(`${name} disconnected`);
    } catch (failure) {
      setError((failure as Error).message || 'We couldn’t disconnect that just now — please try again.');
    } finally {
      setBusy(null);
    }
  };

  const disconnectAll = async () => {
    const count = connections?.length ?? 0;
    const ok = await askConfirm({
      title: `Disconnect all ${count} tools?`,
      description: 'Every tool loses access to Motvin right away. You can connect them again any time.',
      confirmLabel: 'Disconnect all',
    });
    if (!ok) return;
    setBusy('all');
    try {
      const { disconnected } = await disconnectAllMcpConnections();
      update([]);
      show(`${disconnected} tool${disconnected === 1 ? '' : 's'} disconnected`);
    } catch (failure) {
      setError((failure as Error).message || 'We couldn’t disconnect them just now — please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <section className="ins-set-hero ins-set-hero--requests">
        <span className="ins-set-badge" aria-hidden>
          <SetIcon name="ai-tools" size={28} />
        </span>
        <div className="ins-set-hero-text">
          <h1 className="ins-set-name">AI tools</h1>
          <p className="ins-set-email">Tools you’ve connected to Motvin with MCP. Disconnect one and it loses access right away.</p>
        </div>
      </section>

      {error && <p className="ins-set-note" role="alert">{error}</p>}

      <section className="ins-set-card" id="set-tools" aria-busy={connections === null}>
        <h2 className="ins-set-heading">Connected tools</h2>
        {connections === null ? (
          <Row label="Loading…" value="Checking which tools are connected." />
        ) : connections.length === 0 ? (
          <Row
            label="No tools connected"
            value="Connect Claude, Cursor, ChatGPT or another AI tool to search Motvin from it."
            action={<Link className="ins-set-link-btn" href="/mcp/clients">Connect a tool</Link>}
          />
        ) : (
          connections.map((connection) => {
            const name = cleanToolName(connection.client_name);
            const tool = toolFor(name);
            return (
              <Row
                key={connection.id}
                icon={
                  <span className="ins-set-tool-icon" style={{ color: tool.color }} aria-hidden>
                    <McpIcon id={tool.icon} size={24} />
                  </span>
                }
                label={
                  // The tool's name opens its setup guide on motvin.com (to reconnect or fix something).
                  <Link className="ins-set-tool-link" href={`/mcp/clients/${tool.id}`} title={`${name} setup guide`}>
                    {name}
                  </Link>
                }
                value={[
                  `Connected ${sinceIso(connection.connected_at)}`,
                  `Last used ${usedAgo(connection.last_used_at)}`,
                  connection.calls_this_week
                    ? `Used ${connection.calls_this_week.toLocaleString()} time${connection.calls_this_week === 1 ? '' : 's'} this week`
                    : // Only when it really sat idle all week; a recent "last used" says otherwise.
                      idleAllWeek(connection.last_used_at)
                      ? 'Not used this week'
                      : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                action={
                  <button
                    type="button"
                    className="is-danger-quiet"
                    onClick={() => void disconnect(connection)}
                    disabled={busy === connection.id}
                    aria-label={`Disconnect ${name}`}
                  >
                    Disconnect
                  </button>
                }
              />
            );
          })
        )}
        {connections && connections.length > 0 && (
          // Room for one more: the setup guides for every other tool.
          <Row
            icon={
              <span className="ins-set-tool-icon ins-set-tool-icon--add" aria-hidden>
                +
              </span>
            }
            label={
              <Link className="ins-set-tool-link" href="/mcp/clients">
                Connect another tool
              </Link>
            }
            value="Setup guides for Cursor, ChatGPT, VS Code and more."
          />
        )}
      </section>

      {/* Narrower screens have no right column, so the usage card sits here instead. */}
      {usage && (
        <div className="ins-set-usage-inline">
          <UsageCard usage={usage} />
        </div>
      )}

      {connections && connections.length > 1 && (
        <section className="ins-set-card ins-set-card--danger" id="set-tools-all">
          <h2 className="ins-set-heading">Disconnect all</h2>
          <Row
            label="Remove every tool"
            value={`Disconnects all ${connections.length} tools at once, for example if a device is lost. You can connect them again any time.`}
            action={
              <button type="button" className="is-danger" onClick={() => void disconnectAll()} disabled={busy === 'all'}>
                Disconnect all
              </button>
            }
          />
        </section>
      )}
    </>
  );
}

/** "5 hours", "40 minutes" until the daily count starts again. */
function resetsIn(iso: string): string {
  const minutes = Math.max(1, Math.round((Date.parse(iso) - Date.now()) / 60_000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

/**
 * The person's own MCP usage: calls today against the daily limit, calls per
 * day this week, and the last searches their tools ran on Motvin.
 */
function UsageCard({ usage, vertical = false }: { usage: McpMyUsage; vertical?: boolean }) {
  const { used, limit, resets_at: resets } = usage.today;
  const share = limit ? Math.min(1, used / limit) : 0;
  const peak = Math.max(1, ...usage.days.map((day) => day.calls));

  return (
    <section className={`ins-set-card ins-set-usage ${vertical ? 'ins-set-usage--vertical' : ''}`}>
      <h2 className="ins-set-heading">Your usage</h2>
      <div className="ins-set-usage-top">
        <div className="ins-set-usage-today">
          <p className="ins-set-label">Today</p>
          <p className="ins-set-usage-big">
            {used.toLocaleString()} <span>{limit ? `of ${limit.toLocaleString()} calls` : `call${used === 1 ? '' : 's'}`}</span>
          </p>
          {limit > 0 && (
            <div className={`ins-set-usage-bar ${share >= 0.9 ? 'is-high' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used}>
              <span style={{ width: used ? `max(6px, ${share * 100}%)` : 0 }} />
            </div>
          )}
          <p className="ins-set-value">{resets
              ? `Your daily count resets in ${resetsIn(resets)}.`
              : limit
                ? `You can make up to ${limit.toLocaleString()} calls a day.`
                : 'There is no daily limit.'}</p>
        </div>
        <div className="ins-set-usage-week">
          <p className="ins-set-label">This week</p>
          <div className="ins-set-usage-cols" aria-label="Calls per day, last 7 days">
            {usage.days.map((day, index) => {
              const date = new Date(`${day.date}T12:00:00Z`);
              const label = date.toLocaleDateString(undefined, { weekday: 'short' });
              // The last day is today: its label is in full ink.
              const today = index === usage.days.length - 1;
              const tip = `${today ? 'Today' : date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · ${day.calls ? `${day.calls.toLocaleString()} call${day.calls === 1 ? '' : 's'}` : 'No calls'}`;
              // The hover label opens toward the middle, so the end days stay inside the card.
              const side = index < 2 ? 'is-start' : index > usage.days.length - 3 ? 'is-end' : '';
              return (
                <div key={day.date} className={`ins-set-usage-col ${today ? 'is-today' : ''} ${side}`} data-hint={tip} aria-label={tip}>
                  <span className="ins-set-usage-plot">
                    {day.calls > 0 && <b>{day.calls.toLocaleString()}</b>}
                    <span className={`ins-set-usage-fill ${day.calls ? '' : 'is-zero'}`} style={day.calls ? { height: `max(8px, calc((100% - 20px) * ${day.calls / peak}))` } : undefined} />
                  </span>
                  <i>{label.slice(0, 2)}</i>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="ins-set-usage-searches">
        <p className="ins-set-label">Recent searches</p>
        {usage.recent_searches.length ? (
          <ul>
            {/* The side panel keeps to the last five so it stays inside the screen. */}
            {usage.recent_searches.slice(0, vertical ? 5 : undefined).map((search) => (
              <li key={`${search.query}-${search.at}`}>
                <span className="ins-set-usage-search-icon" aria-hidden>
                  <SetIcon name="icon-search" size={15} />
                </span>
                <span className="ins-set-usage-search-text">
                  <span className="ins-set-usage-query">{search.query}</span>
                  <span className="ins-set-value">
                    {search.client ? `${cleanToolName(search.client)} · ` : ''}
                    {usedAgo(search.at)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ins-set-value">No searches yet. Try “onboarding screens on iOS”.</p>
        )}
      </div>
    </section>
  );
}
