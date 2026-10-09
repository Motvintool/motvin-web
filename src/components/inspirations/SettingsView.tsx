'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { deleteUser, updateProfile } from 'firebase/auth';
import { useAuthModal } from '@/components/shared/AuthModal';
import { useAuth } from '@/components/shared/AuthProvider';
import { ensureReady } from '@/lib/firebase/auth';
import { deleteMyRequest, listMyRequests, MAX_REQUESTS_PER_USER, type MyRequest } from '@/lib/firebase/appRequests';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { PLATFORM_LABEL } from '@/lib/inspirations/taxonomy';
import { EmptyState } from './EmptyState';
import { PlusIcon, TrashIcon } from './Icons';
import { RequestAppModal } from './RequestAppModal';

/**
 * /inspirations/settings — the signed-in person's own page: who they are, and the apps they have
 * asked for. Everything on it is read from and written to their own Firestore documents; the
 * rules (firestore.inspirations.rules) are what keep anyone else out.
 */

type Section = 'account' | 'requests';

/** An invisible marker the stylesheet looks for, so the settings page gets its own side padding in every state. */
function PageScope() {
  return <span className="ins-set-scope" hidden />;
}

/**
 * Motvin's own icons, drawn from the SVG files in public/ASSET/Icons. They are black in the file, so
 * they are used as a mask over currentColor: that way they grey back and turn black with the label.
 */
function SetIcon({ name, size = 22 }: { name: 'user-account' | 'app-request'; size?: number }) {
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

export function SettingsView() {
  const { user, ready } = useAuth();
  const { open: openAuth } = useAuthModal();
  const router = useRouter();
  const params = useSearchParams();
  const section: Section = params.get('section') === 'requests' ? 'requests' : 'account';
  const signedIn = Boolean(user && !user.isAnonymous);
  const [requestCount, setRequestCount] = useState<number | null>(null);
  const uid = user?.uid;

  // The side list shows how many of the five spots are used, whichever page you are on.
  useEffect(() => {
    if (!uid || !signedIn) return;
    let cancelled = false;
    listMyRequests(uid)
      .then((all) => !cancelled && setRequestCount(all.filter((r) => usesSpot(r.id)).length))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [uid, signedIn]);

  if (!ready) return <><PageScope /><p className="ins-muted ins-admin-status">Loading your account…</p></>;
  if (!signedIn || !user) {
    return (
      <>
        <PageScope />
        <EmptyState
        title="Sign in to see your settings"
        description="Your profile and the apps you’ve requested live here."
        action={{ label: 'Sign in', onClick: () => openAuth('login') }}
      />
      </>
    );
  }

  const go = (next: Section) => router.replace(next === 'account' ? INSPIRATIONS_ROUTES.settings : INSPIRATIONS_ROUTES.settingsRequests, { scroll: false });

  return (
    <div className="ins-set">
      <PageScope />
      <nav className="ins-set-tree" aria-label="Settings">
        <button type="button" className={`ins-set-tree-item ${section === 'account' ? 'is-active' : ''}`} aria-current={section === 'account'} onClick={() => go('account')}>
          <SetIcon name="user-account" /> Account
        </button>
        <button type="button" className={`ins-set-tree-item ${section === 'requests' ? 'is-active' : ''}`} aria-current={section === 'requests'} onClick={() => go('requests')}>
          <SetIcon name="app-request" /> App requests
          {requestCount !== null && <span className="ins-set-tree-count">{requestCount}/{MAX_REQUESTS_PER_USER}</span>}
        </button>
      </nav>

      {/* Narrow screens have no room for a side tree, so it becomes a pill switch. */}
      <div className="ins-set-tabs" role="tablist" aria-label="Settings">
        <button type="button" role="tab" aria-selected={section === 'account'} className={section === 'account' ? 'is-active' : ''} onClick={() => go('account')}>
          <SetIcon name="user-account" size={16} /> Account
        </button>
        <button type="button" role="tab" aria-selected={section === 'requests'} className={section === 'requests' ? 'is-active' : ''} onClick={() => go('requests')}>
          <SetIcon name="app-request" size={16} /> App requests
        </button>
      </div>

      <div className="ins-set-main">{section === 'account' ? <AccountSection /> : <RequestsSection uid={user.uid} onCount={setRequestCount} />}</div>
    </div>
  );
}

function Row({ label, value, action }: { label: string; value: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="ins-set-row">
      <div>
        <p className="ins-set-label">{label}</p>
        <div className="ins-set-value">{value}</div>
      </div>
      {action && <div className="ins-set-action">{action}</div>}
    </div>
  );
}

function AccountSection() {
  const { user, signOut, sendPasswordReset } = useAuth();
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
      await deleteUser(auth.currentUser);
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
                await signOut();
                router.replace(INSPIRATIONS_ROUTES.explore);
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

  const remove = async (id: string) => {
    try {
      await deleteMyRequest(id);
      setRequests((current) => {
        const next = current?.filter((r) => r.id !== id) ?? null;
        if (next) onCount(next.filter((r) => usesSpot(r.id)).length);
        return next;
      });
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
          {Array.from({ length: empty }, (_, i) => (
            <button key={`empty-${i}`} type="button" className="ins-set-slot ins-set-slot--empty" onClick={() => setAdding(true)}>
              <PlusIcon size={18} />
              <span>{i === 0 ? 'Request an app' : 'Open spot'}</span>
            </button>
          ))}
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
