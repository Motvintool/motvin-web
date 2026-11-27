import { mcpOAuthBase } from '@/lib/mcp/oauth';

/**
 * Signing in the Figma plugin ("Motvin — Inspiration").
 *
 * The plugin opens /figma/connect?pair=… in the browser, where `pair` is the
 * hash of a secret only the plugin holds. Approving posts the pair and the
 * person's Firebase ID token to the backend, which keeps the plugin's tokens
 * for it to collect; this page never sees them.
 */

/** The plugin API, on the same backend as the MCP authorization server. */
export function figmaApiBase(): string {
  return mcpOAuthBase().replace(/\/mcp\/oauth$/, '/figma');
}

export const PAIR_PATTERN = /^[0-9a-f]{64}$/;

/** The code the plugin shows beside its "waiting for approval" message: the pair's first six characters, as ABC-123. */
export function pairCode(pair: string): string {
  const code = pair.slice(0, 6).toUpperCase();
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

export async function approvePair(pair: string, idToken: string): Promise<{ code: string; email: string }> {
  const response = await fetch(`${figmaApiBase()}/pair/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pair, idToken }),
  });
  const body = (await response.json().catch(() => ({}))) as { success?: boolean; data?: { code: string; email: string }; message?: string };
  if (!response.ok || body.success === false || !body.data) {
    throw new Error(body.message || 'The plugin could not be connected. Try again from Figma.');
  }
  return body.data;
}
