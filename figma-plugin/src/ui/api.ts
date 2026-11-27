import type { Session } from '../shared';
import { sha256Hex } from './sha256';

/**
 * Talking to the Motvin API from the panel: the plugin's sign-in session,
 * refreshing it, JSON calls and image downloads. The routes are the backend's
 * /api/figma/* (motvin-backend src/modules/figma/figma.controller.ts); tokens
 * are refreshed and revoked at the MCP authorization server, because the
 * plugin's connection is an ordinary Motvin MCP connection.
 */

declare const __MOTVIN_API__: string;
declare const __MOTVIN_SITE__: string;

export const API = __MOTVIN_API__;
export const SITE = __MOTVIN_SITE__;

/** A public image on the API, such as an app logo: no sign-in needed, so a plain <img src> works. */
export const asset = (path: string) => `${API}${path}`;

/** Signed out, or the sign-in can no longer be renewed: the panel goes back to its sign-in screen. */
export class SignedOutError extends Error {}

let session: Session | null = null;
let onChange: (session: Session | null) => void = () => {};

export function attachSession(initial: Session | null, changed: (session: Session | null) => void) {
  session = initial;
  onChange = changed;
}

function setSession(next: Session | null) {
  session = next;
  onChange(next);
}

type TokenBody = { access_token: string; refresh_token: string; expires_in: number; email?: string; client_id?: string };

function toSession(body: TokenBody, previous?: Session): Session {
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: Date.now() + body.expires_in * 1000,
    email: body.email ?? previous?.email ?? '',
    client_id: body.client_id ?? previous?.client_id ?? '',
  };
}

// ───────────────────────────────────────────────────────────── sign-in

export interface Pairing {
  /** The page the person approves on. */
  url: string;
  /** Shown here and on that page, to compare. */
  code: string;
  /** Resolves once approved; rejects when cancelled or after ten minutes. */
  done: Promise<Session>;
  cancel: () => void;
}

/**
 * Starts signing in: a secret key stays here, only its hash goes in the link.
 * The approval page parks the tokens under that hash; asking with the key
 * every two seconds collects them (motvin-backend figma-pairing.service.ts).
 */
export function startPairing(): Pairing {
  const random = crypto.getRandomValues(new Uint8Array(32));
  const key = Array.from(random, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const pair = sha256Hex(key);
  const code = `${pair.slice(0, 3)}-${pair.slice(3, 6)}`.toUpperCase();
  let cancelled = false;
  const deadline = Date.now() + 10 * 60 * 1000;

  const done = (async () => {
    while (!cancelled && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (cancelled) break;
      try {
        const response = await fetch(`${API}/api/figma/pair/claim`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key }),
        });
        const body = await response.json();
        if (body?.data?.status === 'ready') {
          const next = toSession(body.data);
          setSession(next);
          return next;
        }
      } catch {
        // Offline for a moment: keep asking until the deadline.
      }
    }
    throw new Error(cancelled ? 'Cancelled' : 'Sign-in timed out. Try again.');
  })();

  return { url: `${SITE}/figma/connect?pair=${pair}`, code, done, cancel: () => (cancelled = true) };
}

export async function signOut() {
  const ending = session;
  setSession(null);
  if (!ending) return;
  // Disconnects the whole connection on the server, not just this copy of it.
  await fetch(`${API}/api/mcp/oauth/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: ending.refresh_token }),
  }).catch(() => undefined);
}

let refreshing: Promise<Session> | null = null;

/**
 * A new access token. Refresh tokens are single-use (the old one dies when
 * used), so concurrent callers share one refresh instead of racing.
 */
function refresh(): Promise<Session> {
  if (!refreshing) {
    const current = session;
    refreshing = (async () => {
      if (!current) throw new SignedOutError('Signed out');
      const response = await fetch(`${API}/api/mcp/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: current.refresh_token, client_id: current.client_id }),
      });
      if (!response.ok) {
        setSession(null);
        throw new SignedOutError('Your Motvin sign-in has ended. Sign in again.');
      }
      const next = toSession(await response.json(), current);
      setSession(next);
      return next;
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

/**
 * A call to the API. Browsing works signed out; signed in, it carries the
 * token, refreshed when it is about to run out or was refused. `signedIn`
 * calls (images for the canvas) throw SignedOutError without a sign-in, which
 * the panel answers by asking the person to sign in.
 */
async function call(path: string, signedIn: boolean): Promise<Response> {
  const anonymous = () => fetch(`${API}${path}`);
  if (!session) {
    if (signedIn) throw new SignedOutError('Sign in to add screens to your canvas.');
    return anonymous();
  }
  let current: Session;
  try {
    current = session.expires_at - Date.now() < 60_000 ? await refresh() : session;
  } catch (error) {
    // The sign-in could not be renewed: browsing goes on signed out.
    if (!signedIn && error instanceof SignedOutError) return anonymous();
    throw error;
  }
  let response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${current.access_token}` } });
  if (response.status === 401) {
    try {
      const renewed = await refresh();
      response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${renewed.access_token}` } });
    } catch (error) {
      if (!signedIn && error instanceof SignedOutError) return anonymous();
      throw error;
    }
    if (response.status === 401) {
      setSession(null);
      if (!signedIn) return anonymous();
      throw new SignedOutError('Your Motvin sign-in has ended. Sign in again.');
    }
  }
  return response;
}

export async function getJson<T>(path: string): Promise<T> {
  const response = await call(path, false);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) throw new Error(body.message || `Motvin answered ${response.status}`);
  return body.data as T;
}

export async function getBytes(path: string, signedIn = true): Promise<Uint8Array> {
  const response = await call(path, signedIn);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || `Could not download the image (${response.status})`);
  }
  return new Uint8Array(await response.arrayBuffer()) as Uint8Array<ArrayBuffer>;
}

// ──────────────────────────────────────────────────────────── thumbnails

const thumbs = new Map<string, Promise<string>>();
const waiting: (() => void)[] = [];
let running = 0;
const PARALLEL = 6;

async function slot<T>(run: () => Promise<T>): Promise<T> {
  if (running >= PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve));
  running += 1;
  try {
    return await run();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

/** A thumbnail as an object URL, fetched with the sign-in when there is one (so a plain <img src> is not used). */
export function thumbnail(id: string): Promise<string> {
  let url = thumbs.get(id);
  if (!url) {
    url = slot(async () => URL.createObjectURL(new Blob([(await getBytes(`/api/figma/thumb/${encodeURIComponent(id)}`, false)) as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' })));
    // A failed one is tried again next time it is shown.
    url.catch(() => thumbs.delete(id));
    thumbs.set(id, url);
  }
  return url;
}

/** Every part of a screen's image, top to bottom, a few at a time. */
export function screenParts(id: string, parts: number): Promise<Uint8Array[]> {
  return Promise.all(Array.from({ length: parts }, (_, part) => slot(() => getBytes(`/api/figma/image/${encodeURIComponent(id)}?part=${part}`))));
}
