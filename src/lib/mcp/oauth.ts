/**
 * Where the MCP authorization server lives, resolved the same way
 * `lib/inspirations/api.ts` resolves the Inspirations API: the configured
 * backend, else the local backend when the page itself is on localhost, else
 * production.
 */
export function mcpOAuthBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configured) return `${configured.replace(/\/+$/, '')}/api/mcp/oauth`;
  if (typeof window !== 'undefined') {
    const { hostname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return 'http://localhost:3000/api/mcp/oauth';
  }
  return 'https://api.motvin.com/api/mcp/oauth';
}

/** The address a person pastes into their AI tool: the MCP endpoint on the same backend. */
export function mcpServerUrl(): string {
  return mcpOAuthBase().replace(/\/oauth$/, '');
}

export type ConnectionRequest = {
  client_name: string;
  /** Where the person is sent after deciding: a host, or a custom scheme like `cursor://`. */
  destination: string;
  scope: string;
  permissions: string[];
};

type OAuthFailure = { error?: string; error_description?: string };

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as { success?: boolean; data?: T } & OAuthFailure;
  if (!response.ok || body.success === false) {
    throw new Error(body.error_description || 'The connection request could not be read.');
  }
  return body.data as T;
}

/** Who is asking to connect, from the signed request the backend put in the URL. */
export async function describeConnection(request: string): Promise<ConnectionRequest> {
  const response = await fetch(`${mcpOAuthBase()}/request?request=${encodeURIComponent(request)}`, { cache: 'no-store' });
  return readJson<ConnectionRequest>(response);
}

/** The person's decision. Resolves to the URL that sends them back to their AI tool. */
export async function decideConnection(
  request: string,
  decision: 'allow' | 'deny',
  idToken: string | null,
): Promise<string> {
  const response = await fetch(`${mcpOAuthBase()}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request, decision, idToken: idToken ?? undefined }),
  });
  const data = await readJson<{ redirectTo: string }>(response);
  return data.redirectTo;
}
