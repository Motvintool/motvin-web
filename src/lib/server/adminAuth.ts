/**
 * Who may drive the crawler from the web: the same account the backend
 * accepts as the library's admin.
 *
 * Authorization is delegated, not reimplemented. The caller's Firebase token
 * is passed to the backend's own admin session endpoint, and only a 200 from
 * there lets the work start — so these routes can never become a second,
 * weaker door into the same store.
 */

export function backendBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, '');
  return configured || 'http://localhost:3000';
}

export function fail(message: string, status: number) {
  return Response.json({ success: false, message }, { status });
}

export async function verifyAdmin(request: Request): Promise<{ email: string } | null> {
  const authorization = request.headers.get('authorization');
  if (!authorization) return null;

  try {
    const res = await fetch(`${backendBase()}/api/inspirations/admin/session`, {
      headers: { Authorization: authorization },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as { data?: { admin?: { email?: string } } };
    const email = payload.data?.admin?.email;
    return email ? { email } : null;
  } catch {
    return null;
  }
}
