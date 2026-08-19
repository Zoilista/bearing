export interface SteamAppDetails {
  appid: number;
  name: string;
  short_description: string;
  detailed_description: string;
  developers: string[];
  publishers: string[];
  price_overview?: {
    currency: string;
    initial: number;
    final: number;
    discount_percent: number;
  };
  release_date?: {
    coming_soon: boolean;
    date: string;
  };
  recommendations?: {
    total: number;
  };
  categories?: Array<{ id: number; description: string }>;
  genres?: Array<{ id: string; description: string }>;
}

export interface RegionalAppDetails {
  us?: SteamAppDetails;
  tr?: SteamAppDetails;
}

// Steam API returns data keyed by appid with a success flag
interface SteamApiResponse {
  [appid: string]: {
    success: boolean;
    data?: SteamAppDetails;
  };
}

// We cache by appid_region (e.g. "123_us" or "123_tr")
const STEAM_DETAIL_CACHE: Map<string, { data: SteamAppDetails; ts: number }> = new Map();
const STEAM_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h — descriptions rarely change

export async function getAppDetails(
  appIds: number[]
): Promise<Map<number, RegionalAppDetails>> {
  const result = new Map<number, RegionalAppDetails>();
  const toFetch: { appid: number; cc: 'us' | 'tr' }[] = [];

  // Initialize map and check in-memory cache first
  const now = Date.now();
  for (const id of appIds) {
    result.set(id, {});
    
    for (const cc of ['us', 'tr'] as const) {
      const cacheKey = `${id}_${cc}`;
      const cached = STEAM_DETAIL_CACHE.get(cacheKey);
      if (cached && now - cached.ts < STEAM_CACHE_TTL) {
        result.get(id)![cc] = cached.data;
      } else {
        toFetch.push({ appid: id, cc });
      }
    }
  }

  // Fetch missing ones — Steam API is one-at-a-time but we batch with concurrency limit
  // Fetch missing ones — Steam API is one-at-a-time but we batch with concurrency limit
  const CONCURRENCY = 6; // slightly higher since we fetch 2 per game
  for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
    const batch = toFetch.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async ({ appid, cc }) => {
        try {
          const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=${cc}&l=en`;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10_000);
          const res = await fetch(url, { signal: controller.signal });
          clearTimeout(timeout);

          if (!res.ok) return;

          const json: SteamApiResponse = await res.json();
          const entry = json[String(appid)];
          if (entry?.success && entry.data) {
            STEAM_DETAIL_CACHE.set(`${appid}_${cc}`, { data: entry.data, ts: Date.now() });
            result.get(appid)![cc] = entry.data;
          }
        } catch {
          // Non-fatal — we just skip this game's details
        }
      })
    );

    // Polite delay between batches to avoid Steam rate-limiting
    if (i + CONCURRENCY < toFetch.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return result;
}
