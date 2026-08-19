import { getMongoClientPromise } from './mongodb';

// SteamSpy genre → Steam genre query mapping
// We fetch from SteamSpy's genre endpoint (e.g. ?request=genre&genre=Indie)
// then filter results by checking per-game tags via appdetails.
// The broken `?request=tag` endpoint returns garbage (same bowling list for every tag).

// Map from our internal genre key → SteamSpy genre names to query from
const GENRE_TO_STEAMSPY_GENRE: Record<string, string[]> = {
  roguelike:         ['Indie', 'Strategy'],
  deckbuilder:       ['Indie', 'Strategy'],
  platformer:        ['Indie', 'Action'],
  rpg:               ['RPG'],
  puzzle:            ['Indie', 'Puzzle'],
  'action-roguelike':['Indie', 'Action'],
  metroidvania:      ['Indie', 'Action'],
  'turn-based':      ['Indie', 'Strategy', 'RPG'],
  survival:          ['Indie', 'Simulation'],
  horror:            ['Indie', 'Action'],
  adventure:         ['Adventure', 'Indie'],
  'visual-novel':    ['Indie'],
  simulation:        ['Simulation', 'Indie'],
  strategy:          ['Strategy', 'Indie'],
  'tower-defense':   ['Strategy', 'Indie'],
  'bullet-hell':     ['Indie', 'Action'],
};

// Map from our internal genre key → tag substrings to look for in SteamSpy game tags
// (case-insensitive substring match against tag key names returned by appdetails)
const GENRE_TO_TAG_KEYWORDS: Record<string, string[]> = {
  roguelike:         ['roguelike', 'rogue-like', 'rogue-lite', 'roguelite'],
  deckbuilder:       ['deck', 'card game', 'card battler'],
  platformer:        ['platformer', 'platform'],
  rpg:               ['rpg', 'role-playing'],
  puzzle:            ['puzzle'],
  'action-roguelike':['action roguelike', 'action rogue', 'roguelike', 'rogue-like'],
  metroidvania:      ['metroidvania', 'metroid'],
  'turn-based':      ['turn-based', 'turn based'],
  survival:          ['survival'],
  horror:            ['horror'],
  adventure:         ['adventure', 'point & click'],
  'visual-novel':    ['visual novel'],
  simulation:        ['simulation', 'simulator', 'management'],
  strategy:          ['strategy', 'rts', 'real-time strategy'],
  'tower-defense':   ['tower defense', 'tower defence'],
  'bullet-hell':     ['bullet hell', 'shoot \'em up', 'shmup'],
};

export interface SteamSpyGame {
  appid: number;
  name: string;
  developer: string;
  publisher: string;
  score_rank: string;
  positive: number;
  negative: number;
  userscore: number;
  owners: string;
  average_forever: number;
  average_2weeks: number;
  price: number;   // in cents (parsed from string)
  initialprice: number;
  discount: string;
  tags: Record<string, number>;
  genre?: string;
  languages?: string;
}

export interface CachedGenreData {
  genre: string;
  games: SteamSpyGame[];
  lastFetched: Date;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// ── Fetch all games for a SteamSpy genre ──────────────────────────────────────
async function fetchGenreFromSteamSpy(genre: string): Promise<SteamSpyGame[]> {
  const encodedGenre = encodeURIComponent(genre);
  const url = `https://steamspy.com/api.php?request=genre&genre=${encodedGenre}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[SteamSpy] genre endpoint returned ${res.status} for genre: ${genre}`);
      return [];
    }

    const data = await res.json();
    // Parse — genre endpoint does NOT include tags, price is a string
    return Object.values(data as Record<string, Record<string, unknown>>).map((g) => ({
      appid: Number(g.appid) || 0,
      name: String(g.name ?? ''),
      developer: String(g.developer ?? ''),
      publisher: String(g.publisher ?? ''),
      score_rank: String(g.score_rank ?? ''),
      positive: Number(g.positive) || 0,
      negative: Number(g.negative) || 0,
      userscore: Number(g.userscore) || 0,
      owners: String(g.owners ?? ''),
      average_forever: Number(g.average_forever) || 0,
      average_2weeks: Number(g.average_2weeks) || 0,
      price: parseInt(String(g.price ?? '0'), 10) || 0,
      initialprice: parseInt(String(g.initialprice ?? '0'), 10) || 0,
      discount: String(g.discount ?? '0'),
      tags: {},     // not returned by genre endpoint; filled from appdetails below
      genre: genre,
    }));
  } catch (err) {
    clearTimeout(timeout);
    console.error(`[SteamSpy] fetch error for genre "${genre}":`, err);
    return [];
  }
}

