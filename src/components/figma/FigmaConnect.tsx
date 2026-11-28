'use client';

import { Suspense, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/shared/AuthProvider';
import { InspirationsLogin } from '@/components/inspirations/InspirationsLogin';
import { getIdToken } from '@/lib/firebase/auth';
import { approvePair, PAIR_PATTERN, pairCode } from '@/lib/figma/pair';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { FigmaMark } from '@/components/plugins/FigmaMark';

/**
 * /figma/connect — signing in the Figma plugin, "Motvin — Inspiration".
 *
 * The plugin opens this page with `?pair=`. The person signs in with their
 * normal Motvin account if they are not already, checks that the code here is
 * the one the plugin shows, and clicks Allow. The plugin, waiting in Figma,
 * then signs itself in; nothing needs to be copied back.
 */

/** Every state but the Allow card stays plain: the logo and a line or two on a white page (opened outside Figma, loading, connected, cancelled). */
function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="mcp-connect">
      <div className="mcp-connect-card">
        <img src="/ASSET/svg/Motvin/login/login-signup-motvin-logo.svg" alt="" className="mcp-connect-logo" width={48} height={48} />
        {children}
      </div>
    </div>
  );
}

function ConnectRoute() {
  const params = useSearchParams();
  const pair = params.get('pair') ?? '';
  const { user, ready, signOut } = useAuth();

  const [outcome, setOutcome] = useState<'allowed' | 'denied' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // How long "Connecting…" may show before the page stops waiting on Firebase (slow networks, a blocked browser store).
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setWaited(true), 4000);
    return () => window.clearTimeout(timer);
  }, []);

  const allow = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const idToken = await getIdToken(true);
      if (!idToken) throw new Error('Your sign-in has expired. Sign in again and retry.');
      await approvePair(pair, idToken);
      setOutcome('allowed');
    } catch (reason) {
      setFailure((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!PAIR_PATTERN.test(pair)) {
    return (
      <Frame>
        <h1 className="mcp-connect-title">This page opens from Figma</h1>
        <p className="mcp-connect-sub">
          In Figma, open the <strong>Motvin — Inspiration</strong> plugin and click <strong>Sign in with Motvin</strong>.
          It sends you here to approve.
        </p>
      </Frame>
    );
  }

  if (outcome === 'allowed') {
    return (
      <Frame>
        <h1 className="mcp-connect-title">You&rsquo;re connected</h1>
        <p className="mcp-connect-sub">Go back to Figma. The plugin signs in by itself in a few seconds, and you can close this tab.</p>
      </Frame>
    );
  }

  if (outcome === 'denied') {
    return (
      <Frame>
        <h1 className="mcp-connect-title">Not connected</h1>
        <p className="mcp-connect-sub">The plugin was not signed in. You can close this tab.</p>
      </Frame>
    );
  }

  // Guests cannot connect the plugin: the connection is tied to an account.
  // The saved session is known at once, so a signed-in person sees the card straight away instead of waiting for
  // Firebase to finish starting (which could sit on "Connecting…" for good on a slow network). Allow still waits
  // for a fresh token, so nothing is approved on stale state.
  const signedIn = Boolean(user && !user.isAnonymous);
  if (!signedIn && !ready && !waited) {
    return (
      <Frame>
        <h1 className="mcp-connect-title fig-connect-loading">Connecting&hellip;</h1>
      </Frame>
    );
  }

  if (!signedIn) return <InspirationsLogin defaultMode="login" backHref="/" />;

  // Kept short: one title, the code to check, one button. The details sit in a single quiet line.
  // Laid out like a standard app-permission card: who is signed in on top, the app asking, what it may do, two buttons.
  return (
    <div className="mcp-connect fig-auth">
      <div className="fig-auth-card">
        <header className="fig-auth-head">
          <img src="/ASSET/svg/Motvin/login/login-signup-motvin-logo.svg" alt="Motvin" className="fig-auth-brand" width={32} height={32} />
          <span className="fig-auth-who">
            {user?.photoURL ? (
              <img className="fig-auth-avatar" src={user.photoURL} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="fig-auth-avatar" aria-hidden="true">{(user?.email || user?.displayName || '?').charAt(0).toUpperCase()}</span>
            )}
            <span className="fig-auth-email">{user?.email || user?.displayName}</span>
            <button type="button" className="fig-auth-notyou" onClick={() => signOut()} disabled={busy}>
              (Not you?)
            </button>
          </span>
        </header>

        <div className="fig-auth-body">
          <span className="fig-auth-app" aria-hidden="true"><FigmaMark /></span>
          <h1 className="fig-auth-title">Motvin — Inspiration wants access to Motvin</h1>
          <p className="fig-auth-sub">This will give the Figma plugin permission to:</p>

          <ul className="fig-auth-list">
            <li>Search screens, flows and website pages in the Motvin library.</li>
            <li>Place them on your Figma canvas.</li>
            <li>It cannot change your account or anything you have saved.</li>
          </ul>

          {failure ? <p className="fig-auth-error">{failure}</p> : null}

          <div className="fig-auth-actions">
            <button type="button" className="fig-auth-cancel" onClick={() => setOutcome('denied')} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="fig-auth-allow" onClick={allow} disabled={busy}>
              {busy ? 'Connecting…' : 'Allow'}
            </button>
          </div>

          <div className="fig-auth-note">
            <svg className="fig-auth-note-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6Z" /><path d="m9 12 2 2 4-4" strokeLinecap="round" /></svg>
            <strong>Check the code: {pairCode(pair)}</strong>
            <span>
              Allow only if the plugin in Figma shows this same code. You can disconnect it any time in{' '}
              <Link href={INSPIRATIONS_ROUTES.settingsTools}>connected tools</Link>.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Suspense is required because ConnectRoute reads `useSearchParams`. */
export function FigmaConnect() {
  return (
    <Suspense fallback={null}>
      <ConnectRoute />
    </Suspense>
  );
}
