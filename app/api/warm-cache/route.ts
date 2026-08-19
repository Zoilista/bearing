import { NextRequest, NextResponse } from 'next/server';
import { ALL_STEAMSPY_GENRES, warmSingleSteamSpyGenre } from '@/lib/steamspy';

// ── Warm-cache strategy ────────────────────────────────────────────────────────
//
// We warm individual SteamSpy genre LEAF NODES (e.g. "Strategy", "Indie", "RPG")
// rather than user-facing combinations.  This is correct because:
//
//   • steamspy_genre_cache is already keyed by leaf node, not by combination.
//   • A user selecting [turn-based + strategy] needs Indie+Strategy+RPG warmed —
//     all three are leaf nodes.  Once every leaf is warm, ANY combination of
//     user genres that maps to those leaves is served entirely from cache.
//
// ALL_STEAMSPY_GENRES is the deduplicated union of every value in
// GENRE_TO_STEAMSPY_GENRE — currently: Action, Adventure, Indie, Puzzle,
// RPG, Simulation, Strategy.
//
// Vercel Hobby functions time out at 10 s.  Fetching one cold genre list
// (SteamSpy genre endpoint) can take ~3-5 s; enriching 50 tags at 10/batch
// is ~6-8 s cold.  We therefore process ONE leaf node per cron run and rely
// on the daily schedule to rotate through all of them over ~a week.
//
// Round-robin: pick batch index = dayOfYear % totalLeafNodes.
// With 7 leaf nodes and a daily cron this covers all nodes within 7 days.
// Tags are cached for 7 days so the system stays perpetually warm.

function dayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / 86_400_000);
}

export async function GET(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured on the server.' },
      { status: 500 }
    );
  }

  const isAuthorized =
    authHeader === `Bearer ${expectedSecret}` || querySecret === expectedSecret;

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Round-robin genre selection ───────────────────────────────────────────
  // Allow ?genre=Strategy override for manual / ad-hoc warming
  const overrideGenre = request.nextUrl.searchParams.get('genre');
  const allGenres = [...ALL_STEAMSPY_GENRES]; // e.g. ["Action","Adventure","Indie","Puzzle","RPG","Simulation","Strategy"]

  const targetGenre = overrideGenre && allGenres.includes(overrideGenre as typeof ALL_STEAMSPY_GENRES[number])
    ? overrideGenre
    : allGenres[dayOfYear() % allGenres.length];

  console.log(
    `[warm-cache] Starting — target leaf: "${targetGenre}" ` +
    `(day=${dayOfYear()}, total leaves=${allGenres.length})`
  );

  // ── Warm ──────────────────────────────────────────────────────────────────
  try {
    const gamesWarmed = await warmSingleSteamSpyGenre(targetGenre);

    return NextResponse.json({
      success: true,
      message: `Warmed SteamSpy genre "${targetGenre}".`,
      targetGenre,
      gamesWarmed,
      allLeafGenres: allGenres,
      dayOfYear: dayOfYear(),
      nextGenre: allGenres[(dayOfYear() + 1) % allGenres.length],
    });
  } catch (error) {
    console.error('[warm-cache] Error during pre-warming:', error);
    return NextResponse.json(
      { error: 'Failed to warm cache.', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
