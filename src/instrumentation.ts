/**
 * Runs once when the server starts: picks up a batch of uploads that was under
 * way before a restart, so it carries on without anyone opening a page.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startBatchRunner } = await import('@/lib/server/batch');
  startBatchRunner();
}
