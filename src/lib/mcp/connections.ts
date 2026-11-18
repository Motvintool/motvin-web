import { getIdToken } from '@/lib/firebase/auth';
import { getClient, type McpClient } from './clients';

/**
 * The signed-in person's connected AI tools (Motvin MCP), for the settings
 * page: list them, disconnect one. Calls the backend with the person's
 * Firebase ID token, like the admin API does.
 */

export interface McpConnection {
  id: string;
  client_name: string;
  connected_at: string;
  last_used_at: string;
  /** Tool calls in the last 7 days. */
  calls_this_week: number;
}

function baseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configured) return `${configured.replace(/\/+$/, '')}/api/mcp/connections`;
  if (typeof window !== 'undefined') {
    const { hostname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return 'http://localhost:3000/api/mcp/connections';
  }
  return 'https://api.motvin.com/api/mcp/connections';
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getIdToken();
  if (!token) throw new Error('Sign in again to see your connected tools.');
  const res = await fetch(`${baseUrl()}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  let payload: { success?: boolean; data?: T; message?: string } = {};
  try {
    payload = await res.json();
  } catch {
    // Non-JSON: the status below still explains it.
  }
  if (!res.ok || payload.success === false) throw new Error(payload.message || `Request failed (${res.status})`);
  return payload.data as T;
}

/** The person's own Motvin MCP usage. */
export interface McpMyUsage {
  /** Calls in the current daily window; limit 0 means no daily limit. */
  today: { used: number; limit: number; resets_at: string | null };
  days: { date: string; calls: number }[];
  recent_searches: { query: string; tool: string; client: string | null; at: string }[];
}

export function getMyMcpUsage(): Promise<McpMyUsage> {
  return call<McpMyUsage>('/usage');
}

export function listMcpConnections(): Promise<McpConnection[]> {
  return call<McpConnection[]>('');
}

export function disconnectMcpConnection(id: string): Promise<{ id: string }> {
  return call<{ id: string }>(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function disconnectAllMcpConnections(): Promise<{ disconnected: number }> {
  return call<{ disconnected: number }>('', { method: 'DELETE' });
}

/**
 * A tool's own name without the server label some add on connect:
 * "Claude Code (motvin)" → "Claude Code".
 */
export function cleanToolName(name: string): string {
  return name.replace(/\s*[(\[]\s*motvin\s*[)\]]\s*$/i, '').replace(/\s*[-–—:]\s*motvin\s*$/i, '').trim() || name;
}

/** Which guide's tool a connection is, by its name, for the logo; "Other clients" when unknown. */
const TOOL_MATCH: [RegExp, string][] = [
  [/claude\s*code/i, 'claude-code'],
  [/claude/i, 'claude'],
  [/cursor/i, 'cursor'],
  [/chatgpt|openai/i, 'chatgpt'],
  [/codex/i, 'codex'],
  [/visual studio code|vs\s*code|vscode/i, 'vscode'],
  [/antigravity/i, 'antigravity-cli'],
  [/gemini/i, 'gemini-cli'],
  [/copilot/i, 'github-copilot-cli'],
  [/windsurf|codeium|devin/i, 'windsurf'],
  [/figma/i, 'figma'],
  [/replit/i, 'replit'],
];

export function toolFor(name: string): McpClient {
  const id = TOOL_MATCH.find(([pattern]) => pattern.test(name))?.[1] ?? 'other';
  return getClient(id) ?? (getClient('other') as McpClient);
}

/** "just now", "5 min ago", "2 hours ago", then whole days. */
export function usedAgo(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return 'recently';
  const minutes = Math.floor((Date.now() - ms) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}
