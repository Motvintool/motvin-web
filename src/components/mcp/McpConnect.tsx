'use client';

import { Suspense, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/shared/AuthProvider';
import { InspirationsLogin } from '@/components/inspirations/InspirationsLogin';
import { getIdToken } from '@/lib/firebase/auth';
import { decideConnection, describeConnection, type ConnectionRequest } from '@/lib/mcp/oauth';

/**
 * /mcp/connect — the sign-in and approval step of connecting an AI tool to
 * Motvin over MCP.
 *
 * An MCP client (Claude, Cursor, ChatGPT, …) sends the person here with a
 * signed `?request=` from the backend's authorization endpoint. The page
 * shows who is asking, has the person sign in with their normal Motvin
 * account if they are not already, and on Allow posts their Firebase ID token
 * back to the backend, which answers with the URL that returns them to the
 * tool carrying an authorization code. The page never sees tokens other than
 * the person's own sign-in.
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
  const request = params.get('request');
  const { user, ready, signOut } = useAuth();

  const [description, setDescription] = useState<ConnectionRequest | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    describeConnection(request)
      .then((data) => {
        if (!cancelled) setDescription(data);
      })
      .catch((reason: Error) => {
        if (!cancelled) setFailure(reason.message);
      });
    return () => {
      cancelled = true;
    };
  }, [request]);

  const error = failure;

  const decide = async (decision: 'allow' | 'deny') => {
    if (!request) return;
    setBusy(true);
    setFailure(null);
    try {
      const idToken = decision === 'allow' ? await getIdToken(true) : null;
      if (decision === 'allow' && !idToken) throw new Error('Your sign-in has expired. Sign in again and retry.');
      window.location.assign(await decideConnection(request, decision, idToken));
    } catch (reason) {
      setFailure((reason as Error).message);
      setBusy(false);
    }
  };

  // No request at all means someone typed the address in; point them at the page that explains it.
  if (!request) {
    return (
      <Frame>
        <h1 className="mcp-connect-title">This page opens from your AI tool</h1>
        <p className="mcp-connect-sub">
          When you connect Claude, Cursor or another AI tool to Motvin, it sends you here to sign in and approve. There is
          nothing to approve right now.
        </p>
        <div className="mcp-connect-actions">
          <Link href="/mcp" className="mcp-connect-allow">
            How to connect an AI tool
          </Link>
        </div>
      </Frame>
    );
  }

  if (error) {
    return (
      <Frame>
        <h1 className="mcp-connect-title">Connection didn&rsquo;t go through</h1>
        <p className="mcp-connect-sub">{error}</p>
        <p className="mcp-connect-hint">
          You can close this tab, or <Link href="/mcp">see how to connect an AI tool</Link>.
        </p>
      </Frame>
    );
  }

  if (!ready || !description) {
    return (
      <Frame>
        <h1 className="mcp-connect-title">Connecting&hellip;</h1>
        <p className="mcp-connect-sub">Checking who is asking.</p>
      </Frame>
    );
  }

  // Guests cannot connect a tool: the connection is tied to an account.
  const signedIn = Boolean(user && !user.isAnonymous);
  if (!signedIn) return <InspirationsLogin defaultMode="login" backHref="/" />;

  return (
    <Frame>
      <p className="mcp-connect-eyebrow">Connect to Motvin</p>
      <h1 className="mcp-connect-title">
        <strong>{description.client_name}</strong> wants to use your Motvin library
      </h1>
      <p className="mcp-connect-sub">
        Signed in as <strong>{user?.email || user?.displayName}</strong>.{' '}
        <button type="button" className="mcp-connect-link" onClick={() => signOut()} disabled={busy}>
          Not you?
        </button>
      </p>

      <ul className="mcp-connect-permissions">
        {description.permissions.map((permission) => (
          <li key={permission}>{permission}</li>
        ))}
        <li>It cannot change your account or anything you have saved.</li>
      </ul>

      <div className="mcp-connect-actions">
        <button type="button" className="mcp-connect-allow" onClick={() => decide('allow')} disabled={busy}>
          {busy ? 'Connecting…' : 'Allow'}
        </button>
        <button type="button" className="mcp-connect-deny" onClick={() => decide('deny')} disabled={busy}>
          Don&rsquo;t allow
        </button>
      </div>

      <p className="mcp-connect-hint">
        After you allow, you&rsquo;ll be sent back to <strong>{description.destination}</strong>. You can disconnect any
        time from the tool&rsquo;s own settings.
      </p>
    </Frame>
  );
}

/** Suspense is required because ConnectRoute reads `useSearchParams`. */
export function McpConnect() {
  return (
    <Suspense fallback={null}>
      <ConnectRoute />
    </Suspense>
  );
}
