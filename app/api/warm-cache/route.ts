import { NextRequest, NextResponse } from 'next/server';
import { getGamesByGenres } from '@/lib/steamspy';

// Top 2 most-queried genre combinations kept warm on the Hobby plan.
// Vercel Hobby functions time out at 10 s — fetching all 6 combinations
// would likely exceed that. The remaining combinations are generated on
// first user request (acceptable latency for rare queries).
const WARMUP_COMBINATIONS = [
  ['roguelike', 'deckbuilder'],
  ['horror', 'survival'],
];

export async function GET(request: NextRequest) {
  // Simple protection: Verify CRON_SECRET matches either query param or Authorization header
  // Vercel Cron sends the secret in the Authorization header: `Bearer <CRON_SECRET>`
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured on the server.' }, { status: 500 });
  }

  const isAuthorized =
    authHeader === `Bearer ${expectedSecret}` || querySecret === expectedSecret;

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[warm-cache] Starting best-effort cache pre-warming (top 2 combinations)...');
  let totalCached = 0;

  try {
    for (const genres of WARMUP_COMBINATIONS) {
      console.log(`[warm-cache] Fetching games for: ${genres.join(', ')}`);
      // This will hit the SteamSpy API (and Steam Store API for tags) 
      // if not cached, or do nothing if already cached.
      const games = await getGamesByGenres(genres);
      totalCached += games.length;
    }

    return NextResponse.json({
      success: true,
      message: 'Cache warmed successfully.',
      combinationsWarmed: WARMUP_COMBINATIONS.length,
      totalGamesProcessed: totalCached,
    });
  } catch (error) {
    console.error('[warm-cache] Error during pre-warming:', error);
    return NextResponse.json(
      { error: 'Failed to warm cache completely.' },
      { status: 500 }
    );
  }
}
