import { NextRequest, NextResponse } from 'next/server';
import { getGamesByGenres } from '@/lib/steamspy';
import { getAppDetails } from '@/lib/steam';
import { analyzeIdea, AIUnavailableError, AIRateLimitError, AIInvalidResponseError, type AnalysisGame } from '@/lib/ai';
import { checkRateLimit } from '@/lib/ratelimit';
import type { AnalyzeFormData, AnalysisResponse } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 60; // seconds

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

  const { genres, mechanics, story, platform } = body;

  if (!genres || genres.length === 0) {
    return NextResponse.json({ error: 'At least one genre is required' }, { status: 400 });
  }
  if (!mechanics || mechanics.trim().length < 10) {
    return NextResponse.json(
      { error: 'Core mechanics description must be at least 10 characters' },
      { status: 400 }
    );
  }
  if (!platform) {
    return NextResponse.json({ error: 'Target platform is required' }, { status: 400 });
  }

  try {
    // Step 1: Fetch real games from SteamSpy (with MongoDB cache)
    const steamSpyGames = await getGamesByGenres(genres);

    if (steamSpyGames.length === 0) {
      return NextResponse.json(
        { error: 'Could not fetch game data from SteamSpy. Please try again later.' },
        { status: 503 }
      );
    }

    // Step 2: Fetch Steam descriptions for the top 30 games (to keep AI context manageable)
    const top30 = steamSpyGames.slice(0, 30);
    const appIds = top30.map((g) => g.appid);
    const steamDetails = await getAppDetails(appIds);

    // Step 3: Build enriched game list for AI
    const analysisGames: AnalysisGame[] = top30.map((g) => {
      const details = steamDetails.get(g.appid);
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
    // Used to override AI output (AI tends to echo 0 for numeric fields)
    const reviewLookup = new Map<number, { positive: number; negative: number }>();
    for (const g of steamSpyGames) {
      reviewLookup.set(g.appid, { positive: g.positive, negative: g.negative });
    }

    // Step 4: AI analysis — AI only sees the real game list
    const aiResult = await analyzeIdea(genres, mechanics, story, platform, analysisGames);

    // Step 5: Patch AI output — inject real review counts from SteamSpy source
    // (prevents AI from returning positive:0 / negative:0)
    for (const game of aiResult.comparableGames) {
      const real = reviewLookup.get(game.appid);
      if (real) {
        game.positive = real.positive;
        game.negative = real.negative;
        // Recompute reviewScore from real numbers
        const total = real.positive + real.negative;
        if (total > 0) {
          game.reviewScore = Math.round((real.positive / total) * 100);
        }
      }

      // Inject live regional prices from Steam cache
      const details = steamDetails.get(game.appid);
      if (details) {
        game.price = {
          us: details.us?.price_overview,
          tr: details.tr?.price_overview,
        };
      }
    }

    // Step 6: Compose response
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
