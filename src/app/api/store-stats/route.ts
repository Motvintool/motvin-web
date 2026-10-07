import { NextResponse } from 'next/server';
import { getStoreStats } from '@/lib/inspirations/storeStats';

export const revalidate = 86400;

/** GET /api/store-stats?name=Spotify&platform=ios|android */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get('name')?.trim();
  const platform = searchParams.get('platform') === 'android' ? 'android' : 'ios';
  if (!name || name.length > 80) return NextResponse.json({ error: 'name required' }, { status: 400 });
  const stats = await getStoreStats(name, platform);
  return NextResponse.json(stats, { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } });
}
