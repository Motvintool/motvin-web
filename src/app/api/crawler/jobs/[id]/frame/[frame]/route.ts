import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fail, verifyAdmin } from '@/lib/server/adminAuth';
import { reviewThumbnailPath } from '@/lib/server/ingestJobs';

/**
 * GET /api/crawler/jobs/:id/frame/:frame — one captured screen's picture,
 * sized for the review grid, while its run is still `awaiting-review`.
 *
 * These frames sit in the crawler's own staging dir, never in the public
 * store — nothing here has been classified yet, let alone published — so
 * they are read straight off disk rather than through the Inspirations
 * screens API, and only for a frame the job itself reported capturing. The
 * grid gets a small cached JPEG rather than the device's own full-size
 * extract; see `reviewThumbnailPath`.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string; frame: string }> }) {
  const admin = await verifyAdmin(request);
  if (!admin) return fail('This account may not administer the library.', 403);
  const { id, frame } = await context.params;
  const frameNumber = Number(frame);
  if (!Number.isInteger(frameNumber) || frameNumber < 1) return fail('Not a frame.', 400);

  const path = await reviewThumbnailPath(id, frameNumber);
  if (!path) return fail('That screen is no longer available for review.', 404);

  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    return fail('That screen could not be read.', 404);
  }

  const stream = createReadStream(path);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on('data', (chunk) => controller.enqueue(chunk as Uint8Array));
      stream.on('end', () => controller.close());
      stream.on('error', (error) => controller.error(error));
    },
    cancel() {
      stream.destroy();
    },
  });

  return new Response(body, {
    headers: {
      'Content-Type': path.endsWith('.jpg') ? 'image/jpeg' : 'image/png',
      'Content-Length': String(size),
      // A review frame never changes once written, but it also never
      // outlives its run — no point letting a stale copy linger past it.
      'Cache-Control': 'private, max-age=300',
    },
  });
}
