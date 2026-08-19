import { NextRequest, NextResponse } from 'next/server';
import { getGamesByGenres } from '@/lib/steamspy';
import { getAppDetails } from '@/lib/steam';
import { analyzeIdea, AIUnavailableError, AIRateLimitError, AIInvalidResponseError, type AnalysisGame } from '@/lib/ai';
import { checkRateLimit } from '@/lib/ratelimit';
import type { AnalyzeFormData, AnalysisResponse } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 60; // seconds

/** Elapsed ms since `start`, formatted as "Xs" */
function elapsed(start: number) { return `${((Date.now() - start) / 1000).toFixed(1)}s`; }

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

export async function POST(req: NextRequest) {
  // Rate limiting
  const ip = getClientIp(req);
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        error: 'Too many requests. Please wait a minute before trying again.',
        resetInSeconds: Math.ceil(rateCheck.resetInMs / 1000),
      },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(rateCheck.resetInMs / 1000)) },
      }
    );
  }

  // Parse & validate body
  let body: AnalyzeFormData;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { genres, mechanics, story } = body;
  const platform = 'steam';

  if (!genres || genres.length === 0) {
    return NextResponse.json({ error: 'At least one genre is required' }, { status: 400 });
  }
  if (!mechanics || mechanics.trim().length < 10) {
    return NextResponse.json(
      { error: 'Core mechanics description must be at least 10 characters' },
      { status: 400 }
    );
  }

  try {
    const tStart = Date.now();

    // Step 1: Fetch real games from SteamSpy (with MongoDB cache)
    console.log(`[analyze] Step 1: SteamSpy fetch START`);
    const steamSpyGames = await getGamesByGenres(genres);
    console.log(`[analyze] Step 1: SteamSpy fetch DONE — ${steamSpyGames.length} games (${elapsed(tStart)})`);

    if (steamSpyGames.length === 0) {
      return NextResponse.json(
        { error: 'Could not fetch game data from SteamSpy. Please try again later.' },
        { status: 503 }
      );
    }

    // Step 2: Fetch Steam US descriptions for top 30 games only (AI context)
    // TR prices are NOT fetched here — only for the final AI-selected games later.
    const top30 = steamSpyGames.slice(0, 30);
    const appIds = top30.map((g) => g.appid);
    console.log(`[analyze] Step 2: Steam US description fetch START (${appIds.length} games)`);
    const steamDetailsUS = await getAppDetails(appIds, ['us']);
    console.log(`[analyze] Step 2: Steam US description fetch DONE (${elapsed(tStart)})`);

    // Step 3: Build enriched game list for AI
    const analysisGames: AnalysisGame[] = top30.map((g) => {
      const details = steamDetailsUS.get(g.appid);
      return {
        appid: g.appid,
        name: g.name,
        developer: g.developer,
        publisher: g.publisher,
        owners: g.owners,
        positive: g.positive,
        negative: g.negative,
        price_usd: g.price / 100,
        description: details?.us?.short_description ?? details?.us?.detailed_description?.slice(0, 300) ?? '',
        tags: Object.keys(g.tags ?? {}).slice(0, 10),
      };
    });

    // Build a lookup map: appid → real SteamSpy review counts
    const reviewLookup = new Map<number, { positive: number; negative: number }>();
    for (const g of steamSpyGames) {
      reviewLookup.set(g.appid, { positive: g.positive, negative: g.negative });
    }

    // Step 4: AI analysis — AI only sees the real game list
    console.log(`[analyze] Step 4: AI analysis START (${elapsed(tStart)})`);
    const aiResult = await analyzeIdea(genres, mechanics, story, platform, analysisGames);
    console.log(`[analyze] Step 4: AI analysis DONE (${elapsed(tStart)})`);

    // Step 5: Patch AI output — inject real review counts from SteamSpy source
    for (const game of aiResult.comparableGames) {
      const real = reviewLookup.get(game.appid);
      if (real) {
        game.positive = real.positive;
        game.negative = real.negative;
        const total = real.positive + real.negative;
        if (total > 0) {
          game.reviewScore = Math.round((real.positive / total) * 100);
        }
      }
    }

    // Step 6: Fetch TR prices ONLY for the final AI-selected games (≤8 games × 1 region)
    // This is the key optimisation: we no longer fetch TR prices for all 30 candidates.
    const finalAppIds = aiResult.comparableGames.map((g) => g.appid);
    console.log(`[analyze] Step 6: TR price fetch START (${finalAppIds.length} final games, ${elapsed(tStart)})`);
    const steamDetailsTR = await getAppDetails(finalAppIds, ['tr']);
    console.log(`[analyze] Step 6: TR price fetch DONE (${elapsed(tStart)})`);

    // Inject regional prices — US from phase-2 cache, TR from phase-6
    for (const game of aiResult.comparableGames) {
      const usDetails = steamDetailsUS.get(game.appid);
      const trDetails = steamDetailsTR.get(game.appid);
      game.price = {
        us: usDetails?.us?.price_overview,
        tr: trDetails?.tr?.price_overview,
      };
    }

    // Step 7: Compose response
    const response: AnalysisResponse = {
      ...aiResult,
      meta: {
        gamesInDatabase: steamSpyGames.length,
        genresQueried: genres,
        generatedAt: new Date().toISOString(),
      },
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error('[analyze] Error:', err);

    // 429 rate limit — tell the user to wait, not a generic error
    if (err instanceof AIRateLimitError) {
      return NextResponse.json(
        {
          error: `Too many requests right now — our AI provider is rate-limited. Please wait ${err.retryAfterSeconds} seconds and try again.`,
          retryAfterSeconds: err.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(err.retryAfterSeconds) },
        }
      );
    }

    // AI returned malformed/incomplete JSON — both providers failed schema validation
    if (err instanceof AIInvalidResponseError) {
      return NextResponse.json(
        { error: 'The analysis could not be completed (AI returned an invalid response). Please try again.' },
        { status: 503 }
      );
    }

    // Both providers completely unavailable
    if (err instanceof AIUnavailableError) {
      return NextResponse.json(
        { error: 'Analysis service is temporarily unavailable. Please try again in a few minutes.' },
        { status: 503 }
      );
    }

    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: `Analysis failed: ${message}` },
      { status: 500 }
    );
  }
}
