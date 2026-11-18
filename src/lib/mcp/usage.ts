import { getIdToken } from '@/lib/firebase/auth';

/** Motvin MCP usage for the admin's MCP usage tab (admin only on the server). */

export interface McpUsageReport {
  days: { date: string; calls: number; people: number; errors: number; rateLimited: number; connections: number }[];
  totals: { calls: number; people: number; errors: number; rateLimited: number; connections: number };
  tools: { name: string; count: number }[];
  clients: { name: string; count: number }[];
  queries: { text: string; count: number }[];
}

function baseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configured) return `${configured.replace(/\/+$/, '')}/api/mcp/usage`;
  if (typeof window !== 'undefined') {
    const { hostname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return 'http://localhost:3000/api/mcp/usage';
  }
  return 'https://api.motvin.com/api/mcp/usage';
}

export async function getMcpUsage(days: number): Promise<McpUsageReport> {
  const token = await getIdToken();
  if (!token) throw new Error('You are signed out. Sign in again to continue.');
  const res = await fetch(`${baseUrl()}?days=${days}`, { headers: { Authorization: `Bearer ${token}` } });
  let payload: { success?: boolean; data?: McpUsageReport; message?: string } = {};
  try {
    payload = await res.json();
  } catch {
    // Non-JSON: the status below explains it.
  }
  if (!res.ok || payload.success === false || !payload.data) {
    throw new Error(payload.message || (res.status === 403 ? 'This account may not see MCP usage.' : `Request failed (${res.status})`));
  }
  return payload.data;
}
