import { getIdToken } from '@/lib/firebase/auth';
import type { Industry, Platform, ScreenType, Style } from './types';

/**
 * Client for the Inspirations admin API.
 *
 * Every call carries the signed-in user's Firebase ID token; the backend
 * verifies it and checks the email against its allowlist. The constant below
 * only decides what the browser bothers to show — it is not what grants
 * access, and editing it in devtools changes nothing server-side.
 */

/** Accounts the UI offers the admin area to. The server decides for real. */
export const ADMIN_EMAILS = ['surendarv638@gmail.com'];

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

function baseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configured) return `${configured.replace(/\/+$/, '')}/api/inspirations/admin`;
  if (typeof window !== 'undefined') {
    const { hostname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:3000/api/inspirations/admin';
    }
  }
  return 'https://api.motvin.com/api/inspirations/admin';
}

export class AdminApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
  }
}

async function authHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const token = await getIdToken();
  if (!token) throw new AdminApiError('You are signed out. Sign in again to continue.', 401);
  return { Authorization: `Bearer ${token}`, ...extra };
}

async function unwrap<T>(res: Response): Promise<T> {
  let payload: { success?: boolean; data?: T; message?: string; error?: string } = {};
  try {
    payload = await res.json();
  } catch {
    // An empty or non-JSON body still needs a readable message below.
  }
  if (!res.ok || payload.success === false) {
    const message =
      payload.message ||
      payload.error ||
      (res.status === 401
        ? 'Sign-in could not be verified.'
        : res.status === 403
          ? 'This account may not administer the library.'
          : `Request failed (${res.status})`);
    throw new AdminApiError(message, res.status);
  }
  return payload.data as T;
}

export type BuildReport = {
  counts: Record<string, number>;
  skipped: { appId: string; platform: string; count: number; reason: string }[];
  warnings: string[];
  problems: string[];
};

/** What `deleteApp` actually removed from the store. */
export type RemovedSummary = {
  app: boolean;
  screens: number;
  analysis: number;
  flows: number;
  logo: string | null;
  source: boolean;
};

export type AdminScreenFile = {
  id: string;
  platform: Platform;
  appId: string;
  file: string;
  bytes: number;
  width: number | null;
  height: number | null;
  sidecar: ScreenSidecar | null;
  published: boolean;
  blockedReason: string | null;
};

export type ScreenSidecar = {
  name?: string;
  screenType?: ScreenType;
  tags?: string[];
  elements?: string[];
  style?: Style[];
  capturedAt?: string;
};

export type AdminAppRecord = {
  id: string;
  name: string;
  industry: Industry;
  website?: string;
  tagline?: string;
  logo?: string;
};

export type AdminSourceRecord = {
  sourceUrl?: string;
  capturedAt?: string;
  capturedBy?: string;
  permission?: string;
  license?: string;
  licenseUrl?: string;
  attribution?: string;
  redistribution?: 'allowed' | 'view-only';
  status?: 'pending' | 'review' | 'approved' | 'rejected';
  notes?: string;
};

export type AdminFlowRecord = {
  id: string;
  appId: string;
  name: string;
  category: string;
  platform: Platform;
  screenIds: string[];
};

export type AdminState = {
  apps: AdminAppRecord[];
  sources: Record<string, AdminSourceRecord>;
  flows: AdminFlowRecord[];
  files: AdminScreenFile[];
  logos: string[];
  counts: Record<string, number>;
  generatedAt: string | null;
  vocabulary: {
    platforms: Platform[];
    screenTypes: ScreenType[];
    industries: Industry[];
    styles: Style[];
    flowCategories: string[];
    permissions: string[];
    reviewStatuses: string[];
  };
};

const CONTENT_TYPES: Record<string, string> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  avif: 'image/avif',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};

function contentTypeFor(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

/** Lower-cases and strips anything the backend's path rules would reject. */
export function safeFileName(name: string): string {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return ext ? `${base || 'screen'}.${ext}` : base || 'screen';
}

export const adminApi = {
  /** Confirms with the server that this account really is an admin. */
  async session(): Promise<{ admin: { uid: string; email: string } }> {
    const res = await fetch(`${baseUrl()}/session`, { headers: await authHeaders() });
    return unwrap(res);
  },

  async getState(): Promise<AdminState> {
    const res = await fetch(`${baseUrl()}/state`, { headers: await authHeaders() });
    return unwrap(res);
  },

  async rebuild(): Promise<BuildReport> {
    const res = await fetch(`${baseUrl()}/rebuild`, { method: 'POST', headers: await authHeaders() });
    return unwrap(res);
  },

  async uploadScreen(
    platform: Platform,
    appId: string,
    fileName: string,
    file: Blob,
    overwrite = false,
  ): Promise<{ id: string; file: string; width: number; height: number; report: BuildReport }> {
    const name = safeFileName(fileName);
    const res = await fetch(
      `${baseUrl()}/screens/${platform}/${appId}/${name}${overwrite ? '?overwrite=1' : ''}`,
      {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': contentTypeFor(name) }),
        body: file,
      },
    );
    return unwrap(res);
  },

  async uploadLogo(appId: string, fileName: string, file: Blob): Promise<{ logo: string }> {
    const ext = safeFileName(fileName).split('.').pop() ?? 'png';
    const name = `${appId}.${ext}`;
    const res = await fetch(`${baseUrl()}/logos/${appId}/${name}`, {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': contentTypeFor(name) }),
      body: file,
    });
    return unwrap(res);
  },

  async saveScreenMeta(
    platform: Platform,
    appId: string,
    fileName: string,
    meta: ScreenSidecar,
  ): Promise<{ id: string; report: BuildReport }> {
    const res = await fetch(`${baseUrl()}/screens/${platform}/${appId}/${fileName}/meta`, {
      method: 'PUT',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(meta),
    });
    return unwrap(res);
  },

  async deleteScreen(platform: Platform, appId: string, fileName: string): Promise<{ report: BuildReport }> {
    const res = await fetch(`${baseUrl()}/screens/${platform}/${appId}/${fileName}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
    return unwrap(res);
  },

  async saveApp(app: AdminAppRecord): Promise<{ app: AdminAppRecord; report: BuildReport }> {
    const res = await fetch(`${baseUrl()}/apps/${app.id}`, {
      method: 'PUT',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(app),
    });
    return unwrap(res);
  },

  async deleteApp(appId: string): Promise<{ removed: RemovedSummary; report: BuildReport }> {
    const res = await fetch(`${baseUrl()}/apps/${appId}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
    return unwrap(res);
  },

  async saveSource(appId: string, source: AdminSourceRecord): Promise<{ report: BuildReport }> {
    const res = await fetch(`${baseUrl()}/sources/${appId}`, {
      method: 'PUT',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(source),
    });
    return unwrap(res);
  },

  async saveFlow(flow: AdminFlowRecord): Promise<{ report: BuildReport }> {
    const res = await fetch(`${baseUrl()}/flows/${flow.id}`, {
      method: 'PUT',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(flow),
    });
    return unwrap(res);
  },

  async deleteFlow(flowId: string): Promise<{ report: BuildReport }> {
    const res = await fetch(`${baseUrl()}/flows/${flowId}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
    return unwrap(res);
  },
};