// ── Fetch tags for a single app via SteamSpy appdetails ───────────────────────
async function fetchAppDetailsTags(
  appid: number
): Promise<Record<string, number>> {
  const url = `https://steamspy.com/api.php?request=appdetails&appid=${appid}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return {};
    const data = await res.json();
    return (data?.tags as Record<string, number>) ?? {};
  } catch {
    clearTimeout(timeout);
    return {};
  }
}

// ── Check if a game's tags match any of the keyword list ─────────────────────
function gameMatchesKeywords(
  tags: Record<string, number>,
  keywords: string[]
): boolean {
  const tagKeys = Object.keys(tags).map((k) => k.toLowerCase());
  return keywords.some((kw) => tagKeys.some((t) => t.includes(kw)));
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function getGamesByGenres(genres: string[]): Promise<SteamSpyGame[]> {
  const t0 = Date.now();
  console.log(`[SteamSpy] ▶ getGamesByGenres START — genres: ${genres.join(', ')}`);

  const client = await getMongoClientPromise();
  const db = client.db('bearing');
  const cacheCol = db.collection<CachedGenreData>('steamspy_genre_cache');
  const tagCacheCol = db.collection<{ appid: number; tags: Record<string, number>; lastFetched: Date }>('steamspy_tag_cache');

  // ── Step 1: Collect all SteamSpy genres we need to query ─────────────────
  const steamspyGenresToFetch = new Set<string>();
  for (const g of genres) {
    const mapped = GENRE_TO_STEAMSPY_GENRE[g.toLowerCase()];
    if (mapped) mapped.forEach((sg) => steamspyGenresToFetch.add(sg));
    else steamspyGenresToFetch.add('Indie'); // fallback
  }

  // ── Step 2: Fetch/cache each SteamSpy genre list ─────────────────────────
  const genreGameMap = new Map<string, SteamSpyGame[]>();
  const now = new Date();

  for (const ssGenre of steamspyGenresToFetch) {
    const cached = await cacheCol.findOne({ genre: ssGenre });

    if (cached && now.getTime() - cached.lastFetched.getTime() < CACHE_TTL_MS) {
      genreGameMap.set(ssGenre, cached.games);
    } else {
      const fresh = await fetchGenreFromSteamSpy(ssGenre);
      if (fresh.length > 0) {
        // Trim to top 500 by positive reviews before caching — the Indie genre alone
        // has 6000+ entries which would exceed MongoDB's 16MB document limit
        const toCache = fresh
          .filter((g) => g.positive > 0)
          .sort((a, b) => b.positive - a.positive)
          .slice(0, 500);
        await cacheCol.updateOne(
          { genre: ssGenre },
          { $set: { genre: ssGenre, games: toCache, lastFetched: now } },
          { upsert: true }
        );
        genreGameMap.set(ssGenre, toCache);

      } else if (cached) {
        genreGameMap.set(ssGenre, cached.games);
      }
    }
  }

  console.log(`[SteamSpy] ✓ Genre fetch done in ${Date.now() - t0}ms (${steamspyGenresToFetch.size} genres queried)`);

  // ── Step 3: Build candidate pool — union of all genre lists, de-dup by appid ──
  const candidateMap = new Map<number, SteamSpyGame>();
  for (const games of genreGameMap.values()) {
    for (const g of games) {
      if (g.appid && !candidateMap.has(g.appid)) {
        candidateMap.set(g.appid, g);
      }
    }
  }

  // ── Step 4: Sort candidates by positive reviews, take top 50 for tag enrichment ──
  // (We pass top 30 to AI — 50 candidates give enough filtering headroom while
  //  keeping cold-start tag-fetch time well under 15s)
  const topCandidates = Array.from(candidateMap.values())
    .filter((g) => g.name && g.positive > 100)
    .sort((a, b) => b.positive - a.positive)
    .slice(0, 50);

  console.log(`[SteamSpy] ✓ Candidate pool: ${topCandidates.length} games (${Date.now() - t0}ms elapsed)`);

  // ── Step 5: Enrich with tags (from cache or fresh appdetails) ─────────────
  const tEnrich = Date.now();
  const ENRICH_CONCURRENCY = 10;
  for (let i = 0; i < topCandidates.length; i += ENRICH_CONCURRENCY) {
    const batch = topCandidates.slice(i, i + ENRICH_CONCURRENCY);
    await Promise.all(
      batch.map(async (game) => {
        // Check tag cache first
        const cachedTags = await tagCacheCol.findOne({ appid: game.appid });
        if (cachedTags && now.getTime() - cachedTags.lastFetched.getTime() < CACHE_TTL_MS * 4) {
          game.tags = cachedTags.tags;
        } else {
          const tags = await fetchAppDetailsTags(game.appid);
          if (Object.keys(tags).length > 0) {
            game.tags = tags;
            await tagCacheCol.updateOne(
              { appid: game.appid },
              { $set: { appid: game.appid, tags, lastFetched: now } },
              { upsert: true }
            );
          }
        }
      })
    );
    // Short polite delay between batches
    if (i + ENRICH_CONCURRENCY < topCandidates.length) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  console.log(`[SteamSpy] ✓ Tag enrichment done in ${Date.now() - tEnrich}ms (${topCandidates.length} games)`);

  // ── Step 6: Score & filter by tag relevance ────────────────────────────────
  // A game gets +1 point for each selected genre it matches.
  // Games matching ALL selected genres rank first (intersection priority).
  const tagMatched: SteamSpyGame[] = [];
  const untagged: SteamSpyGame[] = []; // tags not yet fetched (empty {})

  for (const game of topCandidates) {
    const hasAnyTags = Object.keys(game.tags).length > 0;
    if (!hasAnyTags) {
      // Tags not available yet — put in secondary pool
      untagged.push(game);
      continue;
    }

    let matchCount = 0;
    for (const g of genres) {
      const keywords = GENRE_TO_TAG_KEYWORDS[g.toLowerCase()] ?? [g.toLowerCase()];
      if (gameMatchesKeywords(game.tags, keywords)) {
        matchCount++;
      }
    }
    if (matchCount > 0) {
      tagMatched.push({ ...game, _matchCount: matchCount } as SteamSpyGame & { _matchCount: number });
    }
  }

  // Sort tag-matched by matchCount desc then positive reviews desc
  tagMatched.sort((a, b) => {
    const ma = (a as SteamSpyGame & { _matchCount: number })._matchCount ?? 0;
    const mb = (b as SteamSpyGame & { _matchCount: number })._matchCount ?? 0;
    if (mb !== ma) return mb - ma;
    return b.positive - a.positive;
  });

  // Build final list: tag-matched first, fill with untagged (high-review games)
  const result = [
    ...tagMatched,
    ...untagged.sort((a, b) => b.positive - a.positive),
  ];

  if (tagMatched.length === 0) {
    console.warn(
      `[SteamSpy] No tag-matched games found (tags may still be fetching). Returning unfiltered pool.`
    );
  } else {
    console.log(
      `[SteamSpy] ✓ ${tagMatched.length} tag-matched games (out of ${topCandidates.length} candidates) for genres: ${genres.join(', ')}`
    );
  }

  // Return top 150 for AI context
  const finalResult = result.slice(0, 150);
  console.log(`[SteamSpy] ▶ getGamesByGenres DONE — ${finalResult.length} games returned in ${Date.now() - t0}ms total`);
  return finalResult;

}

/** Parse SteamSpy owners range to a human-readable estimate */
export function parseOwnersRange(owners: string): {
  low: number;
  high: number;
  label: string;
} {
  const parts = owners.replace(/,/g, '').split('..');
  const low = parseInt(parts[0]?.trim() ?? '0', 10) || 0;
  const high = parseInt(parts[1]?.trim() ?? '0', 10) || low;

  const fmt = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return String(n);
  };

  return { low, high, label: `${fmt(low)}–${fmt(high)}` };
}

/** Estimate revenue: midpoint owners × price, rough only */
export function estimateRevenue(
  owners: string,
  priceUsdCents: number
): string {
  const { low, high } = parseOwnersRange(owners);
  const mid = (low + high) / 2;
  const priceUsd = priceUsdCents / 100;
  const gross = mid * priceUsd * 0.7; // Steam 30% cut
  const fmt = (n: number) => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  };
  return `~${fmt(gross)} (rough estimate)`;
}

export const AVAILABLE_GENRES = Object.keys(GENRE_TO_STEAMSPY_GENRE);
