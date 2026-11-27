'use client';

import { Suspense, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/shared/AuthProvider';
import { InspirationsLogin } from '@/components/inspirations/InspirationsLogin';
import { getIdToken } from '@/lib/firebase/auth';
import { approvePair, PAIR_PATTERN, pairCode } from '@/lib/figma/pair';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';

/**
 * /figma/connect — signing in the Figma plugin, "Motvin — Inspiration".
 *
 * The plugin opens this page with `?pair=`. The person signs in with their
 * normal Motvin account if they are not already, checks that the code here is
 * the one the plugin shows, and clicks Allow. The plugin, waiting in Figma,
 * then signs itself in; nothing needs to be copied back.
 */

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="mcp-connect">
      <div className="mcp-connect-card">
        <img
          src="/ASSET/svg/Motvin/login/login-signup-motvin-logo.svg"
          alt=""
          className="mcp-connect-logo"
          width={48}
          height={48}
        />
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
        <p className="mcp-connect-sub">Go back to Figma — the plugin signs in by itself in a few seconds. You can close this tab.</p>
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

  if (!ready) {
    return (
      <Frame>
        <h1 className="mcp-connect-title">Connecting&hellip;</h1>
      </Frame>
    );
  }

  // Guests cannot connect the plugin: the connection is tied to an account.
  const signedIn = Boolean(user && !user.isAnonymous);
  if (!signedIn) return <InspirationsLogin defaultMode="login" backHref="/" />;

  return (
    <Frame>
      <p className="mcp-connect-eyebrow">Connect to Motvin</p>
      <h1 className="mcp-connect-title">
        <strong>Motvin — Inspiration</strong> for Figma wants to use your Motvin library
      </h1>
      <p className="mcp-connect-sub">
        Signed in as <strong>{user?.email || user?.displayName}</strong>.{' '}
        <button type="button" className="mcp-connect-link" onClick={() => signOut()} disabled={busy}>
          Not you?
        </button>
      </p>

      <div className="mcp-connect-code">
        <span className="mcp-connect-code-value">{pairCode(pair)}</span>
        <span className="mcp-connect-code-label">Allow only if the plugin in Figma shows this code.</span>
      </div>

      <ul className="mcp-connect-permissions">
        <li>Search screens, flows and website pages in the Motvin library</li>
        <li>Place them on your Figma canvas</li>
        <li>It cannot change your account or anything you have saved.</li>
      </ul>

      {failure ? <p className="mcp-connect-sub">{failure}</p> : null}

      <div className="mcp-connect-actions">
        <button type="button" className="mcp-connect-allow" onClick={allow} disabled={busy}>
          {busy ? 'Connecting…' : 'Allow'}
        </button>
        <button type="button" className="mcp-connect-deny" onClick={() => setOutcome('denied')} disabled={busy}>
          Don&rsquo;t allow
        </button>
      </div>

      <p className="mcp-connect-hint">
        You can disconnect the plugin any time from its own menu, or from your <Link href={INSPIRATIONS_ROUTES.settingsTools}>connected tools</Link> in Settings.
      </p>
    </Frame>
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
