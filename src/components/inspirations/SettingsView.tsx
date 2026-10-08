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
import { PlusIcon, SparklesIcon, TrashIcon, UserIcon } from './Icons';
import { RequestAppModal } from './RequestAppModal';

/**
 * /inspirations/settings — the signed-in person's own page: who they are, and the apps they have
 * asked for. Everything on it is read from and written to their own Firestore documents; the
 * rules (firestore.inspirations.rules) are what keep anyone else out.
 */

type Section = 'account' | 'requests';

export function SettingsView() {
  const { user, ready } = useAuth();
  const { open: openAuth } = useAuthModal();
  const router = useRouter();
  const params = useSearchParams();
  const section: Section = params.get('section') === 'requests' ? 'requests' : 'account';
  const signedIn = Boolean(user && !user.isAnonymous);

  if (!ready) return <p className="ins-muted ins-admin-status">Loading your account…</p>;
  if (!signedIn || !user) {
    return (
      <EmptyState
        title="Sign in to see your settings"
        description="Your profile and the apps you’ve requested live here."
        action={{ label: 'Sign in', onClick: () => openAuth('login') }}
      />
    );
  }

  const go = (next: Section) => router.replace(next === 'account' ? INSPIRATIONS_ROUTES.settings : INSPIRATIONS_ROUTES.settingsRequests, { scroll: false });

  return (
    <div className="ins-set">
      <nav className="ins-set-nav" aria-label="Settings">
        <button type="button" className={section === 'account' ? 'is-active' : ''} onClick={() => go('account')}>
          <UserIcon size={20} /> Account
        </button>
        <button type="button" className={section === 'requests' ? 'is-active' : ''} onClick={() => go('requests')}>
          <SparklesIcon size={20} /> App requests
        </button>
      </nav>
      <div className="ins-set-body">{section === 'account' ? <AccountSection /> : <RequestsSection uid={user.uid} />}</div>
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
      setMessage('');
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
      <div className="ins-set-avatar">
        {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : <span>{displayName[0]?.toUpperCase()}</span>}
      </div>
      <h1 className="ins-set-name">{displayName}</h1>
      <p className="ins-set-email">{user.email}</p>

      {message && <p className="ins-set-note" role="status">{message}</p>}

      <h2 className="ins-set-heading">Personal details</h2>
      <Row
        label="Name"
        value={
          name === null ? (
            displayName
          ) : (
            <input className="ins-set-input" autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void saveName()} aria-label="Name" />
          )
        }
        action={
          name === null ? (
            <button type="button" onClick={() => setName(displayName)}>Edit</button>
          ) : (
            <>
              <button type="button" onClick={() => void saveName()} disabled={busy}>Save</button>
              <button type="button" onClick={() => setName(null)} className="is-quiet">Cancel</button>
            </>
          )
        }
      />
      <Row label="Email address" value={user.email} />
      <Row
        label="Password"
        value="Sent to your email to set or change"
        action={<button type="button" onClick={() => void resetPassword()} disabled={busy}>Email me a link</button>}
      />

      <h2 className="ins-set-heading">Manage account</h2>
      <Row
        label="Log out"
        value="You will be logged out on this device."
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
      <Row
        label="Delete account"
        value="Permanently delete your Motvin account and your app requests."
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
    </>
  );
}

function RequestsSection({ uid }: { uid: string }) {
  const [requests, setRequests] = useState<MyRequest[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<MyRequest | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRequests(await listMyRequests(uid));
      setError('');
    } catch {
      setError('We couldn’t load your requests just now.');
      setRequests([]);
    }
  }, [uid]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    void load();
  }, [load]);

  const remove = async (id: string) => {
    try {
      await deleteMyRequest(id);
      setRequests((current) => current?.filter((r) => r.id !== id) ?? null);
    } catch {
      setError('We couldn’t delete that just now — please try again.');
    } finally {
      setConfirming(null);
    }
  };

  const used = requests?.length ?? 0;

  return (
    <>
      <div className="ins-set-top">
        <div>
          <h1 className="ins-set-name">App requests</h1>
          <p className="ins-set-email">
            {used} of {MAX_REQUESTS_PER_USER} used. Edit or delete one to make room.
          </p>
        </div>
        <button type="button" className="ins-set-add" onClick={() => setAdding(true)} disabled={used >= MAX_REQUESTS_PER_USER}>
          <PlusIcon size={16} /> Request an app
        </button>
      </div>

      {error && <p className="ins-set-note" role="alert">{error}</p>}
      {!requests && <p className="ins-muted ins-admin-status">Loading…</p>}
      {requests && requests.length === 0 && !error && (
        <p className="ins-muted ins-admin-status">You haven’t requested any apps yet.</p>
      )}

      <div className="ins-set-requests">
        {requests?.map((request) => (
          <article key={request.id} className="ins-set-req">
            <div>
              <h3>
                {request.appName} <span>{PLATFORM_LABEL[request.platform]}</span>
              </h3>
              {request.link && (
                <a href={request.link} target="_blank" rel="noreferrer noopener">
                  {request.link.replace(/^https?:\/\//, '')}
                </a>
              )}
              {request.note && <p>{request.note}</p>}
            </div>
            <div className="ins-set-action">
              {confirming === request.id ? (
                <>
                  <button type="button" className="is-danger" onClick={() => void remove(request.id)}>Delete</button>
                  <button type="button" className="is-quiet" onClick={() => setConfirming(null)}>Keep</button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setEditing(request)}>Edit</button>
                  <button type="button" className="is-icon" aria-label={`Delete ${request.appName}`} onClick={() => setConfirming(request.id)}>
                    <TrashIcon size={16} />
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>

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
